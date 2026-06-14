import {
  ConflictException,
  INestApplication,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { SyncController } from './sync.controller';
import { SyncJobRegistry } from './sync-job.registry';
import { SyncService } from './sync.service';

const sessionUser: SessionUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
};

function attachSessionUser(context: ExecutionContext): boolean {
  const req = context.switchToHttp().getRequest<{ user: SessionUser }>();
  req.user = sessionUser;
  return true;
}

const authGuard = { canActivate: attachSessionUser };

describe('SyncController', () => {
  let controller: SyncController;
  let registry: SyncJobRegistry;
  let syncService: { runJob: jest.Mock };

  beforeEach(async () => {
    registry = new SyncJobRegistry();
    syncService = { runJob: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: SyncJobRegistry, useValue: registry },
        { provide: SyncService, useValue: syncService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SyncController);
  });

  it('applies JwtAuthGuard at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SyncController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  describe('startSync', () => {
    it('returns jobId and starts async runJob', () => {
      const result = controller.startSync(sessionUser);

      expect(result).toEqual({ jobId: expect.any(String) as string });
      expect(syncService.runJob).toHaveBeenCalledWith(
        sessionUser.id,
        result.jobId,
      );
    });

    it('throws ConflictException when sync already running', () => {
      controller.startSync(sessionUser);

      expect(() => controller.startSync(sessionUser)).toThrow(
        ConflictException,
      );
    });
  });

  describe('getSyncJob', () => {
    it('returns job for authenticated user', () => {
      const started = controller.startSync(sessionUser);

      const job = controller.getSyncJob(sessionUser, started.jobId);

      expect(job.id).toBe(started.jobId);
      expect(job.userId).toBe(sessionUser.id);
    });

    it('throws NotFoundException for unknown job', () => {
      expect(() => controller.getSyncJob(sessionUser, 'missing')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('HTTP', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app?.close();
    });

    it('POST /sync returns 202 and GET returns increasing processed', async () => {
      const liveRegistry = new SyncJobRegistry();
      const runJob = jest.fn((userId: string, jobId: string) => {
        liveRegistry.update(jobId, { phase: 'processing', total: 2 });
        liveRegistry.increment(jobId, 'processed');
        liveRegistry.increment(jobId, 'processed');
        liveRegistry.update(jobId, {
          status: 'completed',
          phase: 'done',
          finishedAt: new Date(),
        });
        liveRegistry.finishRunning(userId);
        return Promise.resolve();
      });

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SyncController],
        providers: [
          { provide: SyncJobRegistry, useValue: liveRegistry },
          { provide: SyncService, useValue: { runJob } },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(authGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      const startResponse = await request(server).post('/sync').expect(202);
      const { jobId } = startResponse.body as { jobId: string };

      await runJob.mock.results[0]?.value;

      const pollResponse = await request(server)
        .get(`/sync/${jobId}`)
        .expect(200);

      const body = pollResponse.body as {
        processed: number;
        status: string;
      };

      expect(body.processed).toBe(2);
      expect(body.status).toBe('completed');
    });

    it('POST /sync returns 409 when sync already running', async () => {
      const liveRegistry = new SyncJobRegistry();
      const runJob = jest.fn(() => new Promise(() => undefined));

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SyncController],
        providers: [
          { provide: SyncJobRegistry, useValue: liveRegistry },
          { provide: SyncService, useValue: { runJob } },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(authGuard)
        .compile();

      app = module.createNestApplication();
      await app.init();

      const server = app.getHttpServer() as Server;

      await request(server).post('/sync').expect(202);
      await request(server).post('/sync').expect(409);
    });
  });
});
