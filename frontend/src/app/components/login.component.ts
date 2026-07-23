import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputText, Password, TranslocoPipe],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <p-button
          severity="secondary"
          [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
          [rounded]="true"
          [text]="true"
          size="small"
          styleClass="theme-button"
          [title]="theme.isDark() ? ('common.lightMode' | transloco) : ('common.darkMode' | transloco)"
          (onClick)="theme.toggle()"
        />
        <h2>{{ 'common.brand' | transloco }}</h2>
        @if (!challengeToken()) {
          <form (ngSubmit)="submit()" #f="ngForm">
            <div class="field">
              <label for="username">{{ 'login.username' | transloco }}</label>
              <input
                pInputText
                id="username"
                [ngModel]="username()"
                (ngModelChange)="username.set($event)"
                name="username"
                autocomplete="username"
                required
              />
            </div>
            <div class="field">
              <label for="password">{{ 'login.password' | transloco }}</label>
              <p-password
                inputId="password"
                [ngModel]="password()"
                (ngModelChange)="password.set($event)"
                name="password"
                [feedback]="false"
                [toggleMask]="true"
                autocomplete="current-password"
              />
            </div>
            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
            <p-button type="submit" [label]="'login.signIn' | transloco" [loading]="loading()" styleClass="w-full" />
          </form>
        } @else {
          <form (ngSubmit)="submitCode()" #cf="ngForm">
            <p class="hint">{{ 'login.twoFactorPrompt' | transloco }}</p>
            <div class="field">
              <label for="code">{{ 'login.twoFactorCode' | transloco }}</label>
              <input
                pInputText
                id="code"
                [ngModel]="code()"
                (ngModelChange)="code.set($event)"
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                required
              />
            </div>
            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
            <p-button type="submit" [label]="'login.verify' | transloco" [loading]="loading()" styleClass="w-full" />
          </form>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .login-wrapper {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-bg);
        color: var(--app-text);
      }
      .login-card {
        position: relative;
        width: 360px;
        padding: 2rem;
        border: 1px solid var(--app-border);
        border-radius: 8px;
        background: var(--app-surface);
        box-shadow: var(--app-shadow);
      }
      :host ::ng-deep .theme-button {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
      }
      h2 {
        margin-bottom: 1.5rem;
        text-align: center;
      }
      .hint {
        font-size: 0.875rem;
        margin-bottom: 1rem;
        text-align: center;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 1rem;
      }
      .field label {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .error {
        color: var(--p-red-500);
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
      }
      p-password {
        width: 100%;
      }
      :host ::ng-deep .p-password {
        width: 100%;
      }
      :host ::ng-deep .p-password input {
        width: 100%;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);
  readonly theme = inject(ThemeService);

  readonly username = signal('');
  readonly password = signal('');
  readonly code = signal('');
  readonly challengeToken = signal<string | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const result = await this.auth.login(this.username(), this.password());
      if (result.status === '2fa-required') {
        this.challengeToken.set(result.challengeToken);
        this.code.set('');
      } else {
        await this.router.navigateByUrl('/');
      }
    } catch {
      this.error.set(this.t.translate('login.invalidCredentials'));
    } finally {
      this.loading.set(false);
    }
  }

  async submitCode(): Promise<void> {
    const token = this.challengeToken();
    if (!token) {
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.verifyTwoFactor(token, this.code());
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set(this.t.translate('login.invalidCode'));
    } finally {
      this.loading.set(false);
    }
  }
}
