import { Carrier } from '@prisma/client';

export const CARRIER_URL_CONTRACT_CASES = [
  {
    carrier: Carrier.INPOST,
    trackingNumber: '520000012680041086770098',
    expectedUrl:
      'https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098',
  },
  {
    carrier: Carrier.POCZTA_POLSKA,
    trackingNumber: 'RR123456789PL',
    expectedUrl: 'https://emonitoring.poczta-polska.pl/?numer=RR123456789PL',
  },
  {
    carrier: Carrier.DPD,
    trackingNumber: '0000123525123U',
    expectedUrl:
      'https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=0000123525123U',
  },
  {
    carrier: Carrier.DHL,
    trackingNumber: '3SBCC000123456',
    expectedUrl:
      'https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=3SBCC000123456',
  },
] as const;
