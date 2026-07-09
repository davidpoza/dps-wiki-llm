import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthResponse {
  token: string;
  expiresAt: string;
  username: string;
  roles: string[];
}

export interface CurrentUser {
  username: string;
  roles: string[];
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

  async login(username: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', { username, password })
    );
    const user: CurrentUser = { username: res.username, roles: res.roles };
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this._token.set(res.token);
    this._user.set(user);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
  }
}
