import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputText, Password],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <h2>DPS Wiki LLM</h2>
        <form (ngSubmit)="submit()" #f="ngForm">
          <div class="field">
            <label for="username">Username</label>
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
            <label for="password">Password</label>
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
          <p-button
            type="submit"
            label="Sign in"
            [loading]="loading()"
            styleClass="w-full"
          />
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-card {
      width: 360px;
      padding: 2rem;
      border: 1px solid var(--p-surface-200);
      border-radius: 8px;
    }
    h2 { margin-bottom: 1.5rem; text-align: center; }
    .field { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
    .field label { font-size: .875rem; font-weight: 500; }
    .error { color: var(--p-red-500); font-size: .875rem; margin-bottom: .75rem; }
    p-password { width: 100%; }
    :host ::ng-deep .p-password { width: 100%; }
    :host ::ng-deep .p-password input { width: 100%; }
  `]
})
export class LoginComponent {
  readonly username = signal('');
  readonly password = signal('');
  readonly error = signal('');
  readonly loading = signal(false);

  constructor(private auth: AuthService, private router: Router) {}

  async submit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.login(this.username(), this.password());
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Invalid username or password');
    } finally {
      this.loading.set(false);
    }
  }
}
