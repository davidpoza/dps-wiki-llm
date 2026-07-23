import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ChatComponent } from './chat.component';
import { GitHistoryComponent } from './git-history.component';
import { IngestComponent } from './ingest.component';
import { JobsViewerComponent } from './jobs-viewer.component';
import { NavComponent } from './nav.component';
import { ReviewComponent } from './review.component';
import { JobsStore } from '../services/jobs.store';

type Tab = 'jobs' | 'ingest' | 'chat' | 'review' | 'git';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NavComponent, ChatComponent, GitHistoryComponent, IngestComponent, JobsViewerComponent, ReviewComponent],
  template: `
    <main class="app-shell">
      <app-nav />
      <section class="workspace" [class.full-bleed]="activeTab() === 'chat'">
        <div class="tab-content" [class.full-bleed]="activeTab() === 'chat'">
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
            @case ('git') {
              <app-git-history />
            }
          }
        </div>
      </section>
    </main>
  `,
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly store = inject(JobsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly activeTab = signal<Tab>('jobs');

  private readonly tabs: Tab[] = ['jobs', 'ingest', 'chat', 'review', 'git'];

  ngOnInit(): void {
    this.store.connect();
    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((segments) => {
      const tab = segments[0]?.path as Tab | undefined;
      if (tab && this.tabs.includes(tab)) {
        this.activeTab.set(tab);
      }
    });
  }
}
