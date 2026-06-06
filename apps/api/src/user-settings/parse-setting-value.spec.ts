import {
  parseSettingValue,
  serializeSettingValue,
} from './parse-setting-value';
import { USER_SETTING_KEYS } from './user-setting-keys';

describe('parseSettingValue', () => {
  it('trims gmail scan label on read', () => {
    expect(
      parseSettingValue(USER_SETTING_KEYS.GMAIL_SCAN_LABEL, '  MyLabel  '),
    ).toBe('MyLabel');
  });

  it('falls back to default for empty gmail scan label', () => {
    expect(parseSettingValue(USER_SETTING_KEYS.GMAIL_SCAN_LABEL, '')).toBe(
      'ParcelScrubber',
    );
    expect(parseSettingValue(USER_SETTING_KEYS.GMAIL_SCAN_LABEL, '   ')).toBe(
      'ParcelScrubber',
    );
  });

  it('falls back to default for gmail scan label over max length', () => {
    expect(
      parseSettingValue(USER_SETTING_KEYS.GMAIL_SCAN_LABEL, 'a'.repeat(101)),
    ).toBe('ParcelScrubber');
  });

  it('parses valid scan period days', () => {
    expect(parseSettingValue(USER_SETTING_KEYS.SCAN_PERIOD_DAYS, '90')).toBe(
      90,
    );
  });

  it('falls back to default for non-numeric scan period', () => {
    expect(
      parseSettingValue(USER_SETTING_KEYS.SCAN_PERIOD_DAYS, 'not-a-number'),
    ).toBe(30);
  });

  it('falls back to default for out-of-range scan period', () => {
    expect(parseSettingValue(USER_SETTING_KEYS.SCAN_PERIOD_DAYS, '0')).toBe(30);
    expect(parseSettingValue(USER_SETTING_KEYS.SCAN_PERIOD_DAYS, '366')).toBe(
      30,
    );
  });
});

describe('serializeSettingValue', () => {
  it('round-trips gmail scan label', () => {
    const value = 'CustomLabel';
    const serialized = serializeSettingValue(
      USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
      value,
    );
    expect(
      parseSettingValue(USER_SETTING_KEYS.GMAIL_SCAN_LABEL, serialized),
    ).toBe(value);
  });

  it('round-trips scan period days', () => {
    const value = 45;
    const serialized = serializeSettingValue(
      USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
      value,
    );
    expect(
      parseSettingValue(USER_SETTING_KEYS.SCAN_PERIOD_DAYS, serialized),
    ).toBe(value);
  });
});
