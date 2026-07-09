import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ChatComponent } from './components/chat.component';
import { IngestComponent } from './components/ingest.component';
import { JobsViewerComponent } from './components/jobs-viewer.component';
import { ReviewComponent } from './components/review.component';
import { JobsStore } from './services/jobs.store';

type Tab = 'jobs' | 'ingest' | 'chat' | 'review';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ButtonModule, ChatComponent, IngestComponent, JobsViewerComponent, ReviewComponent],
  template: `
    <main class="app-shell">
      <section class="workspace">
        <header class="topbar">
          <div class="brand">
            <h1>DPS Wiki</h1>
            <p>Knowledge pipeline</p>
          </div>
        </header>

        <nav class="tabs">
          @for (tab of tabDefs; track tab.id) {
            <button class="tab-btn" [class.active]="activeTab() === tab.id" (click)="activeTab.set(tab.id)">
              {{ tab.label }}
              @if (tab.id === 'review' && reviewCount() > 0) {
                <span class="badge">{{ reviewCount() }}</span>
              }
            </button>
          }
        </nav>

        <div class="tab-content">
          @switch (activeTab()) {
            @case ('jobs') {
              <app-jobs-viewer />
            }
            @case ('ingest') {
              <app-ingest />
            }
            @case ('chat') {
              <app-chat />
            }
            @case ('review') {
              <app-review />
            }
          }
        </div>
      </section>
    </main>
  `,
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  private readonly store = inject(JobsStore);

  readonly activeTab = signal<Tab>('jobs');

  readonly tabDefs: Array<{ id: Tab; label: string }> = [
    { id: 'jobs', label: 'Jobs' },
    { id: 'ingest', label: 'Ingest' },
    { id: 'chat', label: 'Chat' },
    { id: 'review', label: 'Review' },
  ];

  readonly reviewCount = computed(() =>
    [...this.store.jobs().values()].filter(j => j.status === 'AWAITING_REVIEW').length
  );

  ngOnInit(): void {
    this.store.connect();
  }
}
