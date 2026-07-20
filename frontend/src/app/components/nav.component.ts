import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../services/auth.service';

interface NavItem {
  path: string;
  labelKey: string;
}

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [NgClass, RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="app-nav">
      <a class="nav-brand" routerLink="/jobs" (click)="close()">{{ 'common.brand' | transloco }}</a>

      <button
        class="nav-toggle"
        type="button"
        [attr.aria-label]="'nav.menu' | transloco"
        [attr.aria-expanded]="menuOpen()"
        (click)="toggle()"
      >
        <i class="pi" [ngClass]="menuOpen() ? 'pi-times' : 'pi-bars'"></i>
      </button>

      <div class="nav-links" [class.open]="menuOpen()">
        @for (item of items; track item.path) {
          <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" (click)="close()">
            {{ item.labelKey | transloco }}
          </a>
        }
        <a class="nav-link nav-profile" routerLink="/profile" routerLinkActive="active" (click)="close()">
          <i class="pi pi-user"></i>
          <span>{{ currentUser()?.username ?? ('nav.profile' | transloco) }}</span>
        </a>
      </div>
    </nav>

    @if (menuOpen()) {
      <div class="nav-backdrop" (click)="close()"></div>
    }
  `,
  styles: [`
    .app-nav {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 24px;
      background: var(--app-surface);
      border-bottom: 1px solid var(--app-border);
    }
    .nav-brand {
      font-weight: 700;
      font-size: 1.05rem;
      color: var(--app-text);
      text-decoration: none;
      white-space: nowrap;
    }
    .nav-toggle {
      display: none;
      margin-left: auto;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--app-text);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 8px;
    }
    .nav-toggle:hover { background: var(--app-surface-muted); }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .nav-link {
      padding: 8px 14px;
      border-radius: 8px;
      color: var(--app-text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .nav-link:hover { color: var(--app-text); background: var(--app-surface-muted); }
    .nav-link.active { color: var(--app-primary); background: var(--app-primary-soft); }
    .nav-profile {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-backdrop { display: none; }

    @media (max-width: 768px) {
      .nav-toggle { display: inline-flex; }
      .nav-links {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        display: none;
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
        padding: 8px;
        background: var(--app-surface);
        border-bottom: 1px solid var(--app-border);
        box-shadow: var(--app-shadow);
      }
      .nav-links.open { display: flex; }
      .nav-link { padding: 12px 14px; }
      .nav-profile { margin-left: 0; }
      .nav-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 40;
      }
    }
  `]
})
export class NavComponent {
  private readonly auth = inject(AuthService);

  readonly currentUser = this.auth.currentUser;
  readonly menuOpen = signal(false);

  readonly items: NavItem[] = [
    { path: '/jobs', labelKey: 'nav.jobs' },
    { path: '/ingest', labelKey: 'nav.ingest' },
    { path: '/chat', labelKey: 'nav.chat' },
    { path: '/review', labelKey: 'nav.review' },
    { path: '/git', labelKey: 'nav.changes' },
    { path: '/explorer', labelKey: 'nav.explorer' },
    { path: '/settings', labelKey: 'nav.settings' },
  ];

  toggle(): void {
    this.menuOpen.update(v => !v);
  }

  close(): void {
    this.menuOpen.set(false);
  }
}
