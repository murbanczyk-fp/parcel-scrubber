import { Injectable } from '@nestjs/common';
import { Carrier } from '@prisma/client';

import { GmailMessage } from '../gmail/types';
import { detectStoreFromSender } from './detect-store-from-sender';
import {
  buildExtractionJsonSchema,
  buildExtractionSystemPrompt,
  buildExtractionUserContent,
} from './extraction-prompt';
import { OpenRouterClient } from './openrouter-client';
import { ExtractedParcelFields } from './types';
import { validateExtractedFields } from './validate-extracted-fields';

@Injectable()
export class ExtractionService {
  constructor(private readonly openRouter: OpenRouterClient) {}

  async extractParcelFields(
    message: GmailMessage,
  ): Promise<ExtractedParcelFields> {
    const store = detectStoreFromSender(message.from);

    const raw = await this.openRouter.completeStructuredJson(
      buildExtractionSystemPrompt(),
      buildExtractionUserContent(message),
      buildExtractionJsonSchema(),
    );

    if (!hasTrackingNumber(raw.trackingNumber)) {
      return {
        store,
        trackingNumber: null,
        carrier: Carrier.CUSTOM,
        customCarrierLabel: null,
        description: null,
      };
    }

    const aiFields = validateExtractedFields(raw);
    return { store, ...aiFields };
  }
}

function hasTrackingNumber(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
