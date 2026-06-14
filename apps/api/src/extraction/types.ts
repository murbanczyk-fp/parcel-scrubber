import { Carrier } from '@prisma/client';

import { GmailMessage } from '../gmail/types';

export type MerchantStore = 'Allegro' | 'AliExpress';

export type ExtractedParcelFields = {
  store: MerchantStore | null;
  trackingNumber: string | null;
  carrier: Carrier;
  customCarrierLabel: string | null;
  description: string | null;
};

export type AiExtractedFields = Omit<ExtractedParcelFields, 'store'>;

export type ExtractTestResponse = {
  message: GmailMessage;
  result: ExtractedParcelFields;
};

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}
