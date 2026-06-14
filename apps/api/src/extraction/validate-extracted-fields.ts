import { Carrier } from '@prisma/client';

import { AiExtractedFields, ExtractionError } from './types';

export type CarrierPromptOption = {
  value: Carrier;
  label: string;
  hints: string[];
};

export const CARRIER_PROMPT_OPTIONS: CarrierPromptOption[] = [
  {
    value: Carrier.INPOST,
    label: 'InPost',
    hints: ['InPost', 'Paczkomaty', 'In-Post', 'inpost.pl'],
  },
  {
    value: Carrier.POCZTA_POLSKA,
    label: 'Poczta Polska',
    hints: ['Poczta Polska', 'Poczta', 'emonitoring.poczta-polska.pl'],
  },
  {
    value: Carrier.DPD,
    label: 'DPD',
    hints: ['DPD', 'tracktrace.dpd.com.pl'],
  },
  {
    value: Carrier.DHL,
    label: 'DHL',
    hints: ['DHL', 'dhl.com'],
  },
  {
    value: Carrier.CUSTOM,
    label: 'Custom',
    hints: ['other carriers not listed above'],
  },
];

const ALLOWED_CARRIERS = new Set<Carrier>(
  CARRIER_PROMPT_OPTIONS.map((option) => option.value),
);

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateExtractedFields(raw: {
  trackingNumber?: unknown;
  carrier?: unknown;
  customCarrierLabel?: unknown;
  description?: unknown;
}): AiExtractedFields {
  if (
    typeof raw.carrier !== 'string' ||
    !ALLOWED_CARRIERS.has(raw.carrier as Carrier)
  ) {
    throw new ExtractionError(`Invalid carrier value: ${String(raw.carrier)}`);
  }

  const carrier = raw.carrier as Carrier;
  const trackingNumber = trimToNull(raw.trackingNumber);
  const description = trimToNull(raw.description);
  let customCarrierLabel = trimToNull(raw.customCarrierLabel);

  if (carrier === Carrier.CUSTOM) {
    if (!customCarrierLabel) {
      throw new ExtractionError(
        'customCarrierLabel is required when carrier is CUSTOM',
      );
    }
  } else {
    customCarrierLabel = null;
  }

  return {
    trackingNumber,
    carrier,
    customCarrierLabel,
    description,
  };
}
