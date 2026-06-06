import { normalizeGmailScanLabel } from './normalize-gmail-scan-label';

describe('normalizeGmailScanLabel', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeGmailScanLabel('  ParcelScrubber  ')).toBe(
      'ParcelScrubber',
    );
  });

  it('throws on empty label', () => {
    expect(() => normalizeGmailScanLabel('')).toThrow(
      'Gmail scan label must not be empty',
    );
    expect(() => normalizeGmailScanLabel('   ')).toThrow(
      'Gmail scan label must not be empty',
    );
  });

  it('accepts label at max length boundary', () => {
    const label = 'a'.repeat(100);
    expect(normalizeGmailScanLabel(label)).toBe(label);
  });

  it('throws when label exceeds max length', () => {
    expect(() => normalizeGmailScanLabel('a'.repeat(101))).toThrow(
      'Gmail scan label must be at most 100 characters',
    );
  });
});
