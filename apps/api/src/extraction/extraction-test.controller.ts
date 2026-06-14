import {
  BadGatewayException,
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
import { GmailService } from '../gmail/gmail.service';
import { GmailAuthError } from '../gmail/types';
import { ExtractionService } from './extraction.service';
import { ExtractionError, type ExtractTestResponse } from './types';

@Controller('test')
@UseGuards(JwtAuthGuard)
export class ExtractionTestController {
  constructor(
    private readonly gmail: GmailService,
    private readonly extraction: ExtractionService,
  ) {}

  @Get('extract')
  async extract(
    @CurrentUser() user: SessionUser,
    @Query('id') messageId?: string,
  ): Promise<ExtractTestResponse> {
    if (!messageId?.trim()) {
      throw new BadRequestException('Query parameter "id" is required');
    }

    try {
      const message = await this.gmail.getMessage(user.id, messageId);
      const result = await this.extraction.extractParcelFields(message);
      return { message, result };
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  private rethrowKnownErrors(error: unknown): never {
    if (error instanceof GmailAuthError) {
      throw new UnauthorizedException(
        'Gmail re-authentication required. Sign in with Google again.',
      );
    }

    if (error instanceof ExtractionError) {
      throw new BadGatewayException(
        'Parcel extraction failed. Check OpenRouter configuration and try again.',
      );
    }

    throw error;
  }
}
