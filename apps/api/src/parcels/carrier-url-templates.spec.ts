import { Carrier } from '@prisma/client';

import { buildCarrierUrl } from './carrier-url-templates';

describe('buildCarrierUrl', () => {
  it('builds InPost URL with encoded tracking number', () => {
    const trackingNumber = '520000012680041086770098';
    expect(buildCarrierUrl(Carrier.INPOST, trackingNumber)).toBe(
      `https://inpost.pl/sledzenie-przesylek?number=${trackingNumber}`,
    );
  });

  it('builds Poczta Polska URL with encoded tracking number', () => {
    const trackingNumber = 'RR123456789PL';
    expect(buildCarrierUrl(Carrier.POCZTA_POLSKA, trackingNumber)).toBe(
      `https://emonitoring.poczta-polska.pl/?numer=${trackingNumber}`,
    );
  });

  it('builds DPD URL with encoded tracking number', () => {
    const trackingNumber = '0000123525123U';
    expect(buildCarrierUrl(Carrier.DPD, trackingNumber)).toBe(
      `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${trackingNumber}`,
    );
  });

  it('builds DHL URL with encoded tracking number', () => {
    const trackingNumber = '3SBCC000123456';
    expect(buildCarrierUrl(Carrier.DHL, trackingNumber)).toBe(
      `https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=${trackingNumber}`,
    );
  });

  it('returns null for CUSTOM carrier', () => {
    expect(buildCarrierUrl(Carrier.CUSTOM, 'ANY123')).toBeNull();
  });

  it('URL-encodes special characters in tracking number', () => {
    expect(buildCarrierUrl(Carrier.DHL, 'A+B/C')).toBe(
      'https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=A%2BB%2FC',
    );
  });
});
