import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { GmailAuthError } from '../gmail/types';
import type { SyncJob } from './sync-job.types';
import { SyncJobRegistry } from './sync-job.registry';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(
    private readonly registry: SyncJobRegistry,
    private readonly sync: SyncService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  startSync(@CurrentUser() user: SessionUser): { jobId: string } {
    const started = this.registry.start(user.id);
    if (!started) {
      throw new ConflictException(
        'A sync job is already running for this user',
      );
    }

    void this.sync.runJob(user.id, started.jobId).catch((error: unknown) => {
      if (!(error instanceof GmailAuthError)) {
        throw error;
      }
    });

    return started;
  }

  @Get(':jobId')
  getSyncJob(
    @CurrentUser() user: SessionUser,
    @Param('jobId') jobId: string,
  ): SyncJob {
    const job = this.registry.get(jobId, user.id);
    if (!job) {
      throw new NotFoundException('Sync job not found');
    }

    return job;
  }
}
