import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService, ConnectionCandidate } from '../services/api.service';
import { JobsStore } from '../services/jobs.store';
import { JobState } from '../types';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, InputText, TagModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="review">
      @if (awaitingJobs().length === 0) {
        <p class="empty">{{ 'review.empty' | transloco }}</p>
      }
      @for (job of awaitingJobs(); track job.id) {
        <div class="review-card">
          <div class="review-header">
            <span class="job-label">{{ 'review.jobLabel' | transloco: { id: job.id } }}</span>
            <p-tag value="AWAITING_REVIEW" severity="warn" />
          </div>

          @if (loaded().get(job.id)) {
            <div class="candidates">
              <div class="candidates-title">{{ 'review.connectionCandidates' | transloco }}</div>
              @for (c of candidates().get(job.id) ?? []; track c.id) {
                <div class="candidate">
                  <p-checkbox [(ngModel)]="checkedMap[job.id + ':' + c.id]" [binary]="true" />
                  <div class="candidate-info">
                    <span class="candidate-target">{{ c.targetPath }}</span>
                    <span class="candidate-link">→ {{ c.proposedLink }}</span>
                    <span class="candidate-score">{{ c.source }} ({{ (c.score * 100).toFixed(0) }}%)</span>
                  </div>
                </div>
              }
              @if ((candidates().get(job.id) ?? []).length === 0) {
                <p class="no-candidates">{{ 'review.noCandidates' | transloco }}</p>
              }
            </div>

            <div class="manual-picker">
              <div class="picker-title">{{ 'review.manualConnections' | transloco }}</div>
              <div class="picker-row">
                <input pInputText type="text" [ngModel]="fileSearchQuery[job.id]" (ngModelChange)="fileSearchQuery[job.id] = $event"
                       [placeholder]="'review.searchFiles' | transloco" (input)="searchFiles(job.id)" class="search-input" />
              </div>
              @if (fileResults().get(job.id)?.length) {
                <div class="file-results">
                  @for (f of fileResults().get(job.id)!; track f.path) {
                    <div class="file-result">
                      <p-checkbox [(ngModel)]="manualChecked[job.id + ':' + f.path]" [binary]="true" />
                      <span class="file-path">{{ f.path }}</span>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="review-actions">
              <button pButton type="button" [label]="'review.submitReview' | transloco" icon="pi pi-check"
                      [disabled]="submitting()" (click)="submitReview(job)"></button>
            </div>
          } @else {
            <button pButton type="button" [label]="'review.loadCandidates' | transloco" severity="secondary"
                    (click)="loadCandidates(job)"></button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .review { display: grid; gap: 16px; }
    .empty { color: #5d6878; margin: 0; }
    .review-card {
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 14px;
      background: #fffbeb;
      display: grid;
      gap: 14px;
    }
    .review-header { display: flex; align-items: center; gap: 10px; }
    .job-label { font-family: monospace; font-size: 0.82rem; }
    .candidates, .manual-picker { display: grid; gap: 8px; }
    .candidates-title, .picker-title { font-weight: 600; font-size: 0.85rem; }
    .candidate { display: flex; align-items: flex-start; gap: 8px; }
    .candidate-info { display: flex; flex-direction: column; gap: 2px; font-size: 0.82rem; }
    .candidate-target { font-family: monospace; font-weight: 500; }
    .candidate-link { color: #5d6878; font-family: monospace; }
    .candidate-score { font-size: 0.75rem; color: #8a95a3; }
    .no-candidates { color: #5d6878; font-size: 0.82rem; margin: 0; }
    .picker-row { display: flex; gap: 8px; }
    .search-input { flex: 1; }
    .file-results { display: grid; gap: 4px; }
    .file-result { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; }
    .file-path { font-family: monospace; }
    .review-actions { display: flex; justify-content: flex-end; }
  `]
})
export class ReviewComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(JobsStore);

  readonly candidates = signal<Map<string, ConnectionCandidate[]>>(new Map());
  readonly fileResults = signal<Map<string, Array<{path: string}>>>(new Map());
  readonly loaded = signal<Map<string, boolean>>(new Map());
  readonly submitting = signal(false);

  readonly checkedMap: Record<string, boolean> = {};
  readonly manualChecked: Record<string, boolean> = {};
  readonly fileSearchQuery: Record<string, string> = {};

  readonly awaitingJobs = computed(() =>
    [...this.store.jobs().values()].filter(j => j.status === 'AWAITING_REVIEW')
  );

  loadCandidates(job: JobState): void {
    this.api.getReviewCandidates(job.id).subscribe({
      next: list => {
        this.candidates.update(m => { const n = new Map(m); n.set(job.id, list); return n; });
        this.loaded.update(m => { const n = new Map(m); n.set(job.id, true); return n; });
      },
    });
  }

  searchFiles(jobId: string): void {
    const q = this.fileSearchQuery[jobId] ?? '';
    if (q.length < 2) {
      this.fileResults.update(m => { const n = new Map(m); n.set(jobId, []); return n; });
      return;
    }
    this.api.lookupFiles(q).subscribe({
      next: results => {
        this.fileResults.update(m => { const n = new Map(m); n.set(jobId, results); return n; });
      },
    });
  }

  submitReview(job: JobState): void {
    const allCandidates = this.candidates().get(job.id) ?? [];
    const decisions = allCandidates.map(c => ({
      candidateId: c.id,
      decision: this.checkedMap[job.id + ':' + c.id] ? 'accepted' as const : 'rejected' as const,
    }));

    const manualPaths = (this.fileResults().get(job.id) ?? [])
        .filter(f => this.manualChecked[job.id + ':' + f.path])
        .map(f => f.path);

    this.submitting.set(true);
    this.api.submitReview(job.id, { decisions, manualTargetPaths: manualPaths }).subscribe({
      next: () => this.submitting.set(false),
      error: () => this.submitting.set(false),
    });
  }
}
