import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ApiService } from './api.service';
import { JobsStore } from './jobs.store';
import { Conflict, JobState } from '../types';

/** Live progress of the running sync, derived from the shared job event stream. */
export interface SyncProgress {
  percent: number;
  path?: string;
}

/** Terminal outcome of a sync, shown as the toast summary. */
export interface SyncResultSummary {
  ok: boolean;
  message: string;
}

/**
 * Single source of truth for WebDAV sync + conflict resolution, shared by the global nav control
 * and the Changes (`/git`) page. Owns the enqueue → track-job → load-conflicts orchestration that
 * previously lived inside `GitHistoryComponent`, so there is never more than one active sync or one
 * conflict dialog. Progress is read from the shared {@link JobsStore} (SSE) rather than a separate
 * connection.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly jobsStore = inject(JobsStore);
  private readonly t = inject(TranslocoService);

  readonly syncing = signal(false);
  readonly progress = signal<SyncProgress | null>(null);
  readonly result = signal<SyncResultSummary | null>(null);

  readonly conflicts = signal<Conflict[]>([]);
  readonly showConflicts = signal(false);
  readonly totalConflicts = signal(0);
  readonly resolvedCount = computed(() => this.totalConflicts() - this.conflicts().length);
  readonly expandedConflicts = signal<Set<string>>(new Set());
  readonly activeManualConflict = signal<Conflict | null>(null);

  /** Bumped whenever the vault changed (sync completed or a conflict was resolved) so views refresh. */
  readonly changed = signal(0);

  private readonly pendingSyncJobId = signal<string | null>(null);

  constructor() {
    // Track the enqueued SYNC job through the shared job store: mirror live progress, and react to
    // its terminal state (load conflicts on success, surface an error otherwise).
    effect(() => {
      const id = this.pendingSyncJobId();
      if (!id) return;
      const job = this.jobsStore.jobs().get(id);
      if (!job) return;

      if (job.status === 'COMPLETED') {
        untracked(() => {
          this.pendingSyncJobId.set(null);
          this.onSyncJobDone(job);
        });
        return;
      }
      if (job.status === 'FAILED') {
        untracked(() => {
          this.pendingSyncJobId.set(null);
          this.syncing.set(false);
          this.progress.set(null);
          const err = job.error ?? '';
          const key = /not configured/i.test(err) ? 'sync.notConfigured' : 'sync.error';
          this.result.set({ ok: false, message: this.t.translate(key) });
        });
        return;
      }

      // In-progress: reflect the current scan activity as live progress.
      const activity = job.currentActivity;
      if (activity) {
        untracked(() => this.progress.set({ percent: activity.percent, path: activity.path }));
      }
    });
  }

  /** Enqueue a sync. No-op while one is already running (single-flight). */
  startSync(): void {
    if (this.syncing()) return;
    this.jobsStore.connect(); // idempotent; ensures progress events are received on any screen
    this.syncing.set(true);
    this.progress.set({ percent: 0 });
    this.result.set(null);
    this.api.enqueueSync().subscribe({
      next: (res) => this.pendingSyncJobId.set(res.jobId),
      error: () => {
        this.syncing.set(false);
        this.progress.set(null);
        this.result.set({ ok: false, message: this.t.translate('sync.error') });
      },
    });
  }

  dismissResult(): void {
    this.result.set(null);
  }

  private onSyncJobDone(job: JobState): void {
    this.syncing.set(false);
    this.progress.set(null);
    this.result.set({ ok: true, message: this.buildSummary(job) });
    this.changed.update((v) => v + 1);
    this.loadConflicts();
  }

  /**
   * Build the success summary from the completed job's stored result message. The backend message
   * (`"... N pulled, N pushed, N deleted, N conflicts"`) carries locale-stable count keywords, so we
   * parse them and render the localized `sync.summary`; fall back to the raw message if the shape
   * is unexpected. Uses `job.result` (persisted) rather than `currentActivity` (cleared ~1.5s after
   * the terminal state by `JobsStore`).
   */
  private buildSummary(job: JobState): string {
    try {
      const parsed = JSON.parse(job.result ?? '{}') as { message?: string };
      if (parsed.message) {
        const m = parsed.message.match(
          /(\d+)\s+pulled,\s*(\d+)\s+pushed,\s*(\d+)\s+deleted,\s*(\d+)\s+conflicts/,
        );
        if (m) {
          return this.t.translate('sync.summary', {
            pulled: m[1],
            pushed: m[2],
            deleted: m[3],
            conflicts: m[4],
          });
        }
        return parsed.message;
      }
    } catch {
      // fall through to default
    }
    return this.t.translate('sync.enqueued');
  }

  private loadConflicts(): void {
    this.api.getConflicts().subscribe({
      next: (conflicts) => {
        this.conflicts.set(conflicts);
        this.totalConflicts.set(conflicts.length);
        this.expandedConflicts.set(new Set());
        this.showConflicts.set(conflicts.length > 0);
      },
      error: () => {
        this.result.set({ ok: false, message: this.t.translate('sync.error') });
      },
    });
  }

  resolve(path: string, keep: 'LOCAL' | 'REMOTE' | 'SKIP' | 'MANUAL', content?: string): void {
    this.api.resolveConflict(path, keep, content).subscribe({
      next: () => {
        const remaining = this.conflicts().filter((c) => c.path !== path);
        this.conflicts.set(remaining);
        if (remaining.length === 0) {
          this.showConflicts.set(false);
        }
        if (keep !== 'SKIP') {
          this.changed.update((v) => v + 1);
        }
      },
      error: () => {
        this.result.set({ ok: false, message: this.t.translate('sync.resolveError') });
      },
    });
  }

  resolveAll(keep: 'LOCAL' | 'REMOTE'): void {
    const all = [...this.conflicts()];
    const errors: string[] = [];
    let remaining = all.length;
    const done = () => {
      remaining--;
      if (remaining === 0 && errors.length > 0) {
        this.result.set({ ok: false, message: this.t.translate('sync.bulkError') });
      }
    };
    for (const c of all) {
      this.api.resolveConflict(c.path, keep).subscribe({
        next: () => {
          this.conflicts.update((list) => list.filter((x) => x.path !== c.path));
          if (this.conflicts().length === 0) this.showConflicts.set(false);
          this.changed.update((v) => v + 1);
          done();
        },
        error: () => {
          errors.push(c.path);
          done();
        },
      });
    }
  }

  toggleExpand(path: string): void {
    this.expandedConflicts.update((set) => {
      const next = new Set(set);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  openMergeEditor(conflict: Conflict): void {
    this.activeManualConflict.set(conflict);
  }

  cancelMergeEditor(): void {
    this.activeManualConflict.set(null);
  }

  onManualResolved(path: string, content: string): void {
    this.activeManualConflict.set(null);
    this.resolve(path, 'MANUAL', content);
  }
}
