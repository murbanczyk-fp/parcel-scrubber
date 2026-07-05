import type { ParcelCarrier } from './parcels.types';

const CARRIER_URL_BUILDERS: Partial<
  Record<Exclude<ParcelCarrier, 'CUSTOM'>, (trackingNumber: string) => string>
> = {
  INPOST: (trackingNumber) =>
    `https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(trackingNumber)}`,
  POCZTA_POLSKA: (trackingNumber) =>
    `https://emonitoring.poczta-polska.pl/?numer=${encodeURIComponent(trackingNumber)}`,
  DPD: (trackingNumber) =>
    `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${encodeURIComponent(trackingNumber)}`,
  DHL: (trackingNumber) =>
    `https://www.dhl.com/pl-pl/home/tracking.html?locale=true&submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`,
};

export function previewGeneratedTrackingUrl(
  carrier: ParcelCarrier,
  trackingNumber: string,
): string | null {
  if (carrier === 'CUSTOM') {
    return null;
  }

  const normalized = trackingNumber.trim().replace(/\s+/g, '').toUpperCase();
  if (normalized.length === 0) {
    return null;
  }

  const builder = CARRIER_URL_BUILDERS[carrier];
  return builder ? builder(normalized) : null;
}
