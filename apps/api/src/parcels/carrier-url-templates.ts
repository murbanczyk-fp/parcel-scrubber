import { Carrier } from '@prisma/client';

/**
 * v1 carrier tracking URL patterns (Poland). Verify against live sites after deploy.
 *
 * Reference numbers used in unit tests:
 * - INPOST: 520000012680041086770098 (24 digits)
 * - POCZTA_POLSKA: RR123456789PL (13 chars, letter prefix + PL suffix)
 * - DPD: 0000123525123U (14 chars, domestic format)
 * - DHL: 3SBCC000123456 (DHL Parcel prefix)
 */
const CARRIER_URL_BUILDERS: Partial<
  Record<Carrier, (trackingNumber: string) => string>
> = {
  // https://inpost.pl/sledzenie-przesylek?number=520000012680041086770098
  [Carrier.INPOST]: (trackingNumber) =>
    `https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(trackingNumber)}`,

  // https://emonitoring.poczta-polska.pl/?numer=RR123456789PL
  // Note: may require manual entry on some browsers; query param is best-effort v1.
  [Carrier.POCZTA_POLSKA]: (trackingNumber) =>
    `https://emonitoring.poczta-polska.pl/?numer=${encodeURIComponent(trackingNumber)}`,

  // https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=0000123525123U
  [Carrier.DPD]: (trackingNumber) =>
    `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${encodeURIComponent(trackingNumber)}`,

  // https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=3SBCC000123456
  [Carrier.DHL]: (trackingNumber) =>
    `https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`,
};

export function buildCarrierUrl(
  carrier: Carrier,
  trackingNumber: string,
): string | null {
  const builder = CARRIER_URL_BUILDERS[carrier];
  return builder ? builder(trackingNumber) : null;
}
