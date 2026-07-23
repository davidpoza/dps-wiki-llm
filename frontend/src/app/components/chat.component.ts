import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { TranslocoPipe } from '@jsverse/transloco';
import { marked } from 'marked';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessage, ChatSession, ChatSessionDetail } from '../types';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, NgClass, ButtonModule, Textarea, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-layout" [class.sidebar-open]="sidebarOpen()">

      <!-- Mobile sidebar toggle -->
      <button class="sidebar-toggle" pButton type="button" [text]="true"
              icon="pi pi-list" (click)="sidebarOpen.update(v => !v)"></button>

      <!-- Sidebar -->
      <aside class="chat-sidebar" [class.open]="sidebarOpen()">
        <div class="sidebar-header">
          <button pButton type="button" icon="pi pi-plus"
                  [label]="'chat.newConversation' | transloco"
                  severity="secondary" (click)="newSession()"></button>
        </div>
        <div class="session-list">
          @if (loadingSessions()) {
            <div class="session-loading">{{ 'common.loading' | transloco }}</div>
          }
          @for (s of sessions(); track s.id) {
            <div class="session-item" [class.active]="s.id === activeSessionId()"
                 (click)="selectSession(s.id)">
              <div class="session-title">{{ s.title }}</div>
              <div class="session-meta">{{ relativeDate(s.updatedAt) }}</div>
              <button class="session-delete" pButton type="button" [text]="true"
                      icon="pi pi-trash" severity="danger"
                      (click)="deleteSession($event, s.id)"></button>
            </div>
          }
          @if (!loadingSessions() && sessions().length === 0) {
            <div class="session-empty">{{ 'chat.noSessions' | transloco }}</div>
          }
        </div>
      </aside>

      @if (sidebarOpen()) {
        <div class="sidebar-backdrop" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- Main panel -->
      <div class="chat-main">
        @if (!activeSessionId()) {
          <div class="no-session">
            <p>{{ 'chat.selectOrNew' | transloco }}</p>
            <button pButton type="button" icon="pi pi-plus"
                    [label]="'chat.newConversation' | transloco"
                    (click)="newSession()"></button>
          </div>
        } @else {
          <!-- Session header -->
          <div class="session-header">
            <span class="session-header-title">{{ activeSession()?.title }}</span>
            <div class="session-header-actions">
              @if (exportPath()) {
                <span class="export-confirm">✓ {{ exportPath() }}</span>
              }
              @if (exportError()) {
                <span class="export-error">{{ exportError() }}</span>
              }
              @if (hasMessages()) {
                <button pButton type="button" icon="pi pi-cloud-upload"
                        [label]="'chat.saveToVault' | transloco"
                        severity="secondary" [loading]="exportLoading()"
                        (click)="exportToVault()"></button>
              }
            </div>
          </div>

          <!-- Messages area -->
          <div class="messages-area" #messagesContainer>
            @if (loadingSession()) {
              <div class="messages-loading">{{ 'common.loading' | transloco }}</div>
            }
            @for (msg of messages(); track msg.id) {
              <div class="message" [ngClass]="msg.role">
                <div class="bubble" [ngClass]="msg.role">
                  @if (msg.role === 'assistant') {
                    <div class="markdown" [innerHTML]="renderMarkdown(msg.content)"></div>
                  } @else {
                    <div class="plain">{{ msg.content }}</div>
                  }
                </div>
              </div>
            }
            @if (loading()) {
              <div class="message assistant">
                <div class="bubble assistant thinking">
                  <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                </div>
              </div>
            }
          </div>

          <!-- Input area -->
          <div class="input-area">
            <textarea pTextarea [ngModel]="question()" (ngModelChange)="question.set($event)"
                      [autoResize]="true" rows="2"
                      [placeholder]="'chat.placeholder' | transloco"
                      [disabled]="loading()"
                      (keydown.ctrl.enter)="send()"
                      class="question-input"></textarea>
            <button pButton type="button" icon="pi pi-send"
                    [label]="'chat.ask' | transloco"
                    [disabled]="!question().trim() || loading()"
                    [loading]="loading()"
                    (click)="send()"></button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .chat-layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      grid-template-rows: 1fr;
      height: 100%;
      overflow: hidden;
      position: relative;
    }
    .sidebar-toggle { display: none; }
    .chat-sidebar {
      grid-column: 1;
      border-right: 1px solid var(--app-border);
      background: var(--app-surface);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 12px;
      border-bottom: 1px solid var(--app-border);
      display: flex;
    }
    .sidebar-header button { width: 100%; justify-content: center; }
    .session-list { flex: 1; overflow-y: auto; padding: 8px 4px; }
    .session-loading, .session-empty {
      padding: 16px;
      color: var(--app-text-muted);
      font-size: 0.85rem;
      text-align: center;
    }
    .session-item {
      position: relative;
      padding: 10px 36px 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.12s;
      margin-bottom: 2px;
    }
    .session-item:hover { background: var(--app-surface-muted); }
    .session-item.active { background: var(--app-primary-soft); }
    .session-title {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--app-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-meta { font-size: 0.72rem; color: var(--app-text-muted); margin-top: 2px; }
    .session-delete {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0;
      transition: opacity 0.12s;
      padding: 4px !important;
    }
    .session-item:hover .session-delete { opacity: 1; }

    .chat-main {
      grid-column: 2;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .no-session {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: var(--app-text-muted);
    }
    .session-header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--app-border);
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      background: var(--app-surface);
    }
    .session-header-title {
      flex: 1;
      font-weight: 600;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-header-actions { display: flex; align-items: center; gap: 8px; }
    .export-confirm { font-size: 0.8rem; color: var(--app-success-text); font-family: monospace; }
    .export-error { font-size: 0.8rem; color: var(--app-error-text); }
    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .messages-loading { color: var(--app-text-muted); text-align: center; padding: 16px; font-size: 0.85rem; }
    .message {
      display: flex;
    }
    .message.user { justify-content: flex-end; }
    .message.assistant { justify-content: flex-start; }
    .bubble {
      max-width: 72%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .bubble.user {
      background: var(--app-primary);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .bubble.assistant {
      background: var(--app-surface-muted);
      color: var(--app-text);
      border-bottom-left-radius: 4px;
    }
    .bubble.thinking {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 14px;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--app-text-muted);
      animation: bounce 1.2s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    .markdown :global(p) { margin: 0 0 8px; }
    .markdown :global(p:last-child) { margin-bottom: 0; }
    .markdown :global(code) { background: rgba(0,0,0,0.1); border-radius: 3px; padding: 1px 4px; font-size: 0.85em; }
    .markdown :global(pre) { background: rgba(0,0,0,0.1); border-radius: 6px; padding: 8px; overflow-x: auto; }
    .markdown :global(ul), .markdown :global(ol) { margin: 4px 0 4px 18px; padding: 0; }
    .markdown :global(li) { margin: 2px 0; }
    .input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--app-border);
      background: var(--app-surface);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .question-input { flex: 1; resize: none; max-height: 160px; }
    .sidebar-backdrop { display: none; }

    @media (max-width: 768px) {
      .chat-layout { grid-template-columns: 1fr; }
      .sidebar-toggle {
        display: block;
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 60;
      }
      .chat-sidebar {
        position: absolute;
        top: 0; left: 0; bottom: 0;
        width: 280px;
        z-index: 55;
        transform: translateX(-100%);
        transition: transform 0.22s ease;
        box-shadow: var(--app-shadow);
      }
      .chat-sidebar.open { transform: translateX(0); }
      .sidebar-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgba(0,0,0,0.3);
      }
      .chat-main { grid-column: 1; }
      .session-header { padding-left: 52px; }
    }
  `]
})
export class ChatComponent implements OnInit, AfterViewChecked {
  private readonly chatService = inject(ChatSessionService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  readonly sessions = signal<ChatSession[]>([]);
  readonly activeSessionId = signal<string | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);
  readonly loadingSessions = signal(false);
  readonly loadingSession = signal(false);
  readonly sidebarOpen = signal(false);
  readonly question = signal('');
  readonly exportPath = signal<string | null>(null);
  readonly exportError = signal<string | null>(null);
  readonly exportLoading = signal(false);

  readonly activeSession = computed(() => this.sessions().find(s => s.id === this.activeSessionId()));
  readonly hasMessages = computed(() => this.messages().length > 0);

  private shouldScrollToBottom = false;

  ngOnInit(): void {
    this.loadSessions();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollToBottom = false;
    }
  }

  loadSessions(): void {
    this.loadingSessions.set(true);
    this.chatService.listSessions().subscribe({
      next: list => { this.sessions.set(list); this.loadingSessions.set(false); },
      error: () => this.loadingSessions.set(false),
    });
  }

  selectSession(id: string): void {
    this.activeSessionId.set(id);
    this.exportPath.set(null);
    this.exportError.set(null);
    this.sidebarOpen.set(false);
    this.loadingSession.set(true);
    this.chatService.getSession(id).subscribe({
      next: (detail: ChatSessionDetail) => {
        this.messages.set(detail.messages);
        this.loadingSession.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => this.loadingSession.set(false),
    });
  }

  newSession(): void {
    this.chatService.createSession().subscribe({
      next: session => {
        this.sessions.update(list => [session, ...list]);
        this.activeSessionId.set(session.id);
        this.messages.set([]);
        this.exportPath.set(null);
        this.exportError.set(null);
        this.sidebarOpen.set(false);
      },
    });
  }

  deleteSession(event: Event, id: string): void {
    event.stopPropagation();
    this.chatService.deleteSession(id).subscribe({
      next: () => {
        this.sessions.update(list => list.filter(s => s.id !== id));
        if (this.activeSessionId() === id) {
          this.activeSessionId.set(null);
          this.messages.set([]);
        }
      },
    });
  }

  send(): void {
    const content = this.question().trim();
    if (!content || this.loading()) return;
    const sessionId = this.activeSessionId();
    if (!sessionId) return;

    this.loading.set(true);
    this.question.set('');
    this.shouldScrollToBottom = true;

    this.chatService.sendMessage(sessionId, content).subscribe({
      next: newMessages => {
        this.messages.update(list => [...list, ...newMessages]);
        this.loading.set(false);
        this.shouldScrollToBottom = true;

        // Update session title if it's still the default
        const session = this.activeSession();
        if (session?.title === 'Nueva conversación' && newMessages.length > 0) {
          const firstUserMsg = newMessages.find(m => m.role === 'user');
          if (firstUserMsg) {
            const newTitle = firstUserMsg.content.length <= 60
                ? firstUserMsg.content : firstUserMsg.content.substring(0, 60);
            this.sessions.update(list =>
                list.map(s => s.id === sessionId ? { ...s, title: newTitle, updatedAt: new Date().toISOString() } : s));
          }
        } else {
          // Bump updatedAt to top of list
          this.sessions.update(list => {
            const updated = list.map(s => s.id === sessionId
                ? { ...s, updatedAt: new Date().toISOString() } : s);
            return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  exportToVault(): void {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    this.exportLoading.set(true);
    this.exportPath.set(null);
    this.exportError.set(null);
    this.chatService.exportToVault(sessionId).subscribe({
      next: res => { this.exportPath.set(res.path); this.exportLoading.set(false); },
      error: () => { this.exportError.set('Error al guardar'); this.exportLoading.set(false); },
    });
  }

  renderMarkdown(content: string): SafeHtml {
    const html = marked.parse(content) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  relativeDate(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days}d`;
    return new Date(isoDate).toLocaleDateString('es');
  }
}
