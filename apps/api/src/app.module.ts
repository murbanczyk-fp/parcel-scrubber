import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { resolveEnvFilePaths } from './config/env-files';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { GmailModule } from './gmail/gmail.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ParcelsModule } from './parcels/parcels.module';
import { SettingsModule } from './settings/settings.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    SettingsModule,
    GmailModule,
    ExtractionModule,
    SyncModule,
    ParcelsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
