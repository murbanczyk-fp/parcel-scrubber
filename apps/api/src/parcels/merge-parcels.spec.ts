import { ParcelStatus } from '@prisma/client';

import {
  distinctParcelIds,
  orderDateFallback,
  preferredArchiveStatus,
  selectSurvivor,
} from './merge-parcels';

describe('merge-parcels helpers', () => {
  describe('selectSurvivor', () => {
    it('picks the parcel with the oldest createdAt', () => {
      const survivor = selectSurvivor([
        {
          id: 'b',
          createdAt: new Date('2026-02-02T10:00:00.000Z'),
        },
        {
          id: 'a',
          createdAt: new Date('2026-02-01T10:00:00.000Z'),
        },
      ]);

      expect(survivor.id).toBe('a');
    });

    it('breaks ties on id ascending', () => {
      const sameTime = new Date('2026-02-01T10:00:00.000Z');
      const survivor = selectSurvivor([
        { id: 'parcel-z', createdAt: sameTime },
        { id: 'parcel-a', createdAt: sameTime },
      ]);

      expect(survivor.id).toBe('parcel-a');
    });
  });

  describe('preferredArchiveStatus', () => {
    it('returns null when any selected parcel is active', () => {
      expect(
        preferredArchiveStatus([ParcelStatus.NEW, ParcelStatus.IN_TRANSIT]),
      ).toBeNull();
    });

    it('prefers DELIVERED when any archived parcel is delivered', () => {
      expect(
        preferredArchiveStatus([ParcelStatus.REMOVED, ParcelStatus.DELIVERED]),
      ).toBe(ParcelStatus.DELIVERED);
    });

    it('returns REMOVED when all selected are removed', () => {
      expect(
        preferredArchiveStatus([ParcelStatus.REMOVED, ParcelStatus.REMOVED]),
      ).toBe(ParcelStatus.REMOVED);
    });
  });

  describe('orderDateFallback', () => {
    it('returns the minimum orderDate among the selection', () => {
      expect(
        orderDateFallback([
          { orderDate: new Date('2026-02-10') },
          { orderDate: new Date('2026-01-05') },
          { orderDate: new Date('2026-03-01') },
        ]),
      ).toEqual(new Date('2026-01-05'));
    });
  });

  describe('distinctParcelIds', () => {
    it('deduplicates while preserving first-seen order', () => {
      expect(distinctParcelIds(['a', 'b', 'a', 'c', 'b'])).toEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });
});
