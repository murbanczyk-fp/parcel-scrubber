import { Carrier, ParcelSource, ParcelStatus } from '@prisma/client';

import { ParcelsService } from './parcels.service';

describe('ParcelsService', () => {
  let service: ParcelsService;
  let prisma: {
    parcel: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      parcel: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ParcelsService(prisma as never);
  });

  it('lists active parcels sorted by orderDate desc then createdAt desc', async () => {
    const rows = [
      {
        id: 'parcel-1',
        userId: 'user-1',
        store: 'Allegro',
        description: 'Item',
        customCarrierLabel: null,
        carrier: Carrier.INPOST,
        trackingNumber: '520000012680041086770098',
        trackingUrl: null,
        orderDate: new Date('2026-02-01'),
        status: ParcelStatus.NEW,
        source: ParcelSource.GMAIL,
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
        updatedAt: new Date('2026-02-01T10:00:00.000Z'),
      },
    ];
    prisma.parcel.findMany.mockResolvedValue(rows);

    const result = await service.listForUser('user-1', { status: 'active' });

    expect(prisma.parcel.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: {
          notIn: [ParcelStatus.DELIVERED, ParcelStatus.REMOVED],
        },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result[0]).toMatchObject({
      id: 'parcel-1',
      trackingUrl: expect.stringContaining('inpost') as string,
      orderDate: '2026-02-01',
    });
  });
});
