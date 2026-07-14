import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { JobState, JobStatus, SseJobEvent } from '../types';
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
      next: jobs => this.mergeHistory(jobs),
      error: () => {},
    });
    this.openEventSource();
  }

  private mergeHistory(jobs: JobSummary[]): void {
    this.jobs.update(map => {
      const updated = new Map(map);
      for (const j of jobs) {
        if (!updated.has(j.id)) {
          updated.set(j.id, {
            id: j.id,
            type: j.type,
            status: j.status as JobStatus,
            phases: [],
            files: [],
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt ?? undefined,
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
      'QUEUED', 'STARTED', 'PROGRESS', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED', 'REVERTED'
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
    this.jobs.update(map => {
      const updated = new Map(map);
      const existing: JobState = updated.get(event.jobId) ?? {
        id: event.jobId,
        type: event.jobType,
        status,
        queuePosition: event.queuePosition,
        phases: [],
        files: [],
      };

      const next: JobState = { ...existing, status, queuePosition: event.queuePosition };

      if (event.step === 'file' && event.path) {
        next.files = [...existing.files, { path: event.path, action: event.action ?? 'read' }];
      } else if (event.message) {
        next.phases = [...existing.phases, { step: event.step, message: event.message }];
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
    }
  }

  private refetchJob(jobId: string): void {
    this.api.getJob(jobId).subscribe({
      next: job => {
        this.jobs.update(map => {
          const updated = new Map(map);
          const existing = updated.get(jobId);
          if (existing) {
            updated.set(jobId, {
              ...existing,
              status: job.status as JobStatus,
              result: job.result ?? existing.result,
              error: job.error ?? existing.error,
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
