import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatMessage, ChatSession, ChatSessionDetail } from '../types';

@Injectable({ providedIn: 'root' })
export class ChatSessionService {
  private readonly http = inject(HttpClient);

  listSessions(): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>('/api/chat/sessions');
  }

  getSession(id: string): Observable<ChatSessionDetail> {
    return this.http.get<ChatSessionDetail>(`/api/chat/sessions/${id}`);
  }

  createSession(): Observable<ChatSession> {
    return this.http.post<ChatSession>('/api/chat/sessions', {});
  }

  deleteSession(id: string): Observable<void> {
    return this.http.delete<void>(`/api/chat/sessions/${id}`);
  }

  sendMessage(id: string, content: string): Observable<ChatMessage[]> {
    return this.http.post<ChatMessage[]>(`/api/chat/sessions/${id}/messages`, { content });
  }

  exportToVault(id: string): Observable<{ path: string }> {
    return this.http.post<{ path: string }>(`/api/chat/sessions/${id}/export-to-vault`, {});
  }
}
