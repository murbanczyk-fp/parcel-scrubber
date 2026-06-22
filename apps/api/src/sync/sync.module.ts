import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { GmailModule } from '../gmail/gmail.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncController } from './sync.controller';
import { SyncTestController } from './sync-test.controller';
import { SyncJobRegistry } from './sync-job.registry';
import { SyncService } from './sync.service';

const testControllers =
  process.env.NODE_ENV === 'production' ? [] : [SyncTestController];

@Module({
  imports: [AuthModule, GmailModule, ExtractionModule, SettingsModule],
  controllers: [SyncController, ...testControllers],
  providers: [SyncJobRegistry, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
