import { SyncJobRegistry } from './sync-job.registry';

describe('SyncJobRegistry', () => {
  let registry: SyncJobRegistry;

  beforeEach(() => {
    registry = new SyncJobRegistry();
  });

  it('starts a job and returns jobId', () => {
    const started = registry.start('user-1');

    expect(started).toEqual({ jobId: expect.any(String) as string });
    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      userId: 'user-1',
      status: 'running',
      phase: 'listing',
      processed: 0,
      total: 0,
    });
  });

  it('returns null when user already has a running job', () => {
    const first = registry.start('user-1');
    const second = registry.start('user-1');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('allows a new job after the previous job finishes running', () => {
    const first = registry.start('user-1');
    registry.finishRunning('user-1');
    registry.update(first!.jobId, { status: 'completed' });

    const second = registry.start('user-1');

    expect(second).not.toBeNull();
    expect(second!.jobId).not.toBe(first!.jobId);
  });

  it('returns null for wrong user on get', () => {
    const started = registry.start('user-1');

    expect(registry.get(started!.jobId, 'user-2')).toBeNull();
  });

  it('increments counters', () => {
    const started = registry.start('user-1');
    registry.increment(started!.jobId, 'processed');
    registry.increment(started!.jobId, 'imported', 2);

    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      processed: 1,
      imported: 2,
    });
  });
});
