import { previewGeneratedTrackingUrl } from './preview-generated-tracking-url';

const CARRIER_URL_CONTRACT_CASES = [
  {
    carrier: 'INPOST',
    trackingNumber: '520000012680041086770098',
    expectedUrl:
      'https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
  },
  {
    carrier: 'POCZTA_POLSKA',
    trackingNumber: 'RR123456789PL',
    expectedUrl: 'https://emonitoring.poczta-polska.pl/?numer=RR123456789PL',
  },
  {
    carrier: 'DPD',
    trackingNumber: '0000123525123U',
    expectedUrl:
      'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=0000123525123U',
  },
  {
    carrier: 'DHL',
    trackingNumber: '3SBCC000123456',
    expectedUrl:
      'https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=3SBCC000123456',
  },
] as const;

describe('previewGeneratedTrackingUrl', () => {
  it.each(CARRIER_URL_CONTRACT_CASES)(
    'previews the exact $carrier contract URL',
    ({ carrier, trackingNumber, expectedUrl }) => {
      expect(previewGeneratedTrackingUrl(carrier, trackingNumber)).toBe(
        expectedUrl,
      );
    },
  );

  it('normalizes whitespace and case', () => {
    expect(
      previewGeneratedTrackingUrl('POCZTA_POLSKA', ' rr 123 456 789 pl '),
    ).toBe('https://emonitoring.poczta-polska.pl/?numer=RR123456789PL');
  });

  it('URL-encodes special characters after normalization', () => {
    expect(previewGeneratedTrackingUrl('DPD', ' a+b/c ')).toBe(
      'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=A%2BB%2FC',
    );
  });

  it('returns null for blank input', () => {
    expect(previewGeneratedTrackingUrl('DHL', '   ')).toBeNull();
  });

  it('returns null for CUSTOM', () => {
    expect(previewGeneratedTrackingUrl('CUSTOM', 'ANY123')).toBeNull();
  });
});
