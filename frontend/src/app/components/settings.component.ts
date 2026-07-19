import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ApiService, Prompt } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { APP_VERSION } from '../version';

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
            <p-button
              severity="secondary"
              [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
              [rounded]="true"
              [text]="true"
              size="small"
              [title]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'"
              (onClick)="theme.toggle()"
            />
            <p-button severity="secondary" label="Volver" size="small" (onClick)="goHome()" />
            <p-button severity="secondary" label="Cerrar sesión" size="small" (onClick)="logout()" />
          </div>
        </header>

        <section class="settings-section reindex-section">
          <h2>Índice del Vault</h2>
          <p class="section-desc">Regenera el índice de documentos del vault. Úsalo si los ficheros han cambiado externamente y la búsqueda no refleja los cambios.</p>
          <div class="reindex-row">
            <p-button
              label="Reindexar"
              size="small"
              [loading]="reindexing()"
              [disabled]="reindexing()"
              (onClick)="startReindex()"
            />
            @if (reindexing()) {
              <span class="reindex-progress">
                Ficheros procesados {{ reindexProcessed() }}/{{ reindexTotal() }}
              </span>
            }
            @if (reindexDone()) {
              <span class="feedback success">Reindexación completada ({{ reindexTotal() }} ficheros)</span>
            }
            @if (reindexError()) {
              <span class="feedback error">Error en la reindexación</span>
            }
          </div>
        </section>

        <section class="settings-section">
          <h2>Recursos</h2>
          <p class="section-desc">Carpeta relativa al vault para resolver imágenes Obsidian sin ruta, como ![[Pasted image 20260618163907.png]].</p>
          <div class="resource-row">
            <label for="resource-folder" class="resource-label">Carpeta de recursos</label>
            <input
              id="resource-folder"
              class="resource-input"
              type="text"
              [(ngModel)]="resourceFolder"
              [disabled]="resourceSaving()"
              placeholder="attachments"
            />
            <p-button
              label="Guardar"
              size="small"
              [loading]="resourceSaving()"
              (onClick)="saveResourceSettings()"
            />
          </div>
          @if (resourceSaved()) {
            <span class="feedback success">Recursos guardados correctamente</span>
          }
          @if (resourceError()) {
            <span class="feedback error">{{ resourceError() }}</span>
          }
        </section>

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

        <footer class="version-footer">
          Frontend: v{{ frontendVersion }} &nbsp;|&nbsp; Backend: v{{ backendVersion() }}
        </footer>
      </section>
    </main>
  `,
  styles: [`
    .app-shell {
      min-height: 100vh;
      background: var(--app-bg);
      color: var(--app-text);
    }
    .workspace {
      width: min(900px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 20px 0 40px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .topbar {
      margin-bottom: 4px;
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
    p { margin: 4px 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
    .settings-section { background: var(--app-surface); border-radius: 10px; padding: 24px; box-shadow: var(--app-shadow); }
    .section-desc { margin-bottom: 16px; }
    .reindex-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .reindex-progress { font-size: 0.875rem; color: var(--app-text-muted); }
    .resource-row { display: grid; grid-template-columns: 160px 1fr auto; align-items: center; gap: 12px; }
    .resource-label { font-size: 0.9rem; font-weight: 600; color: var(--app-text); }
    .resource-input { width: 100%; box-sizing: border-box; border: 1px solid var(--app-border-strong); border-radius: 6px; padding: 9px 10px; color: var(--app-text); background: var(--app-surface-muted); }
    .resource-input:focus { outline: 2px solid var(--app-primary); border-color: var(--app-primary); }
    .prompts-list { display: flex; flex-direction: column; gap: 20px; }
    .prompt-card { border: 1px solid var(--app-border); border-radius: 8px; padding: 16px; }
    .prompt-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
    .prompt-name { font-weight: 600; font-size: 0.95rem; }
    .prompt-key { font-size: 0.75rem; color: var(--app-text-subtle); font-family: monospace; background: var(--app-surface-subtle); padding: 2px 6px; border-radius: 4px; }
    .prompt-textarea { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 0.85rem; border: 1px solid var(--app-border-strong); border-radius: 6px; padding: 10px; resize: vertical; color: var(--app-text); background: var(--app-surface-muted); }
    .prompt-textarea:focus { outline: 2px solid var(--app-primary); border-color: var(--app-primary); }
    .prompt-textarea:disabled { opacity: 0.6; }
    .prompt-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 10px; }
    .feedback { font-size: 0.85rem; }
    .feedback.success { color: var(--app-success-text); }
    .feedback.error { color: var(--app-error-text); }
    .loading-msg, .empty-msg { color: var(--app-text-muted); }
    .version-footer { text-align: center; font-size: 0.75rem; color: var(--app-text-subtle); padding-top: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  readonly frontendVersion = APP_VERSION;
  readonly backendVersion = signal('…');

  readonly loading = signal(true);
  readonly prompts = signal<PromptState[]>([]);

  readonly reindexing = signal(false);
  readonly reindexProcessed = signal(0);
  readonly reindexTotal = signal(0);
  readonly reindexDone = signal(false);
  readonly reindexError = signal<string | null>(null);
  resourceFolder = '';
  readonly resourceSaving = signal(false);
  readonly resourceSaved = signal(false);
  readonly resourceError = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getActuatorInfo().subscribe({
      next: (info) => this.backendVersion.set(info.build?.version ?? 'N/D'),
      error: () => this.backendVersion.set('N/D'),
    });

    this.api.getResourceSettings().subscribe({
      next: (settings) => {
        this.resourceFolder = settings.resourceFolder;
      },
      error: () => {
        this.resourceError.set('No se pudo cargar la configuración de recursos.');
      }
    });

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

  saveResourceSettings(): void {
    this.resourceSaving.set(true);
    this.resourceSaved.set(false);
    this.resourceError.set(null);

    this.api.updateResourceSettings(this.resourceFolder.trim()).subscribe({
      next: (settings) => {
        this.resourceFolder = settings.resourceFolder;
        this.resourceSaving.set(false);
        this.resourceSaved.set(true);
        setTimeout(() => this.resourceSaved.set(false), 3000);
      },
      error: () => {
        this.resourceSaving.set(false);
        this.resourceError.set('Ruta inválida. Debe ser relativa al vault.');
      }
    });
  }

  startReindex(): void {
    this.reindexing.set(true);
    this.reindexDone.set(false);
    this.reindexError.set(null);
    this.reindexProcessed.set(0);
    this.reindexTotal.set(0);

    this.api.reindex().subscribe({
      next: (progress) => {
        this.reindexProcessed.set(progress.processed);
        this.reindexTotal.set(progress.total);
      },
      complete: () => {
        this.reindexing.set(false);
        this.reindexDone.set(true);
        setTimeout(() => this.reindexDone.set(false), 5000);
      },
      error: (err: Error) => {
        this.reindexing.set(false);
        this.reindexError.set(err.message ?? 'Error desconocido');
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
