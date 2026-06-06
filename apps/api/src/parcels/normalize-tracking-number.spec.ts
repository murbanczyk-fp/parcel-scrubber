import { normalizeTrackingNumber } from './normalize-tracking-number';

describe('normalizeTrackingNumber', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTrackingNumber('  abc123  ')).toBe('ABC123');
  });

  it('removes internal whitespace', () => {
    expect(normalizeTrackingNumber('5200 0001 2680 0410 8677 0098')).toBe(
      '520000012680041086770098',
    );
  });

  it('uppercases letters', () => {
    expect(normalizeTrackingNumber('rr123456789pl')).toBe('RR123456789PL');
  });

  it.each([null, undefined, '', '   ', '\t\n'])(
    'returns null for empty input %j',
    (input) => {
      expect(normalizeTrackingNumber(input)).toBeNull();
    },
  );
});
