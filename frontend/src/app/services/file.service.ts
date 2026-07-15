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

  deleteFile(path: string): Observable<void> {
    return this.http.delete<void>('/api/files/content', { params: { path } });
  }

  renameFile(path: string, newName: string): Observable<void> {
    return this.http.post<void>('/api/files/rename', null, { params: { path, newName } });
  }

  createFile(path: string): Observable<void> {
    return this.http.post<void>('/api/files/content', null, { params: { path } });
  }

  moveFile(path: string, targetDir: string): Observable<void> {
    return this.http.post<void>('/api/files/move', null, { params: { path, targetDir } });
  }

  createDirectory(path: string): Observable<void> {
    return this.http.post<void>('/api/files/directory', null, { params: { path } });
  }

  exportPdf(path: string): Observable<Blob> {
    return this.http.get('/api/files/pdf', { params: { path }, responseType: 'blob' });
  }
}
