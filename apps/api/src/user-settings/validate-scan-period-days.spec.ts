import { validateScanPeriodDays } from './validate-scan-period-days';

describe('validateScanPeriodDays', () => {
  it('accepts minimum boundary', () => {
    expect(validateScanPeriodDays(1)).toBe(1);
  });

  it('accepts maximum boundary', () => {
    expect(validateScanPeriodDays(365)).toBe(365);
  });

  it('throws below minimum', () => {
    expect(() => validateScanPeriodDays(0)).toThrow(
      'Scan period days must be between 1 and 365',
    );
  });

  it('throws above maximum', () => {
    expect(() => validateScanPeriodDays(366)).toThrow(
      'Scan period days must be between 1 and 365',
    );
  });

  it('throws for non-integer values', () => {
    expect(() => validateScanPeriodDays(30.5)).toThrow(
      'Scan period days must be an integer',
    );
  });
});
