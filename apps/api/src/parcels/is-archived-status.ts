import { ParcelStatus } from '@prisma/client';

export function isArchivedStatus(status: ParcelStatus): boolean {
  return status === ParcelStatus.DELIVERED || status === ParcelStatus.REMOVED;
}
