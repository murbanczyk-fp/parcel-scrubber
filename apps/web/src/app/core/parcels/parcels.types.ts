export type ParcelCarrier =
  | 'INPOST'
  | 'POCZTA_POLSKA'
  | 'DPD'
  | 'DHL'
  | 'CUSTOM';

export type ParcelStatus =
  | 'NEW'
  | 'IN_TRANSIT'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'REMOVED';

export type ParcelSource = 'GMAIL' | 'MANUAL';

export type CreateParcelPayload = {
  store: string;
  carrier: ParcelCarrier;
  trackingNumber: string;
  orderDate: string;
  description?: string;
  trackingUrl?: string;
  customCarrierLabel?: string;
};

export type UpdateParcelPayload = Partial<
  Pick<
    CreateParcelPayload,
    | 'store'
    | 'description'
    | 'carrier'
    | 'customCarrierLabel'
    | 'trackingNumber'
    | 'trackingUrl'
    | 'orderDate'
  >
>;

export type MergeParcelsFields = {
  store: string | null;
  description: string | null;
  carrier: ParcelCarrier;
  customCarrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export type MergeParcelsPayload = {
  parcelIds: string[];
  fields: MergeParcelsFields;
};

export type ParcelMessageDto = {
  gmailMessageId: string;
  internalDate: string;
  subject: string | null;
  from: string | null;
};

export type ParcelDto = {
  id: string;
  store: string | null;
  description: string | null;
  carrier: ParcelCarrier;
  customCarrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingUrlOverride: string | null;
  orderDate: string;
  status: ParcelStatus;
  source: ParcelSource;
  createdAt: string;
  updatedAt: string;
  messages: ParcelMessageDto[];
};

export type SyncJobPhase = 'listing' | 'processing' | 'done';

export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type SyncJobDto = {
  id: string;
  userId: string;
  status: SyncJobStatus;
  phase: SyncJobPhase;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
};
