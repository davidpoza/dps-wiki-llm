export type JobMode = 'unattended' | 'validated';

export interface SnapshotFileStat {
  path: string;
  added: number;
  deleted: number;
}

export interface Snapshot {
  id: string;
  operationType: string;
  message: string;
  createdAt: string;
  files: SnapshotFileStat[];
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
  path: string;
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
