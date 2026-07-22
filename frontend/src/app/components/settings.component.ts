import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ApiService, BrokenLinkEntry, BrokenLinkScanEvent, Prompt } from '../services/api.service';
import { NavComponent } from './nav.component';
import { ThemeService } from '../services/theme.service';
import { APP_VERSION } from '../version';
import { BrokenLinksModalComponent } from './broken-links-modal.component';

interface PromptState extends Prompt {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, SelectButtonModule, NavComponent, BrokenLinksModalComponent],
  template: `
    <main class="app-shell">
      <app-nav />
      <section class="workspace">
        <header class="page-head">
          <h1>Configuración</h1>
          <p>Ajustes del sistema</p>
        </header>

        <section class="settings-section">
          <h2>Apariencia</h2>
          <p class="section-desc">Elige el tema claro u oscuro de la interfaz.</p>
          <p-selectButton
            [options]="themeOptions"
            [ngModel]="theme.theme()"
            (onChange)="onThemeChange($event.value)"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
          />
        </section>

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
          <h2>Keywords</h2>
          <p class="section-desc">Genera el campo <code>keywords</code> (siempre en inglés) en el frontmatter de las notas de <code>wiki/concepts</code> y <code>wiki/sources</code> que aún no lo tienen. Usa la sección «Summary» y, si no existe, el resto del texto excluyendo «Sources», «Related» y «Links».</p>
          <div class="reindex-row">
            <p-button
              label="Generar keywords"
              size="small"
              [loading]="generatingKeywords()"
              [disabled]="generatingKeywords()"
              (onClick)="startKeywordGeneration()"
            />
            @if (generatingKeywords()) {
              <span class="reindex-progress">
                Notas procesadas {{ keywordsProcessed() }}/{{ keywordsTotal() }}
                &nbsp;·&nbsp; actualizadas {{ keywordsUpdated() }} · omitidas {{ keywordsSkipped() }}
              </span>
            }
            @if (keywordsDone()) {
              <span class="feedback success">Keywords generadas ({{ keywordsUpdated() }} actualizadas, {{ keywordsSkipped() }} omitidas)</span>
            }
            @if (keywordsError()) {
              <span class="feedback error">Error al generar keywords</span>
            }
          </div>
        </section>

        <section class="settings-section">
          <h2>Health Check</h2>
          <p class="section-desc">Reconcilia todo el vault: genera los embeddings que falten en <code>wiki/topics</code>, <code>wiki/concepts</code> y <code>wiki/sources</code>, y descubre conexiones nuevas entre notas de <code>wiki/concepts</code> y <code>wiki/sources</code> añadiendo los enlaces y sus backlinks en la sección «Related». Es el mismo proceso de descubrimiento del ingest, aplicado a todo el vault. Los cambios son reversibles desde el historial.</p>
          <div class="reindex-row">
            <p-button
              label="Lanzar Health Check"
              size="small"
              [loading]="healthChecking()"
              [disabled]="healthChecking()"
              (onClick)="startHealthCheck()"
            />
            @if (healthChecking()) {
              <span class="reindex-progress">
                @if (hcPhase() === 'embeddings') {
                  Generando embeddings {{ hcProcessed() }}/{{ hcTotal() }} ({{ hcPercent() }}%)
                } @else {
                  Buscando conexiones {{ hcProcessed() }}/{{ hcTotal() }} ({{ hcPercent() }}%)
                }
                &nbsp;·&nbsp; embeddings {{ hcEmbeddings() }} · conexiones {{ hcConnections() }}
              </span>
            }
            @if (hcDone()) {
              <span class="feedback success">Health Check completado · embeddings construidos: {{ hcEmbeddings() }} · conexiones encontradas: {{ hcConnections() }}</span>
            }
            @if (hcError()) {
              <span class="feedback error">Error en el Health Check</span>
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

        <section class="settings-section">
          <h2>Enlaces rotos</h2>
          <p class="section-desc">Busca enlaces wiki <code>[[slug]]</code> en la sección «Related» de todas las notas que apuntan a ficheros inexistentes. Al terminar puedes seleccionar cuáles eliminar.</p>
          <div class="reindex-row">
            <p-button
              label="Buscar enlaces rotos"
              size="small"
              [loading]="brokenLinkScanning()"
              [disabled]="brokenLinkScanning()"
              (onClick)="startBrokenLinksScan()"
            />
            @if (brokenLinkScanning()) {
              <span class="reindex-progress">
                Ficheros procesados {{ blProcessed() }}/{{ blTotal() }}
              </span>
            }
            @if (blDone()) {
              <span class="feedback success">No se encontraron enlaces rotos</span>
            }
            @if (blDeleted() !== null) {
              <span class="feedback success">{{ blDeleted() }} enlace(s) eliminado(s)</span>
            }
            @if (blError()) {
              <span class="feedback error">Error al buscar enlaces rotos</span>
            }
          </div>
        </section>

        @if (showBrokenLinksModal()) {
          <app-broken-links-modal
            [brokenLinks]="brokenLinks()"
            (cancel)="showBrokenLinksModal.set(false)"
            (confirmed)="onBrokenLinksConfirmed($event)"
          />
        }

        <footer class="version-footer">
          Frontend: v{{ frontendVersion }} &nbsp;|&nbsp; Backend: v{{ backendVersion() }}
        </footer>
      </section>
    </main>
  `,
  styles: [`
    .app-shell {
      height: 100vh;
      overflow-y: auto;
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
    .page-head { margin-bottom: 4px; }
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
  readonly theme = inject(ThemeService);

  readonly themeOptions = [
    { label: 'Claro', value: 'light' as const },
    { label: 'Oscuro', value: 'dark' as const },
  ];

  readonly frontendVersion = APP_VERSION;
  readonly backendVersion = signal('…');

  readonly loading = signal(true);
  readonly prompts = signal<PromptState[]>([]);

  readonly reindexing = signal(false);
  readonly reindexProcessed = signal(0);
  readonly reindexTotal = signal(0);
  readonly reindexDone = signal(false);
  readonly reindexError = signal<string | null>(null);

  readonly generatingKeywords = signal(false);
  readonly keywordsProcessed = signal(0);
  readonly keywordsTotal = signal(0);
  readonly keywordsUpdated = signal(0);
  readonly keywordsSkipped = signal(0);
  readonly keywordsDone = signal(false);
  readonly keywordsError = signal<string | null>(null);
  readonly healthChecking = signal(false);
  readonly hcPhase = signal<'embeddings' | 'connections' | 'done'>('embeddings');
  readonly hcProcessed = signal(0);
  readonly hcTotal = signal(0);
  readonly hcEmbeddings = signal(0);
  readonly hcConnections = signal(0);
  readonly hcDone = signal(false);
  readonly hcError = signal<string | null>(null);
  readonly hcPercent = computed(() => {
    const total = this.hcTotal();
    return total > 0 ? Math.round((this.hcProcessed() / total) * 100) : 100;
  });

  resourceFolder = '';
  readonly resourceSaving = signal(false);
  readonly resourceSaved = signal(false);
  readonly resourceError = signal<string | null>(null);

  readonly brokenLinkScanning = signal(false);
  readonly blProcessed = signal(0);
  readonly blTotal = signal(0);
  readonly blDone = signal(false);
  readonly blError = signal<string | null>(null);
  readonly brokenLinks = signal<BrokenLinkEntry[]>([]);
  readonly showBrokenLinksModal = signal(false);
  readonly blDeleted = signal<number | null>(null);

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

  startKeywordGeneration(): void {
    this.generatingKeywords.set(true);
    this.keywordsDone.set(false);
    this.keywordsError.set(null);
    this.keywordsProcessed.set(0);
    this.keywordsTotal.set(0);
    this.keywordsUpdated.set(0);
    this.keywordsSkipped.set(0);

    this.api.generateKeywords().subscribe({
      next: (progress) => {
        this.keywordsProcessed.set(progress.processed);
        this.keywordsTotal.set(progress.total);
        this.keywordsUpdated.set(progress.updated);
        this.keywordsSkipped.set(progress.skipped);
      },
      complete: () => {
        this.generatingKeywords.set(false);
        this.keywordsDone.set(true);
        setTimeout(() => this.keywordsDone.set(false), 5000);
      },
      error: (err: Error) => {
        this.generatingKeywords.set(false);
        this.keywordsError.set(err.message ?? 'Error desconocido');
      }
    });
  }

  startHealthCheck(): void {
    this.healthChecking.set(true);
    this.hcDone.set(false);
    this.hcError.set(null);
    this.hcPhase.set('embeddings');
    this.hcProcessed.set(0);
    this.hcTotal.set(0);
    this.hcEmbeddings.set(0);
    this.hcConnections.set(0);

    this.api.runHealthCheck().subscribe({
      next: (progress) => {
        this.hcPhase.set(progress.phase);
        this.hcProcessed.set(progress.processed);
        this.hcTotal.set(progress.total);
        this.hcEmbeddings.set(progress.embeddingsBuilt);
        this.hcConnections.set(progress.connectionsFound);
      },
      complete: () => {
        this.healthChecking.set(false);
        this.hcDone.set(true);
        setTimeout(() => this.hcDone.set(false), 8000);
      },
      error: (err: Error) => {
        this.healthChecking.set(false);
        this.hcError.set(err.message ?? 'Error desconocido');
      }
    });
  }

  startBrokenLinksScan(): void {
    this.brokenLinkScanning.set(true);
    this.blDone.set(false);
    this.blError.set(null);
    this.blDeleted.set(null);
    this.blProcessed.set(0);
    this.blTotal.set(0);
    this.brokenLinks.set([]);

    this.api.scanBrokenLinks().subscribe({
      next: (event: BrokenLinkScanEvent) => {
        if (event.type === 'progress') {
          this.blProcessed.set(event.processed);
          this.blTotal.set(event.total);
        } else if (event.type === 'result') {
          this.brokenLinks.set(event.brokenLinks);
        }
      },
      complete: () => {
        this.brokenLinkScanning.set(false);
        if (this.brokenLinks().length > 0) {
          this.showBrokenLinksModal.set(true);
        } else {
          this.blDone.set(true);
          setTimeout(() => this.blDone.set(false), 5000);
        }
      },
      error: (err: Error) => {
        this.brokenLinkScanning.set(false);
        this.blError.set(err.message ?? 'Error desconocido');
      }
    });
  }

  onBrokenLinksConfirmed(entries: { sourceFile: string; link: string }[]): void {
    this.showBrokenLinksModal.set(false);
    this.api.deleteBrokenLinks(entries).subscribe({
      next: (result) => {
        this.blDeleted.set(result.deleted);
        setTimeout(() => this.blDeleted.set(null), 5000);
      },
      error: () => {
        this.blError.set('Error al eliminar los enlaces.');
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

  onThemeChange(value: 'light' | 'dark'): void {
    if (value) {
      this.theme.setTheme(value);
    }
  }
}
