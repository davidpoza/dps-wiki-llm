import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ChatComponent } from './chat.component';
import { IngestComponent } from './ingest.component';
import { JobsViewerComponent } from './jobs-viewer.component';
import { ReviewComponent } from './review.component';
import { AuthService } from '../services/auth.service';
import { JobsStore } from '../services/jobs.store';

type Tab = 'jobs' | 'ingest' | 'chat' | 'review';

@Component({
  selector: 'app-home',
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
          <div class="topbar-actions">
            @if (currentUser()) {
              <span class="username">{{ currentUser()?.username }}</span>
            }
            <p-button
              severity="secondary"
              label="Explorer"
              size="small"
              (onClick)="goToExplorer()"
            />
            <p-button
              severity="secondary"
              label="Sign out"
              size="small"
              (onClick)="logout()"
            />
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
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit {
  private readonly store = inject(JobsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentUser = this.auth.currentUser;

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

  goToExplorer(): void {
    this.router.navigateByUrl('/explorer');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
