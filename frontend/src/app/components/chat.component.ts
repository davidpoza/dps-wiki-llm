import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../services/api.service';
import { JobsStore } from '../services/jobs.store';
import { JobState } from '../types';

interface AnswerView {
  question: string;
  jobId: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, ButtonModule, Textarea, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <div class="input-area">
        <textarea pTextarea [ngModel]="question()" (ngModelChange)="question.set($event)" [autoResize]="true" rows="3"
                  placeholder="Ask a question about your knowledge base…"
                  (keydown.ctrl.enter)="submit()" class="question-input"></textarea>
        <button pButton type="button" label="Ask" icon="pi pi-send"
                [disabled]="!question().trim() || submitting()"
                (click)="submit()"></button>
      </div>

      @for (answer of answerList(); track answer.jobId) {
        @let job = jobState(answer.jobId);
        <div class="answer-card">
          <div class="answer-question">{{ answer.question }}</div>
          @if (job) {
            <div class="answer-status">
              <p-tag [value]="job.status" [severity]="statusSeverity(job.status)" />
            </div>
            @if (job.status === 'COMPLETED' && job.result) {
              <div class="answer-body">{{ parseAnswer(job.result!) }}</div>
              @if (evidencePaths(job).length > 0) {
                <div class="evidence">
                  <span class="evidence-label">Evidence:</span>
                  @for (path of evidencePaths(job); track path) {
                    <span class="evidence-path">{{ path }}</span>
                  }
                </div>
              }
            } @else if (job.status === 'FAILED') {
              <div class="error">{{ job.error }}</div>
            } @else {
              <div class="progress-list">
                @for (phase of job.phases; track phase.step) {
                  <div class="progress-phase">{{ phase.message }}</div>
                }
              </div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .chat { display: grid; gap: 16px; }
    .input-area { display: grid; gap: 8px; }
    .question-input { width: 100%; resize: vertical; }
    .answer-card {
      border: 1px solid #e2e5ea;
      border-radius: 8px;
      padding: 14px;
      background: #fff;
      display: grid;
      gap: 10px;
    }
    .answer-question { font-weight: 600; color: #18212f; }
    .answer-status { display: flex; }
    .answer-body { font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; }
    .evidence { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.8rem; }
    .evidence-label { color: #5d6878; font-weight: 600; }
    .evidence-path { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    .error { color: #ef4444; font-size: 0.85rem; }
    .progress-list { display: grid; gap: 4px; font-size: 0.82rem; color: #5d6878; }
    .progress-phase::before { content: '⏳ '; }
  `]
})
export class ChatComponent {
  private readonly api = inject(ApiService);
  private readonly store = inject(JobsStore);

  readonly question = signal('');
  readonly submitting = signal(false);
  readonly answers = signal<AnswerView[]>([]);

  readonly answerList = computed(() => [...this.answers()].reverse());

  submit(): void {
    const q = this.question().trim();
    if (!q) return;
    this.submitting.set(true);
    this.api.enqueueAnswer(q).subscribe({
      next: res => {
        this.answers.update(list => [...list, { question: q, jobId: res.jobId }]);
        this.question.set('');
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }

  jobState(jobId: string): JobState | undefined {
    return this.store.jobs().get(jobId);
  }

  statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'FAILED': return 'danger';
      default: return 'info';
    }
  }

  parseAnswer(result: string): string {
    try {
      const parsed = JSON.parse(result);
      return parsed.message ?? result;
    } catch {
      return result;
    }
  }

  evidencePaths(job: JobState): string[] {
    try {
      const parsed = JSON.parse(job.result ?? '{}');
      return parsed.evidencePaths ?? [];
    } catch {
      return [];
    }
  }
}
