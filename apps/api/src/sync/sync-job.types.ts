export type SyncJobPhase = 'listing' | 'processing' | 'done';

export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type SyncJob = {
  id: string;
  userId: string;
  status: SyncJobStatus;
  phase: SyncJobPhase;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
  errorCode?: string;
  startedAt: Date;
  finishedAt?: Date;
};
