import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { ConceptProposal, HistoryPage, SyncResult, Conflict, JobMode } from '../types';
import { AuthService } from './auth.service';

export interface EnqueueResponse {
  jobId: string;
  queuePosition: number;
}

export interface NoteEntry {
  path: string;
  title: string;
  hasKeywords: boolean;
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
  conceptProposals?: ConceptProposal[];
  fileEvents?: { path: string; action: string }[];
}

export interface ReindexProgress {
  processed: number;
  total: number;
}

export interface KeywordGenerationProgress {
  processed: number;
  total: number;
  updated: number;
  skipped: number;
}

export interface DiscoveredLink {
  path: string;
  title: string;
  docType: string;
  score: number;
}

export interface LinkDiscoveryProgress {
  type: 'progress';
  step: string;
  current: number;
  total: number;
}

export interface LinkDiscoveryDone {
  type: 'done';
  links: DiscoveredLink[];
}

export type LinkDiscoveryEvent = LinkDiscoveryProgress | LinkDiscoveryDone;

export interface ResourceSettings {
  resourceFolder: string;
}

export interface ConceptDedupGroup {
  canonicalFilename: string;
  files: string[];
  confidence: number;
}

export interface ConceptDedupScanProgress {
  type: 'progress';
  step: string;
  message: string;
  current: number;
  total: number;
}

export interface ConceptDedupScanWarning {
  type: 'warning';
  path: string;
}

export interface ConceptDedupScanResult {
  type: 'completed';
  groups: ConceptDedupGroup[];
}

export type ConceptDedupScanEvent = ConceptDedupScanProgress | ConceptDedupScanWarning | ConceptDedupScanResult;

export interface EmbeddingStatus {
  hasEmbedding: boolean;
  lastUpdated: string | null;
}

export interface BrokenLinkEntry {
  sourceFile: string;
  link: string;
  displayAlias: string | null;
  sourceSection: string;
}

export interface BrokenLinkScanProgress {
  type: 'progress';
  processed: number;
  total: number;
  file: string;
}

export interface BrokenLinkScanResult {
  type: 'result';
  brokenLinks: BrokenLinkEntry[];
}

export type BrokenLinkScanEvent = BrokenLinkScanProgress | BrokenLinkScanResult;

export interface SyncProgress {
  type: 'progress';
  processed: number;
  total: number;
  path: string;
}

export interface SyncDone {
  type: 'done';
  result: SyncResult;
}

export type SyncEvent = SyncProgress | SyncDone;

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GlobalSimilarityStats {
  mean: number;
  p90: number;
  p95: number;
  p99: number;
  pairCount: number;
}

export interface BenchmarkResult {
  src: string;
  tgt: string;
  expectedRelated: boolean;
  cosine: number | null;
  rkSrc: number | null;
  rkTgt: number | null;
  csls: number | null;
  predictedRelated: boolean | null;
  correct: boolean | null;
}

export interface LinkDiagnostics {
  distribution: GlobalSimilarityStats;
  margin: number;
  k: number;
  sampleSize: number;
  benchmark: BenchmarkResult[];
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

  ingestText(content: string, title: string, mode: JobMode = 'unattended'): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/ingest/text', { content, title, mode });
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

  abandonJob(jobId: string): Observable<void> {
    return this.http.post<void>(`/api/jobs/${jobId}/abandon`, {});
  }

  lookupFiles(q: string, limit = 10): Observable<FileSearchResult[]> {
    return this.http.get<FileSearchResult[]>('/api/files/lookup', { params: { q, limit: String(limit) } });
  }

  getHistory(page = 0, size = 20): Observable<HistoryPage> {
    return this.http.get<HistoryPage>('/api/history', { params: { page: String(page), size: String(size) } });
  }

  getChangeDiff(changeId: string): Observable<string> {
    return this.http.get(`/api/history/${changeId}/diff`, { responseType: 'text' });
  }

