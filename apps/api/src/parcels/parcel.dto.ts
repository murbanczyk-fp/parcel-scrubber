import { Carrier, ParcelSource, ParcelStatus } from '@prisma/client';

export type ParcelDto = {
  id: string;
  store: string | null;
  description: string | null;
  carrier: Carrier;
  customCarrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  orderDate: string;
  status: ParcelStatus;
  source: ParcelSource;
  createdAt: string;
  updatedAt: string;
};
