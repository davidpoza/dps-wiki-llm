import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { AppComponent } from './app/app.component';
import { ExplorerComponent } from './app/components/explorer.component';
import { HomeComponent } from './app/components/home.component';
import { LoginComponent } from './app/components/login.component';
import { authInterceptor } from './app/services/auth.interceptor';
import { authGuard } from './app/auth.guard';

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
    })
  ]
}).catch((err: unknown) => console.error(err));
