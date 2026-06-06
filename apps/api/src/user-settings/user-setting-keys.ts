export const USER_SETTING_KEYS = {
  GMAIL_SCAN_LABEL: 'gmailScanLabel',
  SCAN_PERIOD_DAYS: 'scanPeriodDays',
} as const;

export type UserSettingKey =
  (typeof USER_SETTING_KEYS)[keyof typeof USER_SETTING_KEYS];

export const DEFAULT_USER_SETTINGS = {
  gmailScanLabel: 'ParcelScrubber',
  scanPeriodDays: 30,
} as const;