  syncWebdav(): Observable<SyncEvent> {
    return new Observable((observer: Observer<SyncEvent>) => {
      const token = this.auth.token();
      const url = token ? `/api/webdav/sync?token=${encodeURIComponent(token)}` : '/api/webdav/sync';
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as { processed: number; total: number; path: string };
        observer.next({ type: 'progress', ...data });
      });
      es.addEventListener('done', (e: MessageEvent) => {
        completed = true;
        observer.next({ type: 'done', result: JSON.parse(e.data) as SyncResult });
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data ? (JSON.parse(e.data) as { code?: string; message?: string }) : {};
        es.close();
        observer.error({ code: data.code, message: data.message ?? 'Error desconocido' });
      });
      es.onerror = () => {
        es.close();
        if (!completed) observer.error({ message: 'Error de conexión' });
      };
      return () => es.close();
    });
  }

  getConflicts(): Observable<Conflict[]> {
    return this.http.get<Conflict[]>('/api/webdav/conflicts');
  }

  resolveConflict(path: string, keep: 'LOCAL' | 'REMOTE' | 'SKIP' | 'MANUAL', content?: string): Observable<void> {
    return this.http.post<void>('/api/webdav/conflicts/resolve', {
      path,
      keep,
      ...(content !== undefined ? { content } : {}),
    });
  }

  getPrompts(): Observable<Prompt[]> {
    return this.http.get<Prompt[]>('/api/settings/prompts');
  }

  updatePrompt(key: string, text: string): Observable<Prompt> {
    return this.http.put<Prompt>(`/api/settings/prompts/${key}`, { text });
  }

  getResourceSettings(): Observable<ResourceSettings> {
    return this.http.get<ResourceSettings>('/api/settings/resources');
  }

  uploadImage(file: File): Observable<{ path: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ path: string }>('/api/files/upload-image', form);
  }

  updateResourceSettings(resourceFolder: string): Observable<ResourceSettings> {
    return this.http.put<ResourceSettings>('/api/settings/resources', { resourceFolder });
  }

  explainLink(sourcePath: string, targetPath: string): Observable<{ explanation: string }> {
    return this.http.post<{ explanation: string }>('/api/notes/explain-link', { sourcePath, targetPath });
  }

  getLinkScore(
    src: string,
    tgt: string,
  ): Observable<{ score: number | null; csls: number | null; margin: number | null; wouldLink: boolean | null }> {
    return this.http.get<{
      score: number | null;
      csls: number | null;
      margin: number | null;
      wouldLink: boolean | null;
    }>(`/api/links/score?src=${encodeURIComponent(src)}&tgt=${encodeURIComponent(tgt)}`);
  }

  getLinkDiagnostics(): Observable<LinkDiagnostics> {
    return this.http.get<LinkDiagnostics>('/api/links/diagnostics');
  }

  getLinkThreshold(): Observable<{ threshold: number }> {
    return this.http.get<{ threshold: number }>('/api/settings/link-threshold');
  }

  setLinkThreshold(threshold: number): Observable<{ threshold: number }> {
    return this.http.put<{ threshold: number }>('/api/settings/link-threshold', { threshold });
  }

  getCslsMargin(): Observable<{ margin: number }> {
    return this.http.get<{ margin: number }>('/api/settings/csls-margin');
  }

  setCslsMargin(margin: number): Observable<{ margin: number }> {
    return this.http.put<{ margin: number }>('/api/settings/csls-margin', { margin });
  }

  getHubnessK(): Observable<{ k: number }> {
    return this.http.get<{ k: number }>('/api/settings/hubness-k');
  }

  setHubnessK(k: number): Observable<{ k: number }> {
    return this.http.put<{ k: number }>('/api/settings/hubness-k', { k });
  }

  reindex(): Observable<ReindexProgress> {
    return new Observable((observer: Observer<ReindexProgress>) => {
      const token = this.auth.token();
      const url = token ? `/api/settings/reindex?token=${encodeURIComponent(token)}` : '/api/settings/reindex';
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
        const data = e.data ? (JSON.parse(e.data) as { message: string }) : { message: 'Error desconocido' };
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

  generateKeywords(): Observable<KeywordGenerationProgress> {
    return new Observable((observer: Observer<KeywordGenerationProgress>) => {
      const token = this.auth.token();
      const url = token
        ? `/api/settings/keywords/generate?token=${encodeURIComponent(token)}`
        : '/api/settings/keywords/generate';
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        observer.next(JSON.parse(e.data) as KeywordGenerationProgress);
      });
      es.addEventListener('done', (e: MessageEvent) => {
        completed = true;
        observer.next(JSON.parse(e.data) as KeywordGenerationProgress);
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data ? (JSON.parse(e.data) as { message: string }) : { message: 'Error desconocido' };
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

  enqueueHealthCheck(): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/jobs/health-check', null);
  }

  enqueueHealthCheckPartial(paths: string[]): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/jobs/health-check/partial', { paths });
  }

  scanBrokenLinks(): Observable<BrokenLinkScanEvent> {
    return new Observable((observer: Observer<BrokenLinkScanEvent>) => {
      const token = this.auth.token();
      const url = token
        ? `/api/settings/broken-links/scan?token=${encodeURIComponent(token)}`
        : '/api/settings/broken-links/scan';
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as { processed: number; total: number; file: string };
        observer.next({ type: 'progress', ...data });
      });
      es.addEventListener('result', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as { brokenLinks: BrokenLinkEntry[] };
        observer.next({ type: 'result', brokenLinks: data.brokenLinks });
      });
      es.addEventListener('done', () => {
        completed = true;
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data ? (JSON.parse(e.data) as { message: string }) : { message: 'Error desconocido' };
        es.close();
        observer.error(new Error(data.message));
      });
      es.onerror = () => {
        es.close();
        if (!completed) observer.error(new Error('Error de conexión'));
      };
      return () => es.close();
    });
  }

  deleteBrokenLinks(entries: { sourceFile: string; link: string }[]): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>('/api/settings/broken-links', { body: { entries } });
  }

  getActuatorInfo(): Observable<{ build?: { version?: string } }> {
    return this.http.get<{ build?: { version?: string } }>('/api/actuator/info');
  }

  discoverLinks(path: string): Observable<LinkDiscoveryEvent> {
    return new Observable((observer: Observer<LinkDiscoveryEvent>) => {
      const token = this.auth.token();
      const url = `/api/jobs/link-discovery-stream?path=${encodeURIComponent(path)}${token ? '&token=' + encodeURIComponent(token) : ''}`;
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as { step: string; current: number; total: number };
        observer.next({ type: 'progress', ...data });
      });
      es.addEventListener('done', (e: MessageEvent) => {
        completed = true;
        observer.next({ type: 'done', links: JSON.parse(e.data) as DiscoveredLink[] });
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data ? (JSON.parse(e.data) as { message?: string }) : {};
        es.close();
        observer.error({ message: data.message ?? 'Error desconocido' });
      });
      es.onerror = () => {
        es.close();
        if (!completed) observer.error({ message: 'Error de conexión' });
      };
      return () => es.close();
    });
  }

  enqueueEnrich(path: string): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>(`/api/jobs/enrich?path=${encodeURIComponent(path)}`, null);
  }

  scanConceptDeduplications(): Observable<ConceptDedupScanEvent> {
    return new Observable((observer: Observer<ConceptDedupScanEvent>) => {
      const token = this.auth.token();
      const url = token ? `/api/concept-dedup/scan?token=${encodeURIComponent(token)}` : '/api/concept-dedup/scan';
      const es = new EventSource(url);
      let completed = false;

      es.addEventListener('progress', (e: MessageEvent) => {
        const raw = JSON.parse(e.data) as { step: string; message: string; result: string };
        const result = JSON.parse(raw.result) as { current: number; total: number };
        if (raw.step === 'concept-dedup-warning') {
          observer.next({ type: 'warning', path: raw.message });
        } else {
          observer.next({ type: 'progress', step: raw.step, message: raw.message, ...result });
        }
      });
      es.addEventListener('completed', (e: MessageEvent) => {
        completed = true;
        const data = JSON.parse(e.data) as { groups: ConceptDedupGroup[] };
        observer.next({ type: 'completed', groups: data.groups });
        es.close();
        observer.complete();
      });
      es.addEventListener('error', (e: MessageEvent) => {
        completed = true;
        const data = e.data ? (JSON.parse(e.data) as { message?: string }) : {};
        es.close();
        observer.error(new Error(data.message ?? 'Error desconocido'));
      });
      es.onerror = () => {
        es.close();
        if (!completed) observer.error(new Error('Error de conexión'));
      };
      return () => es.close();
    });
  }

  enqueueMerge(groups: ConceptDedupGroup[]): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/concept-dedup/merge', { groups });
  }

  getActiveJobs(): Observable<import('../services/api.service').JobSummary[]> {
    return this.http.get<JobSummary[]>('/api/jobs');
  }

  regenerateKeywords(paths: string[]): Observable<EnqueueResponse> {
    return this.http.post<EnqueueResponse>('/api/keywords/regenerate', { paths });
  }

  listNotes(folders: string[]): Observable<NoteEntry[]> {
    const params = folders.map((f) => `folders=${encodeURIComponent(f)}`).join('&');
    return this.http.get<NoteEntry[]>(`/api/notes/list?${params}`);
  }

  getEmbeddingStatus(path: string): Observable<EmbeddingStatus> {
    return this.http.get<EmbeddingStatus>('/api/documents/embedding-status', {
      params: { path },
    });
  }

  getGraph(): Observable<GraphResponse> {
    return this.http.get<GraphResponse>('/api/graph');
  }
}
