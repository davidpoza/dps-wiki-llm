import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TreeNode } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly http = inject(HttpClient);

  getTree(): Observable<TreeNode[]> {
    return this.http.get<TreeNode[]>('/api/files/tree');
  }

  getContent(path: string): Observable<string> {
    return this.http.get('/api/files/content', {
      params: { path },
      responseType: 'text',
    });
  }

  saveContent(path: string, content: string): Observable<void> {
    return this.http.put<void>('/api/files/content', content, {
      params: { path },
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
