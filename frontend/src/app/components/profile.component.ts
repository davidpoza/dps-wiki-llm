import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService, LoginEvent, TwoFactorSetup } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputText, Password, TableModule, TagModule, TranslocoPipe, DatePipe],
  template: `
    <main class="app-shell">
      <section class="workspace">
        <header class="topbar">
          <div class="brand">
            <h1>{{ 'profile.title' | transloco }}</h1>
            <p>{{ 'profile.subtitle' | transloco }}</p>
          </div>
          <div class="topbar-actions">
            <p-button
              severity="secondary"
              [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
              [rounded]="true"
              [text]="true"
              size="small"
              [title]="theme.isDark() ? ('common.lightMode' | transloco) : ('common.darkMode' | transloco)"
              (onClick)="theme.toggle()"
            />
            <p-button severity="secondary" [label]="'common.home' | transloco" size="small" (onClick)="goHome()" />
            <p-button severity="secondary" [label]="'common.signOut' | transloco" size="small" (onClick)="logout()" />
          </div>
        </header>

        <section class="card">
          <h2>{{ 'profile.account' | transloco }}</h2>
          <div class="row">
            <span class="label">{{ 'login.username' | transloco }}</span>
            <span class="value">{{ currentUser()?.username }}</span>
          </div>
          <p-button [label]="'common.signOut' | transloco" severity="secondary" (onClick)="logout()" />
        </section>

        <section class="card">
          <h2>{{ 'profile.changePassword' | transloco }}</h2>
          <form (ngSubmit)="submitPassword()">
            <div class="field">
              <label for="currentPassword">{{ 'profile.currentPassword' | transloco }}</label>
              <p-password inputId="currentPassword" [(ngModel)]="currentPassword" name="currentPassword"
                [feedback]="false" [toggleMask]="true" autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="newPassword">{{ 'profile.newPassword' | transloco }}</label>
              <p-password inputId="newPassword" [(ngModel)]="newPassword" name="newPassword"
                [feedback]="true" [toggleMask]="true" autocomplete="new-password" />
            </div>
            @if (passwordError()) { <p class="error">{{ passwordError() }}</p> }
            @if (passwordSaved()) { <p class="success">{{ 'profile.passwordChanged' | transloco }}</p> }
            <p-button type="submit" [label]="'common.save' | transloco" [loading]="passwordLoading()" />
          </form>
        </section>

        <section class="card">
          <h2>{{ 'profile.twoFactor' | transloco }}</h2>
          @if (statusLoading()) {
            <p>{{ 'common.loading' | transloco }}</p>
          } @else {
            <div class="row">
              <span class="label">{{ 'profile.status' | transloco }}</span>
              <span class="value" [class.on]="twoFactorEnabled()">
                {{ (twoFactorEnabled() ? 'profile.enabled' : 'profile.disabled') | transloco }}
              </span>
            </div>

            @if (!twoFactorEnabled()) {
              @if (!setup()) {
                <p-button [label]="'profile.enable2fa' | transloco" [loading]="twoFactorLoading()" (onClick)="startSetup()" />
              } @else {
                <p class="hint">{{ 'profile.scanQr' | transloco }}</p>
                <img class="qr" [src]="setup()!.qrDataUri" alt="2FA QR code" />
                <p class="secret">{{ setup()!.secret }}</p>
                <div class="field">
                  <label for="confirmCode">{{ 'profile.enterCode' | transloco }}</label>
                  <input pInputText id="confirmCode" [(ngModel)]="confirmCode" name="confirmCode" inputmode="numeric" autocomplete="one-time-code" />
                </div>
                @if (twoFactorError()) { <p class="error">{{ twoFactorError() }}</p> }
                <div class="actions">
                  <p-button [label]="'profile.confirm' | transloco" [loading]="twoFactorLoading()" (onClick)="confirmSetup()" />
                  <p-button [label]="'common.cancel' | transloco" severity="secondary" (onClick)="cancelSetup()" />
                </div>
              }
            } @else {
              <p class="hint">{{ 'profile.disableHint' | transloco }}</p>
              <div class="field">
                <label for="disableCode">{{ 'profile.enterCode' | transloco }}</label>
                <input pInputText id="disableCode" [(ngModel)]="disableCode" name="disableCode" inputmode="numeric" autocomplete="one-time-code" />
              </div>
              @if (twoFactorError()) { <p class="error">{{ twoFactorError() }}</p> }
              <p-button [label]="'profile.disable2fa' | transloco" severity="danger" [loading]="twoFactorLoading()" (onClick)="disable()" />
            }
          }
        </section>

        <section class="card">
          <h2>{{ 'profile.loginHistory' | transloco }}</h2>
          @if (historyLoading()) {
            <p>{{ 'common.loading' | transloco }}</p>
          } @else {
            <p-table [value]="loginHistory()" [loading]="historyLoading()" styleClass="history-table">
              <ng-template pTemplate="header">
                <tr>
                  <th>{{ 'profile.loginHistoryDate' | transloco }}</th>
                  <th>{{ 'profile.loginHistoryIp' | transloco }}</th>
                  <th>{{ 'profile.loginHistoryCountry' | transloco }}</th>
                  <th>{{ 'profile.loginHistoryCity' | transloco }}</th>
                  <th>{{ 'profile.loginHistoryResult' | transloco }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-event>
                <tr>
                  <td>{{ event.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                  <td>{{ event.ipAddress || '—' }}</td>
                  <td>{{ event.country || '—' }}</td>
                  <td>{{ event.city || '—' }}</td>
                  <td>
                    @if (event.success) {
                      <p-tag severity="success" [value]="'profile.loginHistorySuccess' | transloco" />
                    } @else {
                      <p-tag severity="danger"
                             [value]="('profile.loginHistoryFailed' | transloco) + (event.failureReason ? ' · ' + event.failureReason : '')" />
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="5">{{ 'profile.loginHistoryEmpty' | transloco }}</td></tr>
              </ng-template>
            </p-table>
          }
        </section>
      </section>
    </main>
  `,
  styles: [`
    .app-shell { height: 100vh; overflow-y: auto; background: var(--app-bg); color: var(--app-text); }
    .workspace { max-width: 860px; margin: 0 auto; padding: 1.5rem; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .brand h1 { margin: 0; }
    .brand p { margin: 0; font-size: .875rem; opacity: .7; }
    .topbar-actions { display: flex; gap: .5rem; align-items: center; }
    .card { border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface);
      padding: 1.25rem; margin-bottom: 1.25rem; box-shadow: var(--app-shadow); }
    .card h2 { margin-top: 0; font-size: 1.1rem; }
    .row { display: flex; justify-content: space-between; margin-bottom: 1rem; }
    .label { opacity: .7; }
    .value.on { color: var(--p-green-500); font-weight: 600; }
    .field { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
    .field label { font-size: .875rem; font-weight: 500; }
    .actions { display: flex; gap: .5rem; }
    .error { color: var(--p-red-500); font-size: .875rem; }
    .success { color: var(--p-green-500); font-size: .875rem; }
    .hint { font-size: .875rem; opacity: .8; }
    .qr { display: block; width: 200px; height: 200px; margin: .5rem 0; }
    .secret { font-family: monospace; letter-spacing: 1px; word-break: break-all; margin-bottom: 1rem; }
    p-password, :host ::ng-deep .p-password, :host ::ng-deep .p-password input { width: 100%; }
    :host ::ng-deep .history-table { font-size: .875rem; }
    :host ::ng-deep .history-table th { font-weight: 600; white-space: nowrap; }
    :host ::ng-deep .history-table td { vertical-align: middle; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);
  readonly theme = inject(ThemeService);

  readonly currentUser = this.auth.currentUser;

  currentPassword = '';
  newPassword = '';
  readonly passwordLoading = signal(false);
  readonly passwordError = signal('');
  readonly passwordSaved = signal(false);

  readonly statusLoading = signal(true);
  readonly twoFactorEnabled = signal(false);
  readonly setup = signal<TwoFactorSetup | null>(null);
  confirmCode = '';
  disableCode = '';
  readonly twoFactorLoading = signal(false);
  readonly twoFactorError = signal('');

  readonly loginHistory = signal<LoginEvent[]>([]);
  readonly historyLoading = signal(true);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.refreshStatus(), this.loadHistory()]);
  }

  private async refreshStatus(): Promise<void> {
    this.statusLoading.set(true);
    try {
      this.twoFactorEnabled.set(await this.auth.fetchTwoFactorEnabled());
    } finally {
      this.statusLoading.set(false);
    }
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    try {
      this.loginHistory.set(await this.auth.fetchLoginHistory());
    } catch {
      this.loginHistory.set([]);
    } finally {
      this.historyLoading.set(false);
    }
  }

  async submitPassword(): Promise<void> {
    this.passwordError.set('');
    this.passwordSaved.set(false);
    this.passwordLoading.set(true);
    try {
      await this.auth.changePassword(this.currentPassword, this.newPassword);
      this.passwordSaved.set(true);
      this.currentPassword = '';
      this.newPassword = '';
    } catch {
      this.passwordError.set(this.t.translate('profile.passwordError'));
    } finally {
      this.passwordLoading.set(false);
    }
  }

  async startSetup(): Promise<void> {
    this.twoFactorError.set('');
    this.twoFactorLoading.set(true);
    try {
      this.setup.set(await this.auth.setupTwoFactor());
      this.confirmCode = '';
    } catch {
      this.twoFactorError.set(this.t.translate('profile.twoFactorError'));
    } finally {
      this.twoFactorLoading.set(false);
    }
  }

  cancelSetup(): void {
    this.setup.set(null);
    this.twoFactorError.set('');
  }

  async confirmSetup(): Promise<void> {
    this.twoFactorError.set('');
    this.twoFactorLoading.set(true);
    try {
      await this.auth.confirmTwoFactor(this.confirmCode);
      this.setup.set(null);
      await this.refreshStatus();
    } catch {
      this.twoFactorError.set(this.t.translate('profile.invalidCode'));
    } finally {
      this.twoFactorLoading.set(false);
    }
  }

  async disable(): Promise<void> {
    this.twoFactorError.set('');
    this.twoFactorLoading.set(true);
    try {
      await this.auth.disableTwoFactor(this.disableCode);
      this.disableCode = '';
      await this.refreshStatus();
    } catch {
      this.twoFactorError.set(this.t.translate('profile.invalidCode'));
    } finally {
      this.twoFactorLoading.set(false);
    }
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
