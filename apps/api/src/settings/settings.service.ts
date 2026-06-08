import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EffectiveUserSettings,
  normalizeGmailScanLabel,
  resolveEffectiveSettings,
  serializeSettingValue,
  USER_SETTING_KEYS,
  type UserSettingKey,
  validateScanPeriodDays,
} from '../user-settings';
import {
  SettingsFieldError,
  SettingsValidationError,
} from './settings-validation.error';

const PATCH_KEYS = ['gmailScanLabel', 'scanPeriodDays'] as const;
type PatchKey = (typeof PATCH_KEYS)[number];

function isPatchKey(key: string): key is PatchKey {
  return (PATCH_KEYS as readonly string[]).includes(key);
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveSettings(userId: string): Promise<EffectiveUserSettings> {
    const rows = await this.prisma.userSetting.findMany({
      where: { userId },
      select: { settingKey: true, settingValue: true },
    });

    return resolveEffectiveSettings(rows);
  }

  async updateSettings(
    userId: string,
    patch: Partial<EffectiveUserSettings>,
  ): Promise<EffectiveUserSettings> {
    const keys = Object.keys(patch);

    if (keys.length === 0) {
      throw new SettingsValidationError([
        { message: 'Request body must include at least one setting' },
      ]);
    }

    const unknownKeys = keys.filter((key) => !isPatchKey(key));

    if (unknownKeys.length > 0) {
      throw new SettingsValidationError([
        {
          message: `Unknown setting key(s): ${unknownKeys.join(', ')}`,
        },
      ]);
    }

    const errors: SettingsFieldError[] = [];
    const validated: { key: UserSettingKey; value: string | number }[] = [];

    for (const key of keys as PatchKey[]) {
      if (key === 'gmailScanLabel') {
        try {
          const value = normalizeGmailScanLabel(String(patch.gmailScanLabel));
          validated.push({
            key: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
            value,
          });
        } catch (err) {
          if (err instanceof Error) {
            errors.push({ field: key, message: err.message });
          }
        }
      } else if (key === 'scanPeriodDays') {
        const raw = Number(patch.scanPeriodDays);

        if (Number.isNaN(raw)) {
          errors.push({
            field: 'scanPeriodDays',
            message: 'Scan period days must be a number',
          });
        } else {
          try {
            const value = validateScanPeriodDays(raw);
            validated.push({
              key: USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
              value,
            });
          } catch (err) {
            if (err instanceof Error) {
              errors.push({ field: key, message: err.message });
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new SettingsValidationError(errors);
    }

    for (const { key, value } of validated) {
      const settingValue = serializeSettingValue(key, value);

      await this.prisma.userSetting.upsert({
        where: {
          userId_settingKey: { userId, settingKey: key },
        },
        create: { userId, settingKey: key, settingValue },
        update: { settingValue },
      });
    }

    return this.getEffectiveSettings(userId);
  }
}
