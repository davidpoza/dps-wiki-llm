import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
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
                <span class="job-date">{{ job.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
              }
              @if (canRevert(job)) {
                <button
                  pButton
                  type="button"
                  [label]="'jobs.revert' | transloco"
                  severity="danger"
                  size="small"
                  (click)="revert(job.id)"
                ></button>
              }
              @if (canCancel(job)) {
                <button
                  pButton
                  type="button"
                  [label]="'common.cancel' | transloco"
                  severity="warn"
                  size="small"
                  (click)="cancel(job.id)"
                ></button>
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
                  <button class="path-btn" (click)="openFile(job.currentActivity.path)">
                    {{ job.currentActivity.path }}
                  </button>
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
                    <button class="path-btn" (click)="openFile(f.path)">{{ f.path }}</button>
                  </div>
                }
              </div>
            }

            @if (job.conceptProposals.length > 0) {
              <div class="concept-proposals">
                <div class="concept-proposals-title">{{ 'jobs.conceptProposals' | transloco }}</div>
                @for (p of job.conceptProposals; track p.proposedPath) {
                  <div class="concept-proposal-entry">
                    <span class="concept-badge" [class]="p.deduplicated ? 'badge-merged' : 'badge-new'">
                      {{ p.deduplicated ? ('jobs.conceptMerged' | transloco) : ('jobs.conceptNew' | transloco) }}
                    </span>
                    <span class="concept-title">{{ p.proposedTitle }}</span>
                    @if (p.deduplicated && p.resolvedPath) {
                      <span class="concept-arrow">→</span>
                      <button class="path-btn" (click)="openFile(p.resolvedPath!)">{{ p.resolvedPath }}</button>
                    } @else {
                      <button class="path-btn" (click)="openFile(p.proposedPath)">{{ p.proposedPath }}</button>
                    }
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
  styles: [
    `
      .jobs-viewer {
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr);
      }
      .jobs-list {
        display: grid;
        gap: 12px;
        padding: 4px 2px;
        align-content: start;
        grid-template-columns: minmax(0, 1fr);
      }
      .empty {
        color: var(--app-text-muted);
        margin: 0;
      }
      .job-card {
        border: 1px solid var(--app-border);
        border-radius: 8px;
        padding: 14px;
        background: var(--app-surface);
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(0, 1fr);
        overflow: hidden;
      }
      .job-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .job-type {
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .job-date {
        font-size: 0.78rem;
        color: var(--app-text-subtle);
        margin-left: auto;
      }
      .job-id {
        font-size: 0.75rem;
        color: var(--app-text-subtle);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .phases {
        display: grid;
        gap: 4px;
        font-size: 0.82rem;
      }
      .phase {
        display: flex;
        gap: 8px;
        min-width: 0;
      }
      .phase-step {
        color: var(--app-text-muted);
        min-width: 120px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .phase-msg {
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 0;
      }
      .files {
        font-size: 0.8rem;
      }
      .files-title {
        font-weight: 600;
        color: var(--app-text-muted);
        margin-bottom: 4px;
      }
      .file-entry {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 2px 0;
        min-width: 0;
      }
      .file-action {
        font-size: 0.72rem;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 600;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }
      .action-create {
        background: #22c55e;
      }
      .action-update {
        background: var(--app-primary);
      }
      .action-read {
        background: #94a3b8;
      }
      .action-modified {
        background: #8b5cf6;
      }
      .action-delete {
        background: #ef4444;
      }
      .path-btn {
        font-family: monospace;
        font-size: 0.8rem;
        background: none;
        border: none;
        padding: 0;
        color: var(--app-primary);
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1 1 0;
      }
      .path-btn:hover {
        text-decoration: underline;
      }
      .job-error {
        color: var(--app-error-text);
        font-size: 0.85rem;
        padding: 6px;
        background: var(--app-error-bg);
        border-radius: 4px;
      }
      .review-notice {
        color: var(--app-warning-text);
        font-size: 0.85rem;
        padding: 6px;
        background: var(--app-warning-bg);
        border-radius: 4px;
      }
      .scan-activity {
        display: flex;
        gap: 8px;
        align-items: baseline;
        font-size: 0.8rem;
        min-width: 0;
      }
      .scan-label {
        color: var(--app-text-muted);
        font-weight: 500;
        flex-shrink: 0;
      }
      .scan-percent {
        color: var(--app-text-muted);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .concept-proposals {
        font-size: 0.82rem;
        display: grid;
        gap: 4px;
      }
      .concept-proposals-title {
        font-weight: 600;
        color: var(--app-text-muted);
        margin-bottom: 2px;
      }
      .concept-proposal-entry {
        display: flex;
        gap: 6px;
        align-items: baseline;
        flex-wrap: wrap;
        min-width: 0;
      }
      .concept-badge {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 10px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .badge-new {
        background: #dcfce7;
        color: #166534;
      }
      .badge-merged {
        background: #ede9fe;
        color: #6d28d9;
      }
      .concept-title {
        font-weight: 500;
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        flex: 1 1 0;
      }
      .concept-arrow {
        color: var(--app-text-muted);
      }
    `,
  ],
})
export class JobsViewerComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(JobsStore);
  private readonly router = inject(Router);

  readonly pageSize = PAGE_SIZE;
  readonly first = signal(0);

  private readonly ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
    'QUEUED',
    'STARTED',
    'PROGRESS',
    'AWAITING_REVIEW',
  ]);

  readonly sortedJobs = computed(() =>
    [...this.store.jobs().values()].sort((a, b) => {
      const aActive = this.ACTIVE_STATUSES.has(a.status) ? 0 : 1;
      const bActive = this.ACTIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      return tb - ta;
    }),
  );

  readonly page = computed(() => this.sortedJobs().slice(this.first(), this.first() + this.pageSize));

  onPage(e: PaginatorState): void {
    this.first.set(e.first ?? 0);
  }

  severity(status: JobStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
        return 'danger';
      case 'AWAITING_REVIEW':
        return 'warn';
      case 'REVERTED':
        return 'secondary';
      case 'CANCELLED':
        return 'secondary';
      case 'QUEUED':
        return 'info';
      default:
        return 'info';
    }
  }

  canRevert(job: JobState): boolean {
    return job.status === 'COMPLETED' && job.type === 'INGEST';
  }

  revert(jobId: string): void {
    this.api.enqueueRevert(jobId).subscribe({ error: (err) => console.error('Revert failed', err) });
  }

  canCancel(job: JobState): boolean {
    return job.status === 'QUEUED';
  }

  cancel(jobId: string): void {
    this.api.cancelJob(jobId).subscribe({ error: (err) => console.error('Cancel failed', err) });
  }

  openFile(path: string): void {
    this.router.navigate(['explorer', ...path.split('/')]);
  }
}
