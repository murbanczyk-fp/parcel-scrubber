import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import { SettingsService } from '../settings/settings.service';
import {
  normalizeGmailScanLabel,
  validateScanPeriodDays,
} from '../user-settings';
import { GmailService } from './gmail.service';
import { GmailAuthError, type GmailMessage } from './types';

@Controller('test')
@UseGuards(JwtAuthGuard)
export class GmailTestController {
  constructor(
    private readonly gmail: GmailService,
    private readonly settings: SettingsService,
  ) {}

  @Get('matching-email-ids')
  async matchingEmailIds(
    @CurrentUser() user: SessionUser,
    @Query('label') label?: string,
    @Query('scanPeriodDays') scanPeriodDaysRaw?: string,
  ): Promise<string[]> {
    const effective = await this.settings.getEffectiveSettings(user.id);
    const resolvedLabel =
      label !== undefined
        ? this.resolveLabelQueryParam(label)
        : effective.gmailScanLabel;
    const scanPeriodDays = this.resolveScanPeriodDays(
      scanPeriodDaysRaw,
      effective.scanPeriodDays,
    );

    try {
      return await this.gmail.listMatchingEmailIds(
        user.id,
        resolvedLabel,
        scanPeriodDays,
      );
    } catch (error) {
      this.rethrowGmailAuthError(error);
    }
  }

  @Get('email')
  async email(
    @CurrentUser() user: SessionUser,
    @Query('id') messageId?: string,
  ): Promise<GmailMessage> {
    if (!messageId?.trim()) {
      throw new BadRequestException('Query parameter "id" is required');
    }

    try {
      return await this.gmail.getMessage(user.id, messageId);
    } catch (error) {
      this.rethrowGmailAuthError(error);
    }
  }

  private resolveLabelQueryParam(raw: string): string {
    try {
      return normalizeGmailScanLabel(raw);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid Gmail scan label';
      throw new BadRequestException(message);
    }
  }

  private resolveScanPeriodDays(
    raw: string | undefined,
    fallback: number,
  ): number {
    if (raw === undefined) {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('scanPeriodDays must be a number');
    }

    try {
      return validateScanPeriodDays(parsed);
    } catch {
      throw new BadRequestException(
        'scanPeriodDays must be an integer between 1 and 365',
      );
    }
  }

  private rethrowGmailAuthError(error: unknown): never {
    if (error instanceof GmailAuthError) {
      throw new UnauthorizedException(
        'Gmail re-authentication required. Sign in with Google again.',
      );
    }

    throw error;
  }
}
