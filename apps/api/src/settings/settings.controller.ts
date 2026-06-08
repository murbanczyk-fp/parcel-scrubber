import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/types';
import type { EffectiveUserSettings } from '../user-settings';
import { SettingsValidationError } from './settings-validation.error';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getSettings(
    @CurrentUser() user: SessionUser,
  ): Promise<EffectiveUserSettings> {
    return this.settings.getEffectiveSettings(user.id);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async patchSettings(
    @CurrentUser() user: SessionUser,
    @Body() body: Partial<EffectiveUserSettings>,
  ): Promise<EffectiveUserSettings> {
    try {
      return await this.settings.updateSettings(user.id, body);
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        throw new BadRequestException({ errors: err.errors });
      }

      throw err;
    }
  }
}
