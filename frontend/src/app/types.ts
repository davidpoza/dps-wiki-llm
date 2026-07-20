export type JobMode = 'unattended' | 'validated';

export type ChangeSource = 'LOCAL_EDIT' | 'JOB' | 'WEBDAV_PULL';

/** A single per-file change entry in the flat history stream. */
export interface FileHistoryEntry {
  changeId: string;
  path: string;
  source: ChangeSource;
  linesAdded: number;
  linesDeleted: number;
  createdAt: string;
}

/** Paginated response for the change history endpoint. */
export interface HistoryPage {
  content: FileHistoryEntry[];
  totalElements: number;
  page: number;
  size: number;
}

/** A prior version of a single file, for the editor version-preview control. */
export interface FileVersion {
  versionId: string;
  createdAt: string;
  source: ChangeSource;
}

/** Summary returned by a WebDAV sync run. */
export interface SyncResult {
  pulled: string[];
  deleted: string[];
  conflicts: string[];
}

/** An unresolved WebDAV sync conflict, with both sides for side-by-side display. */
export interface Conflict {
  path: string;
  localContent: string;
  remoteContent: string;
}
export type JobStatus = 'QUEUED' | 'STARTED' | 'PROGRESS' | 'AWAITING_REVIEW' | 'COMPLETED' | 'FAILED' | 'REVERTED' | 'CANCELLED';

export interface JobPhase {
  step: string;
  message: string;
}

export interface JobFileEvent {
  path: string;
  action: string;
}

export interface SseJobEvent {
  type: JobStatus;
  jobId: string;
  jobType: string;
  queuePosition: number;
  step: string;
  path?: string;
  action?: string;
  message?: string;
  result?: string;
}

export interface ScanActivity {
  label: string;
  path?: string;
  percent: number;
}

export interface JobState {
  id: string;
  type: string;
  status: JobStatus;
  queuePosition?: number;
  phases: JobPhase[];
  files: JobFileEvent[];
  currentActivity?: ScanActivity | null;
  result?: string;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}
