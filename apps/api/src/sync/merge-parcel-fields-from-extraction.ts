import { Carrier, type Parcel } from '@prisma/client';

import type { ExtractedParcelFields } from '../extraction/types';

export type ParcelFieldData = Pick<
  Parcel,
  'store' | 'description' | 'carrier' | 'customCarrierLabel'
>;

type ExtractionFieldData = Pick<
  ExtractedParcelFields,
  'store' | 'description' | 'carrier' | 'customCarrierLabel'
>;

function isEmptyString(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function pickFilledString(
  existing: string | null,
  incoming: string | null,
): string | null {
  if (!isEmptyString(existing)) {
    return existing;
  }

  if (!isEmptyString(incoming)) {
    return incoming;
  }

  return existing;
}

/**
 * Identity on create (`existing` null); fill-null/empty on update.
 * Treats `carrier === CUSTOM` as empty when incoming has a known carrier.
 * Never downgrades a known carrier to CUSTOM. Clears customCarrierLabel
 * whenever the merged carrier is non-CUSTOM.
 */
export function mergeParcelFieldsFromExtraction(
  existing: ParcelFieldData | null,
  extraction: ExtractionFieldData,
): ParcelFieldData {
  if (!existing) {
    return {
      store: extraction.store,
      description: extraction.description,
      carrier: extraction.carrier,
      customCarrierLabel: extraction.customCarrierLabel,
    };
  }

  const store = pickFilledString(existing.store, extraction.store);
  const description = pickFilledString(
    existing.description,
    extraction.description,
  );

  const existingCarrierEmpty = existing.carrier === Carrier.CUSTOM;
  const incomingKnown = extraction.carrier !== Carrier.CUSTOM;

  if (existingCarrierEmpty && incomingKnown) {
    return {
      store,
      description,
      carrier: extraction.carrier,
      customCarrierLabel: null,
    };
  }

  if (!existingCarrierEmpty) {
    return {
      store,
      description,
      carrier: existing.carrier,
      customCarrierLabel: null,
    };
  }

  return {
    store,
    description,
    carrier: Carrier.CUSTOM,
    customCarrierLabel: pickFilledString(
      existing.customCarrierLabel,
      extraction.customCarrierLabel,
    ),
  };
}

export function parcelFieldsChanged(
  existing: ParcelFieldData,
  next: ParcelFieldData,
): boolean {
  return (
    existing.store !== next.store ||
    existing.description !== next.description ||
    existing.carrier !== next.carrier ||
    existing.customCarrierLabel !== next.customCarrierLabel
  );
}
