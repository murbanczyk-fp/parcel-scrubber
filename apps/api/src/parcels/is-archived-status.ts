import { ParcelStatus } from '@prisma/client';

export const ARCHIVED_PARCEL_STATUSES: readonly ParcelStatus[] = [
  ParcelStatus.DELIVERED,
  ParcelStatus.REMOVED,
];

export function isArchivedStatus(status: ParcelStatus): boolean {
  return ARCHIVED_PARCEL_STATUSES.includes(status);
}
