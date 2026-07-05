import { Carrier, ParcelSource, ParcelStatus } from '@prisma/client';

export type CreateParcelBody = {
  store: string;
  carrier: Carrier;
  trackingNumber: string;
  orderDate: string;
  description?: string;
  trackingUrl?: string;
  customCarrierLabel?: string;
};

export type UpdateParcelBody = Partial<
  Pick<
    CreateParcelBody,
    | 'store'
    | 'description'
    | 'carrier'
    | 'customCarrierLabel'
    | 'trackingNumber'
    | 'trackingUrl'
    | 'orderDate'
  >
>;

export type ParcelDto = {
  id: string;
  store: string | null;
  description: string | null;
  carrier: Carrier;
  customCarrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingUrlOverride: string | null;
  orderDate: string;
  status: ParcelStatus;
  source: ParcelSource;
  createdAt: string;
  updatedAt: string;
};
