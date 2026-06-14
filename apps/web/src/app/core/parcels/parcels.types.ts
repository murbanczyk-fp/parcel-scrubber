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

export type ParcelDto = {
  id: string;
  store: string | null;
  description: string | null;
  carrier: ParcelCarrier;
  customCarrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  orderDate: string;
  status: ParcelStatus;
  source: ParcelSource;
  createdAt: string;
  updatedAt: string;
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
