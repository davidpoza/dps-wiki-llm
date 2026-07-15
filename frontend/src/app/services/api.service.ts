import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { Commit, JobMode } from '../types';
import { AuthService } from './auth.service';

export interface EnqueueResponse {
  jobId: string;
  queuePosition: number;
}

export interface ReviewCandidateDecision {
  candidateId: string;
  decision: 'accepted' | 'rejected';
}

export interface ReviewRequest {
  decisions: ReviewCandidateDecision[];
  manualTargetPaths: string[];
}

export interface ConnectionCandidate {
  id: string;
  jobId: string;
  targetPath: string;
  proposedLink: string;
  proposedSection: string;
  source: string;
  score: number;
  decision: string;
}

export interface Prompt {
  key: string;
  name: string;
  text: string;
  updatedAt: string;
}

export interface FileSearchResult {
  path: string;
  title: string;
  docType: string;
  score: number;
}

export interface JobResponse {
  id: string;
  type: string;
  status: string;
  mode: string;
  payloadRef: string;
  result?: string;
  error?: string;
  queuePosition?: number;
}

export interface JobSummary {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  affectedPaths?: string[];
}

export interface ReindexProgress {
  processed: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  enqueueAnswer(question: string): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/answer', { question });
  }

  enqueueIngestUrl(url: string, mode: JobMode = 'unattended'): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/ingest', { url, mode });
  }

  uploadFile(file: File, mode: JobMode = 'unattended'): Observable<EnqueueResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    return this.http.post<EnqueueResponse>('/api/ingest/upload', form);
  }

  getJobs(): Observable<JobSummary[]> {
    return this.http.get<JobSummary[]>('/api/jobs');
  }

  getJob(id: string): Observable<JobResponse> {
    return this.http.get<JobResponse>(`/api/jobs/${id}`);
  }

  getReviewCandidates(jobId: string): Observable<ConnectionCandidate[]> {
    return this.http.get<ConnectionCandidate[]>(`/api/jobs/${jobId}/review`);
  }

  submitReview(jobId: string, request: ReviewRequest): Observable<unknown> {
    return this.http.post(`/api/jobs/${jobId}/review`, request);
  }

  enqueueRevert(jobId: string): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>(`/api/jobs/${jobId}/revert`, {});
  }

  cancelJob(jobId: string): Observable<void> {
    return this.http.delete<void>(`/api/jobs/${jobId}`);
  }

  lookupFiles(q: string, limit = 10): Observable<FileSearchResult[]> {
    return this.http.get<FileSearchResult[]>('/api/files/lookup', { params: { q, limit: String(limit) } });
  }

  getGitLog(limit = 50): Observable<Commit[]> {
    return this.http.get<Commit[]>('/api/git/log', { params: { limit: String(limit) } });
  }

  resetToCommit(sha: string): Observable<{ sha: string }> {
    return this.http.post<{ sha: string }>('/api/git/reset', { sha });
  }

  getFileDiff(sha: string, path: string): Observable<string> {
    return this.http.get('/api/git/diff', { params: { sha, path }, responseType: 'text' });
  }

  getPrompts(): Observable<Prompt[]> {
    return this.http.get<Prompt[]>('/api/settings/prompts');
  }

  updatePrompt(key: string, text: string): Observable<Prompt> {
    return this.http.put<Prompt>(`/api/settings/prompts/${key}`, { text });
  }

  reindex(): Observable<ReindexProgress> {
    return new Observable((observer: Observer<ReindexProgress>) => {
      const token = this.auth.token();
      const url = token
        ? `/api/settings/reindex?token=${encodeURIComponent(token)}`
        : '/api/settings/reindex';
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        observer.next(JSON.parse(e.data) as ReindexProgress);
      });
      es.addEventListener('done', (e: MessageEvent) => {
        completed = true;
        observer.next(JSON.parse(e.data) as ReindexProgress);
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data
          ? (JSON.parse(e.data) as { message: string })
          : { message: 'Error desconocido' };
        es.close();
        observer.error(new Error(data.message));
      });
      es.onerror = () => {
        es.close();
        if (!completed) {
          observer.error(new Error('Error de conexión'));
        }
      };
      return () => es.close();
    });
  }
}
