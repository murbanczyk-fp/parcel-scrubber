import { ParcelStatus } from '@prisma/client';

import { isArchivedStatus } from './is-archived-status';

describe('isArchivedStatus', () => {
  it.each([
    [ParcelStatus.NEW, false],
    [ParcelStatus.IN_TRANSIT, false],
    [ParcelStatus.IN_DELIVERY, false],
    [ParcelStatus.DELIVERED, true],
    [ParcelStatus.REMOVED, true],
  ])('returns %s for %s', (status, expected) => {
    expect(isArchivedStatus(status)).toBe(expected);
  });
});
