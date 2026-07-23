import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { LoadingService } from './services/loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    @if (loading.active()) {
      <div class="global-spinner-overlay">
        <p-progressSpinner strokeWidth="4" />
      </div>
    }
  `,
  styles: [
    `
      .global-spinner-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-overlay);
        z-index: 9999;
        pointer-events: none;
      }
    `,
  ],
})
export class AppComponent {
  readonly loading = inject(LoadingService);
}
