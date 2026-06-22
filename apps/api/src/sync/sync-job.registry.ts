import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SyncJob, SyncJobPhase, SyncJobStatus } from './sync-job.types';

@Injectable()
export class SyncJobRegistry {
  private readonly jobs = new Map<string, SyncJob>();
  private readonly runningByUser = new Map<string, string>();

  start(userId: string): { jobId: string } | null {
    const existingJobId = this.runningByUser.get(userId);
    if (existingJobId) {
      const existing = this.jobs.get(existingJobId);
      if (existing?.status === 'running') {
        return null;
      }
    }

    const jobId = randomUUID();
    const job: SyncJob = {
      id: jobId,
      userId,
      status: 'running',
      phase: 'listing',
      total: 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      startedAt: new Date(),
    };

    this.jobs.set(jobId, job);
    this.runningByUser.set(userId, jobId);
    return { jobId };
  }

  get(jobId: string, userId: string): SyncJob | null {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      return null;
    }

    return job;
  }

  update(
    jobId: string,
    patch: Partial<
      Pick<
        SyncJob,
        | 'status'
        | 'phase'
        | 'total'
        | 'processed'
        | 'imported'
        | 'skipped'
        | 'failed'
        | 'error'
        | 'errorCode'
        | 'finishedAt'
      >
    >,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    Object.assign(job, patch);
  }

  increment(
    jobId: string,
    field: 'processed' | 'imported' | 'skipped' | 'failed',
    amount = 1,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job[field] += amount;
  }

  finishRunning(userId: string): void {
    this.runningByUser.delete(userId);
  }

  isUserRunning(userId: string): boolean {
    const jobId = this.runningByUser.get(userId);
    if (!jobId) {
      return false;
    }

    return this.jobs.get(jobId)?.status === 'running';
  }

  setPhase(jobId: string, phase: SyncJobPhase): void {
    this.update(jobId, { phase });
  }

  setStatus(jobId: string, status: SyncJobStatus): void {
    this.update(jobId, { status });
  }
}
