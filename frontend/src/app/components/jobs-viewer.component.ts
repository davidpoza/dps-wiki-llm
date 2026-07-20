import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../services/api.service';
import { JobsStore } from '../services/jobs.store';
import { JobState, JobStatus } from '../types';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-jobs-viewer',
  standalone: true,
  imports: [ButtonModule, TagModule, TranslocoPipe, DatePipe, PaginatorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="jobs-viewer">
      <div class="jobs-list">
        @if (sortedJobs().length === 0) {
          <p class="empty">{{ 'jobs.empty' | transloco }}</p>
        }
        @for (job of page(); track job.id) {
          <div class="job-card">
            <div class="job-header">
              <span class="job-type">{{ job.type }}</span>
              <p-tag [value]="job.status" [severity]="severity(job.status)" />
              @if (job.createdAt) {
                <span class="job-date">{{ job.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
              }
              @if (canRevert(job)) {
                <button pButton type="button" [label]="'jobs.revert' | transloco" severity="danger" size="small"
                        (click)="revert(job.id)"></button>
              }
              @if (canCancel(job)) {
                <button pButton type="button" [label]="'common.cancel' | transloco" severity="warn" size="small"
                        (click)="cancel(job.id)"></button>
              }
            </div>
            <div class="job-id">{{ job.id }}</div>

            @if (job.phases.length > 0) {
              <div class="phases">
                @for (phase of job.phases; track phase.step) {
                  <div class="phase">
                    <span class="phase-step">{{ phase.step }}</span>
                    <span class="phase-msg">{{ phase.message }}</span>
                  </div>
                }
              </div>
            }

            @if (job.currentActivity) {
              <div class="scan-activity">
                <span class="scan-label">{{ job.currentActivity.label }}</span>
                @if (job.currentActivity.path) {
                  <span class="scan-path">{{ job.currentActivity.path }}</span>
                }
                <span class="scan-percent">({{ job.currentActivity.percent }}%)</span>
              </div>
            }

            @if (job.files.length > 0) {
              <div class="files">
                <div class="files-title">{{ 'jobs.files' | transloco }}</div>
                @for (f of job.files; track f.path) {
                  <div class="file-entry">
                    <span class="file-action" [class]="'action-' + f.action">{{ f.action }}</span>
                    <span class="file-path">{{ f.path }}</span>
                  </div>
                }
              </div>
            }

            @if (job.error) {
              <div class="job-error">{{ job.error }}</div>
            }

            @if (job.status === 'AWAITING_REVIEW') {
              <div class="review-notice">
                {{ 'jobs.awaitingReview' | transloco }}
              </div>
            }
          </div>
        }
      </div>

      @if (sortedJobs().length > pageSize) {
        <p-paginator
          [rows]="pageSize"
          [totalRecords]="sortedJobs().length"
          [first]="first()"
          (onPageChange)="onPage($event)"
        />
      }
    </div>
  `,
  styles: [`
    .jobs-viewer { display: grid; gap: 12px; }
    .jobs-list { display: grid; gap: 12px; overflow-y: auto; padding: 4px 2px; align-content: start; max-height: calc(100vh - 240px); }
    .empty { color: var(--app-text-muted); margin: 0; }
    .job-card {
      border: 1px solid var(--app-border);
      border-radius: 8px;
      padding: 14px;
      background: var(--app-surface);
      display: grid;
      gap: 8px;
    }
    .job-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .job-type { font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .job-date { font-size: 0.78rem; color: var(--app-text-subtle); margin-left: auto; }
    .job-id { font-size: 0.75rem; color: var(--app-text-subtle); font-family: monospace; }
    .phases { display: grid; gap: 4px; font-size: 0.82rem; }
    .phase { display: flex; gap: 8px; }
    .phase-step { color: var(--app-text-muted); min-width: 120px; font-weight: 500; }
    .phase-msg { color: var(--app-text); }
    .files { font-size: 0.8rem; }
    .files-title { font-weight: 600; color: var(--app-text-muted); margin-bottom: 4px; }
    .file-entry { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
    .file-action { font-size: 0.72rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; color: #fff;
      text-transform: uppercase; letter-spacing: 0.04em; }
    .action-create { background: #22c55e; }
    .action-update { background: var(--app-primary); }
    .action-read { background: #94a3b8; }
    .action-modified { background: #8b5cf6; }
    .file-path { font-family: monospace; }
    .job-error { color: var(--app-error-text); font-size: 0.85rem; padding: 6px; background: var(--app-error-bg); border-radius: 4px; }
    .review-notice { color: var(--app-warning-text); font-size: 0.85rem; padding: 6px; background: var(--app-warning-bg); border-radius: 4px; }
    .scan-activity { display: flex; gap: 8px; align-items: baseline; font-size: 0.8rem; }
    .scan-label { color: var(--app-text-muted); font-weight: 500; min-width: 60px; }
    .scan-path { font-family: monospace; color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scan-percent { color: var(--app-text-muted); white-space: nowrap; }
  `]
})
export class JobsViewerComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(JobsStore);

  readonly pageSize = PAGE_SIZE;
  readonly first = signal(0);

  private readonly ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set(['QUEUED', 'STARTED', 'PROGRESS', 'AWAITING_REVIEW']);

  readonly sortedJobs = computed(() =>
    [...this.store.jobs().values()].sort((a, b) => {
      const aActive = this.ACTIVE_STATUSES.has(a.status) ? 0 : 1;
      const bActive = this.ACTIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      return tb - ta;
    })
  );

  readonly page = computed(() =>
    this.sortedJobs().slice(this.first(), this.first() + this.pageSize)
  );

  onPage(e: PaginatorState): void {
    this.first.set(e.first ?? 0);
  }

  severity(status: JobStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'FAILED': return 'danger';
      case 'AWAITING_REVIEW': return 'warn';
      case 'REVERTED': return 'secondary';
      case 'CANCELLED': return 'secondary';
      case 'QUEUED': return 'info';
      default: return 'info';
    }
  }

  canRevert(job: JobState): boolean {
    return job.status === 'COMPLETED' && job.type === 'INGEST';
  }

  revert(jobId: string): void {
    this.api.enqueueRevert(jobId).subscribe({ error: err => console.error('Revert failed', err) });
  }

  canCancel(job: JobState): boolean {
    return job.status === 'QUEUED';
  }

  cancel(jobId: string): void {
    this.api.cancelJob(jobId).subscribe({ error: err => console.error('Cancel failed', err) });
  }
}
