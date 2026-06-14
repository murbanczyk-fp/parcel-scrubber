import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GmailModule } from '../gmail/gmail.module';
import { ExtractionService } from './extraction.service';
import { ExtractionTestController } from './extraction-test.controller';
import { OpenRouterClient } from './openrouter-client';

const testControllers =
  process.env.NODE_ENV === 'production' ? [] : [ExtractionTestController];

@Module({
  imports: [AuthModule, GmailModule],
  controllers: testControllers,
  providers: [ExtractionService, OpenRouterClient],
  exports: [ExtractionService],
})
export class ExtractionModule {}
