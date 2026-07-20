import { ParcelStatus } from '@prisma/client';

import { isArchivedStatus } from './is-archived-status';

export type SurvivorCandidate = {
  id: string;
  createdAt: Date;
};

export type OrderDateCandidate = {
  orderDate: Date;
};

/** Oldest `createdAt` wins; stable tie-break on `id`. */
export function selectSurvivor<T extends SurvivorCandidate>(parcels: T[]): T {
  if (parcels.length === 0) {
    throw new Error('selectSurvivor requires at least one parcel');
  }

  return [...parcels].sort((a, b) => {
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreated !== 0) {
      return byCreated;
    }
    return a.id.localeCompare(b.id);
  })[0];
}

/**
 * Archive merges: DELIVERED if any selected is Delivered, else REMOVED.
 * Active merges: `null` — leave the survivor status unchanged.
 */
export function preferredArchiveStatus(
  statuses: ParcelStatus[],
): ParcelStatus | null {
  const anyActive = statuses.some((status) => !isArchivedStatus(status));
  if (anyActive) {
    return null;
  }

  if (statuses.some((status) => status === ParcelStatus.DELIVERED)) {
    return ParcelStatus.DELIVERED;
  }

  return ParcelStatus.REMOVED;
}

export function orderDateFallback(parcels: OrderDateCandidate[]): Date {
  if (parcels.length === 0) {
    throw new Error('orderDateFallback requires at least one parcel');
  }

  return new Date(
    Math.min(...parcels.map((parcel) => parcel.orderDate.getTime())),
  );
}

/** Deduplicate string ids while preserving first-seen order. */
export function distinctParcelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }

  return result;
}
