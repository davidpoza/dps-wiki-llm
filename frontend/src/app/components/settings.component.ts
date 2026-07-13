import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ApiService, Prompt } from '../services/api.service';
import { AuthService } from '../services/auth.service';

interface PromptState extends Prompt {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule],
  template: `
    <main class="app-shell">
      <section class="workspace">
        <header class="topbar">
          <div class="brand">
            <h1>Configuración</h1>
            <p>Ajustes del sistema</p>
          </div>
          <div class="topbar-actions">
            <p-button severity="secondary" label="Volver" size="small" (onClick)="goHome()" />
            <p-button severity="secondary" label="Cerrar sesión" size="small" (onClick)="logout()" />
          </div>
        </header>

        <section class="settings-section">
          <h2>Prompts del LLM</h2>
          <p class="section-desc">Textos que se envían como instrucciones de sistema al modelo de lenguaje. Los cambios son efectivos de inmediato.</p>

          @if (loading()) {
            <p class="loading-msg">Cargando prompts…</p>
          } @else if (prompts().length === 0) {
            <p class="empty-msg">No hay prompts configurados.</p>
          } @else {
            <div class="prompts-list">
              @for (prompt of prompts(); track prompt.key) {
                <div class="prompt-card">
                  <div class="prompt-header">
                    <label [for]="prompt.key" class="prompt-name">{{ prompt.name }}</label>
                    <span class="prompt-key">{{ prompt.key }}</span>
                  </div>
                  <textarea
                    [id]="prompt.key"
                    class="prompt-textarea"
                    [(ngModel)]="prompt.text"
                    rows="5"
                    [disabled]="prompt.saving"
                  ></textarea>
                  <div class="prompt-footer">
                    @if (prompt.saved) {
                      <span class="feedback success">Guardado correctamente</span>
                    }
                    @if (prompt.error) {
                      <span class="feedback error">{{ prompt.error }}</span>
                    }
                    <p-button
                      label="Guardar"
                      size="small"
                      [loading]="prompt.saving"
                      (onClick)="save(prompt)"
                    />
                  </div>
                </div>
              }
            </div>
          }
        </section>
      </section>
    </main>
  `,
  styles: [`
    .app-shell {
      min-height: 100vh;
      background: #f6f7f9;
      color: #18212f;
    }
    .workspace {
      width: min(900px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 20px 0 40px;
    }
    .topbar {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    h1 { margin: 0; font-size: 1.5rem; line-height: 1.2; }
    h2 { margin: 0 0 6px; font-size: 1.1rem; }
    p { margin: 4px 0 0; color: #5d6878; font-size: 0.875rem; }
    .settings-section { background: #fff; border-radius: 10px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
    .section-desc { margin-bottom: 20px; }
    .prompts-list { display: flex; flex-direction: column; gap: 20px; }
    .prompt-card { border: 1px solid #e2e5ea; border-radius: 8px; padding: 16px; }
    .prompt-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
    .prompt-name { font-weight: 600; font-size: 0.95rem; }
    .prompt-key { font-size: 0.75rem; color: #8a94a2; font-family: monospace; background: #f1f3f5; padding: 2px 6px; border-radius: 4px; }
    .prompt-textarea { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 0.85rem; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; resize: vertical; color: #18212f; background: #fafafa; }
    .prompt-textarea:focus { outline: 2px solid #3b82f6; border-color: #3b82f6; }
    .prompt-textarea:disabled { opacity: 0.6; }
    .prompt-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 10px; }
    .feedback { font-size: 0.85rem; }
    .feedback.success { color: #16a34a; }
    .feedback.error { color: #dc2626; }
    .loading-msg, .empty-msg { color: #5d6878; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly prompts = signal<PromptState[]>([]);

  ngOnInit(): void {
    this.api.getPrompts().subscribe({
      next: (data) => {
        this.prompts.set(data.map(p => ({ ...p, saving: false, saved: false, error: null })));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  save(prompt: PromptState): void {
    prompt.saving = true;
    prompt.saved = false;
    prompt.error = null;
    this.prompts.update(ps => [...ps]);

    this.api.updatePrompt(prompt.key, prompt.text).subscribe({
      next: (updated) => {
        prompt.saving = false;
        prompt.saved = true;
        prompt.updatedAt = updated.updatedAt;
        this.prompts.update(ps => [...ps]);
        setTimeout(() => {
          prompt.saved = false;
          this.prompts.update(ps => [...ps]);
        }, 3000);
      },
      error: () => {
        prompt.saving = false;
        prompt.error = 'Error al guardar. Inténtalo de nuevo.';
        this.prompts.update(ps => [...ps]);
      }
    });
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
