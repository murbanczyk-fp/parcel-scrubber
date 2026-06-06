import type { UserSetting } from '@prisma/client';

import { parseSettingValue } from './parse-setting-value';
import {
  DEFAULT_USER_SETTINGS,
  USER_SETTING_KEYS,
  type UserSettingKey,
} from './user-setting-keys';

export type EffectiveUserSettings = {
  gmailScanLabel: string;
  scanPeriodDays: number;
};

const KNOWN_SETTING_KEYS = new Set<string>(Object.values(USER_SETTING_KEYS));

function isUserSettingKey(key: string): key is UserSettingKey {
  return KNOWN_SETTING_KEYS.has(key);
}

export function resolveEffectiveSettings(
  rows: ReadonlyArray<Pick<UserSetting, 'settingKey' | 'settingValue'>>,
): EffectiveUserSettings {
  const effective: EffectiveUserSettings = { ...DEFAULT_USER_SETTINGS };

  for (const row of rows) {
    if (!isUserSettingKey(row.settingKey)) {
      continue;
    }

    const parsed = parseSettingValue(row.settingKey, row.settingValue);

    if (row.settingKey === USER_SETTING_KEYS.GMAIL_SCAN_LABEL) {
      effective.gmailScanLabel = parsed as string;
    } else if (row.settingKey === USER_SETTING_KEYS.SCAN_PERIOD_DAYS) {
      effective.scanPeriodDays = parsed as number;
    }
  }

  return effective;
}
