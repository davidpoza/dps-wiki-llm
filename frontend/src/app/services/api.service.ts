import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Commit, JobMode } from '../types';

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

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

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
}
