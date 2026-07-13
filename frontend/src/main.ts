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
import { authInterceptor } from './app/services/auth.interceptor';
import { authGuard } from './app/auth.guard';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
class AppTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter([
      { path: 'login', component: LoginComponent },
      { path: '', component: HomeComponent, canActivate: [authGuard] },
      { path: 'explorer', component: ExplorerComponent, canActivate: [authGuard] },
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
        defaultLang: 'es',
        reRenderOnLangChange: false,
        prodMode: false,
      },
      loader: AppTranslocoLoader,
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: (transloco: TranslocoService) => () => firstValueFrom(transloco.load('es')),
      deps: [TranslocoService],
      multi: true,
    },
  ]
}).catch((err: unknown) => console.error(err));
