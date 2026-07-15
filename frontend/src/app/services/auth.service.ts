import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthResponse {
  token: string;
  expiresAt: string;
  username: string;
  roles: string[];
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

/** Result of a password login: either fully logged in, or a pending 2FA challenge. */
export type LoginResult =
  | { status: 'logged-in' }
  | { status: '2fa-required'; challengeToken: string };

export interface CurrentUser {
  username: string;
  roles: string[];
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qrDataUri: string;
}

export interface LoginEvent {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  success: boolean;
  failureReason: string | null;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<CurrentUser | null>(
    JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  );

  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._token() !== null);
  readonly token = this._token.asReadonly();

  constructor(private http: HttpClient) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse | TwoFactorChallenge>('/api/auth/login', { username, password })
    );
    if ('twoFactorRequired' in res) {
      return { status: '2fa-required', challengeToken: res.challengeToken };
    }
    this.storeSession(res);
    return { status: 'logged-in' };
  }

  async verifyTwoFactor(challengeToken: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login/2fa', { challengeToken, code })
    );
    this.storeSession(res);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/password', { currentPassword, newPassword })
    );
  }

  async fetchTwoFactorEnabled(): Promise<boolean> {
    const me = await firstValueFrom(
      this.http.get<{ twoFactorEnabled: boolean }>('/api/auth/me')
    );
    return me.twoFactorEnabled;
  }

  async setupTwoFactor(): Promise<TwoFactorSetup> {
    return firstValueFrom(
      this.http.post<TwoFactorSetup>('/api/auth/2fa/setup', {})
    );
  }

  async confirmTwoFactor(code: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/2fa/confirm', { code }));
  }

  async disableTwoFactor(code: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/2fa/disable', { code }));
  }

  fetchLoginHistory(): Promise<LoginEvent[]> {
    return firstValueFrom(this.http.get<LoginEvent[]>('/api/auth/login-history'));
  }

  private storeSession(res: AuthResponse): void {
    const user: CurrentUser = { username: res.username, roles: res.roles };
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this._token.set(res.token);
    this._user.set(user);
  }
}
