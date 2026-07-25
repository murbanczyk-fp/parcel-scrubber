import { Carrier } from '@prisma/client';

import { CARRIER_URL_CONTRACT_CASES } from '../../test/fixtures/carrier-url-contract-cases';
import { resolveTrackingUrl } from './resolve-tracking-url';

describe('resolveTrackingUrl', () => {
  it.each(CARRIER_URL_CONTRACT_CASES)(
    'resolves the exact $carrier contract URL without an override',
    ({ carrier, trackingNumber, expectedUrl }) => {
      expect(
        resolveTrackingUrl({
          trackingUrl: null,
          carrier,
          trackingNumber,
        }),
      ).toBe(expectedUrl);
    },
  );

  it('returns trackingUrl override when set', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: 'https://example.com/track/123',
        carrier: Carrier.INPOST,
        trackingNumber: '520000012680041086770098',
      }),
    ).toBe('https://example.com/track/123');
  });

  it('returns null for CUSTOM carrier without override', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: null,
        carrier: Carrier.CUSTOM,
        trackingNumber: 'ANY123',
      }),
    ).toBeNull();
  });

  it('returns null when tracking number normalizes to empty', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: null,
        carrier: Carrier.DPD,
        trackingNumber: '   ',
      }),
    ).toBeNull();
  });

  it('generates a carrier URL with normalized tracking number', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: null,
        carrier: Carrier.DPD,
        trackingNumber: ' 0000 1235 2512 3u ',
      }),
    ).toBe(
      'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=0000123525123U',
    );
  });

  it('prefers override over generated URL even for known carrier', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: 'https://custom.example/override',
        carrier: Carrier.DHL,
        trackingNumber: '3SBCC000123456',
      }),
    ).toBe('https://custom.example/override');
  });

  it('ignores unsafe tracking URL override and falls back to generated URL', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: 'javascript:alert(1)',
        carrier: Carrier.INPOST,
        trackingNumber: '520000012680041086770098',
      }),
    ).toBe(
      'https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
    );
  });
});
