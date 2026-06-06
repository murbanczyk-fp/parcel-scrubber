import { GMAIL_SCAN_LABEL_MAX_LENGTH } from './normalize-gmail-scan-label';
import {
  DEFAULT_USER_SETTINGS,
  USER_SETTING_KEYS,
  type UserSettingKey,
} from './user-setting-keys';
import {
  SCAN_PERIOD_DAYS_MAX,
  SCAN_PERIOD_DAYS_MIN,
} from './validate-scan-period-days';

function parseGmailScanLabel(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length === 0 || trimmed.length > GMAIL_SCAN_LABEL_MAX_LENGTH) {
    return DEFAULT_USER_SETTINGS.gmailScanLabel;
  }

  return trimmed;
}

function parseScanPeriodDays(raw: string): number {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return DEFAULT_USER_SETTINGS.scanPeriodDays;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (parsed < SCAN_PERIOD_DAYS_MIN || parsed > SCAN_PERIOD_DAYS_MAX) {
    return DEFAULT_USER_SETTINGS.scanPeriodDays;
  }

  return parsed;
}

export function parseSettingValue(
  key: UserSettingKey,
  raw: string,
): string | number {
  switch (key) {
    case USER_SETTING_KEYS.GMAIL_SCAN_LABEL:
      return parseGmailScanLabel(raw);
    case USER_SETTING_KEYS.SCAN_PERIOD_DAYS:
      return parseScanPeriodDays(raw);
  }
}

/** Caller must validate via `normalizeGmailScanLabel` or `validateScanPeriodDays` before persisting. */
export function serializeSettingValue(
  key: UserSettingKey,
  value: string | number,
): string {
  switch (key) {
    case USER_SETTING_KEYS.GMAIL_SCAN_LABEL:
      return String(value);
    case USER_SETTING_KEYS.SCAN_PERIOD_DAYS:
      return String(value);
  }
}
