import { Carrier, Parcel } from '@prisma/client';

import { buildCarrierUrl } from './carrier-url-templates';
import { isSafeHttpUrl } from './is-safe-http-url';
import { normalizeTrackingNumber } from './normalize-tracking-number';

export function resolveTrackingUrl(
  parcel: Pick<Parcel, 'trackingUrl' | 'carrier' | 'trackingNumber'>,
): string | null {
  if (parcel.trackingUrl && isSafeHttpUrl(parcel.trackingUrl)) {
    return parcel.trackingUrl;
  }

  if (parcel.carrier === Carrier.CUSTOM) {
    return null;
  }

  const trackingNumber = normalizeTrackingNumber(parcel.trackingNumber);
  if (trackingNumber === null) {
    return null;
  }

  return buildCarrierUrl(parcel.carrier, trackingNumber);
}
