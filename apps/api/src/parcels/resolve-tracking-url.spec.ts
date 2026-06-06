import { Carrier } from '@prisma/client';

import { resolveTrackingUrl } from './resolve-tracking-url';

describe('resolveTrackingUrl', () => {
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

  it('generates carrier URL with normalized tracking number', () => {
    expect(
      resolveTrackingUrl({
        trackingUrl: null,
        carrier: Carrier.INPOST,
        trackingNumber: '5200 0001 2680 0410 8677 0098',
      }),
    ).toBe(
      'https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
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
});
