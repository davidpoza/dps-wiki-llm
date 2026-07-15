import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { APP_INITIALIZER, inject, Injectable } from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideTransloco, Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';
import { AppComponent } from './app/app.component';
import { ExplorerComponent } from './app/components/explorer.component';
import { HomeComponent } from './app/components/home.component';
import { LoginComponent } from './app/components/login.component';
import { ProfileComponent } from './app/components/profile.component';
import { SettingsComponent } from './app/components/settings.component';
import { authInterceptor } from './app/services/auth.interceptor';
import { loadingInterceptor } from './app/services/loading.interceptor';
import { authGuard } from './app/auth.guard';
import { unsavedChangesGuard } from './app/unsaved-changes.guard';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
class AppTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
  }
}

function detectLang(): 'es' | 'en' {
  const browserLang = navigator.language ?? navigator.languages?.[0] ?? '';
  return browserLang.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const activeLang = detectLang();

function initializeTheme(): void {
  const stored = localStorage.getItem('dps-wiki-theme');
  const theme = stored === 'light' || stored === 'dark'
    ? stored
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

initializeTheme();

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor])),
    provideRouter([
      { path: 'login', component: LoginComponent },
      { path: '', component: HomeComponent, canActivate: [authGuard] },
      { path: 'explorer', component: ExplorerComponent, canActivate: [authGuard], canDeactivate: [unsavedChangesGuard] },
      { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
      { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
    ]),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark'
        }
      }
    }),
    provideTransloco({
      config: {
        availableLangs: ['es', 'en'],
        defaultLang: activeLang,
        reRenderOnLangChange: false,
        prodMode: false,
      },
      loader: AppTranslocoLoader,
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: (transloco: TranslocoService) => () => firstValueFrom(transloco.load(activeLang)),
      deps: [TranslocoService],
      multi: true,
    },
  ]
}).catch((err: unknown) => console.error(err));
