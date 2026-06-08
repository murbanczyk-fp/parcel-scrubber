import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { GmailService } from './gmail.service';
import { GmailTestController } from './gmail-test.controller';
import { GoogleOAuthClientFactory } from './google-oauth-client.factory';

const testControllers =
  process.env.NODE_ENV === 'production' ? [] : [GmailTestController];

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: testControllers,
  providers: [GmailService, GoogleOAuthClientFactory],
  exports: [GmailService],
})
export class GmailModule {}
