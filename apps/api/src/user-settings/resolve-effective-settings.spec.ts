import { resolveEffectiveSettings } from './resolve-effective-settings';
import { USER_SETTING_KEYS } from './user-setting-keys';

describe('resolveEffectiveSettings', () => {
  it('returns PRD defaults for empty rows', () => {
    expect(resolveEffectiveSettings([])).toEqual({
      gmailScanLabel: 'ParcelScrubber',
      scanPeriodDays: 30,
    });
  });

  it('merges a single overridden key', () => {
    expect(
      resolveEffectiveSettings([
        {
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'MyParcels',
        },
      ]),
    ).toEqual({
      gmailScanLabel: 'MyParcels',
      scanPeriodDays: 30,
    });
  });

  it('merges both keys when set', () => {
    expect(
      resolveEffectiveSettings([
        {
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'Shipments',
        },
        {
          settingKey: USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
          settingValue: '14',
        },
      ]),
    ).toEqual({
      gmailScanLabel: 'Shipments',
      scanPeriodDays: 14,
    });
  });

  it('ignores unknown keys', () => {
    expect(
      resolveEffectiveSettings([
        {
          settingKey: 'futureSetting',
          settingValue: 'ignored',
        },
      ]),
    ).toEqual({
      gmailScanLabel: 'ParcelScrubber',
      scanPeriodDays: 30,
    });
  });

  it('falls back to defaults for corrupt stored values per key', () => {
    expect(
      resolveEffectiveSettings([
        {
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: '',
        },
        {
          settingKey: USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
          settingValue: 'abc',
        },
      ]),
    ).toEqual({
      gmailScanLabel: 'ParcelScrubber',
      scanPeriodDays: 30,
    });
  });

  it('falls back only the corrupt key when one key is valid', () => {
    expect(
      resolveEffectiveSettings([
        {
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'ValidLabel',
        },
        {
          settingKey: USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
          settingValue: '999',
        },
      ]),
    ).toEqual({
      gmailScanLabel: 'ValidLabel',
      scanPeriodDays: 30,
    });
  });
});
