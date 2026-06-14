import type { Parcel } from '@prisma/client';

import type { ParcelDto } from './parcel.dto';
import { resolveTrackingUrl } from './resolve-tracking-url';

export function mapParcelToDto(parcel: Parcel): ParcelDto {
  return {
    id: parcel.id,
    store: parcel.store,
    description: parcel.description,
    carrier: parcel.carrier,
    customCarrierLabel: parcel.customCarrierLabel,
    trackingNumber: parcel.trackingNumber,
    trackingUrl: resolveTrackingUrl(parcel),
    orderDate: parcel.orderDate.toISOString().slice(0, 10),
    status: parcel.status,
    source: parcel.source,
    createdAt: parcel.createdAt.toISOString(),
    updatedAt: parcel.updatedAt.toISOString(),
  };
}
