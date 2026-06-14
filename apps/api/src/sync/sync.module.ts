import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { GmailModule } from '../gmail/gmail.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncController } from './sync.controller';
import { SyncJobRegistry } from './sync-job.registry';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, GmailModule, ExtractionModule, SettingsModule],
  controllers: [SyncController],
  providers: [SyncJobRegistry, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
