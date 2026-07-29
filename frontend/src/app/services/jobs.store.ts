import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { ConceptProposal, JobState, JobStatus, SseJobEvent } from '../types';
import { ApiService, JobSummary } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class JobsStore implements OnDestroy {
  readonly jobs = signal<Map<string, JobState>>(new Map());

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private eventSource?: EventSource;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly RECONNECT_DELAY = 3000;

  connect(): void {
    if (this.eventSource) {
      return;
    }
    this.api.getJobs().subscribe({
      next: (jobs) => this.mergeHistory(jobs),
      error: () => {},
    });
    this.openEventSource();
  }

  private mergeHistory(jobs: JobSummary[]): void {
    this.jobs.update((map) => {
      const updated = new Map(map);
      for (const j of jobs) {
        if (!updated.has(j.id)) {
          const files =
            j.fileEvents && j.fileEvents.length > 0
              ? j.fileEvents
              : (j.affectedPaths ?? []).map((path) => ({ path, action: 'modified' }));
          updated.set(j.id, {
            id: j.id,
            type: j.type,
            status: j.status as JobStatus,
            phases: [],
            files,
            conceptProposals: j.conceptProposals ?? [],
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt ?? undefined,
            totalTokens: j.totalTokens ?? null,
            promptTokens: j.promptTokens ?? null,
            completionTokens: j.completionTokens ?? null,
          });
        }
      }
      return updated;
    });
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = undefined;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private openEventSource(): void {
    const token = this.auth.token();
    const url = token ? `/api/jobs/events?token=${encodeURIComponent(token)}` : '/api/jobs/events';
    const es = new EventSource(url);
    this.eventSource = es;

    const statuses: JobStatus[] = [
      'QUEUED',
      'STARTED',
      'PROGRESS',
      'AWAITING_REVIEW',
      'COMPLETED',
      'FAILED',
      'REVERTED',
    ];
    for (const status of statuses) {
      es.addEventListener(status, (e: MessageEvent) => this.handleEvent(e, status));
    }

    es.onerror = () => {
      es.close();
      this.eventSource = undefined;
      this.reconnectTimer = setTimeout(() => this.openEventSource(), this.RECONNECT_DELAY);
    };
  }

  private handleEvent(e: MessageEvent, status: JobStatus): void {
    const event: SseJobEvent = JSON.parse(e.data);
    this.jobs.update((map) => {
      const updated = new Map(map);
      const existing: JobState = updated.get(event.jobId) ?? {
        id: event.jobId,
        type: event.jobType,
        status,
        queuePosition: event.queuePosition,
        phases: [],
        files: [],
        conceptProposals: [],
      };

      const next: JobState = { ...existing, status, queuePosition: event.queuePosition };

      if (event.step === 'file' && event.path) {
        next.files = [...existing.files, { path: event.path, action: event.action ?? 'read' }];
      } else if (event.step === 'concept-proposal' && event.result) {
        try {
          const proposal = JSON.parse(event.result) as ConceptProposal;
          next.conceptProposals = [...(existing.conceptProposals ?? []), proposal];
        } catch {
          // ignore malformed proposal
        }
      } else if (event.jobType === 'HEALTH_CHECK' && (event.step === 'embeddings' || event.step === 'connections')) {
        try {
          const prog = JSON.parse(event.result ?? '{}') as {
            processed?: number;
            total?: number;
            embeddingsBuilt?: number;
            connectionsFound?: number;
          };
          const percent = prog.total ? Math.round(((prog.processed ?? 0) / prog.total) * 100) : 0;
          const label = event.step === 'embeddings' ? 'Embeddings' : 'Conexiones';
          next.currentActivity = { label, percent };
        } catch {
          // ignore malformed progress
        }
      } else if (event.step?.endsWith('-scan') && event.message) {
        const isEmbedding = event.step === 'embedding-scan';
        const label = isEmbedding ? 'embeddings' : 'scanning';
        const path = isEmbedding ? undefined : event.message;
        let percent = 0;
        try {
          const prog = JSON.parse(event.result ?? '{}') as { current?: number; total?: number };
          percent = prog.total ? Math.round(((prog.current ?? 0) / prog.total) * 100) : 0;
        } catch {
          percent = 0;
        }
        next.currentActivity = { label, path, percent };
      } else if (event.step === 'progress' && event.message) {
        try {
          const prog = JSON.parse(event.message) as {
            processed?: number;
            total?: number;
            updated?: number;
            failed?: number;
          };
          const percent = prog.total ? Math.round(((prog.processed ?? 0) / prog.total) * 100) : 0;
          next.currentActivity = { label: 'progress', percent, updated: prog.updated, failed: prog.failed };
        } catch {
          const idx = existing.phases.findIndex((p) => p.step === event.step);
          if (idx >= 0) {
            const phases = [...existing.phases];
            phases[idx] = { step: event.step, message: event.message };
            next.phases = phases;
          } else {
            next.phases = [...existing.phases, { step: event.step, message: event.message }];
          }
        }
      } else if (event.message) {
        const idx = existing.phases.findIndex((p) => p.step === event.step);
        if (idx >= 0) {
          const phases = [...existing.phases];
          phases[idx] = { step: event.step, message: event.message };
          next.phases = phases;
        } else {
          next.phases = [...existing.phases, { step: event.step, message: event.message }];
        }
      }

      if (status === 'COMPLETED' || status === 'REVERTED') {
        next.result = event.result ?? undefined;
      }
      if (status === 'FAILED') {
        next.error = event.message ?? undefined;
      }

      updated.set(event.jobId, next);
      return updated;
    });

    if (this.isTerminal(status)) {
      this.refetchJob(event.jobId);
      const jobId = event.jobId;
      setTimeout(() => {
        this.jobs.update((map) => {
          const m = new Map(map);
          const j = m.get(jobId);
          if (j) m.set(jobId, { ...j, currentActivity: null });
          return m;
        });
      }, 1500);
    }
  }

  private refetchJob(jobId: string): void {
    this.api.getJobs().subscribe({
      next: (jobs) => {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return;
        this.jobs.update((map) => {
          const updated = new Map(map);
          const existing = updated.get(jobId);
          if (existing) {
            updated.set(jobId, {
              ...existing,
              error: job.error ?? existing.error,
              conceptProposals:
                (job.conceptProposals?.length ?? 0) > 0 ? job.conceptProposals! : existing.conceptProposals,
              totalTokens: job.totalTokens ?? existing.totalTokens ?? null,
              promptTokens: job.promptTokens ?? existing.promptTokens ?? null,
              completionTokens: job.completionTokens ?? existing.completionTokens ?? null,
            });
          }
          return updated;
        });
      },
      error: () => {},
    });
  }

  private isTerminal(status: JobStatus): boolean {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'REVERTED';
  }
}
