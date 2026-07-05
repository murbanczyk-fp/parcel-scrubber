import {
  Carrier,
  ParcelSource,
  ParcelStatus,
  StatusEventSource,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

import { ParcelsService } from './parcels.service';

describe('ParcelsService', () => {
  let service: ParcelsService;
  let prisma: {
    parcel: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    parcelStatusEvent: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const baseParcel = {
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
  };

  beforeEach(() => {
    prisma = {
      parcel: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      parcelStatusEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    service = new ParcelsService(prisma as never);
  });

  it('lists active parcels sorted by orderDate desc then createdAt desc', async () => {
    prisma.parcel.findMany.mockResolvedValue([baseParcel]);

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

  it('lists archived parcels with delivered and removed statuses', async () => {
    prisma.parcel.findMany.mockResolvedValue([]);

    await service.listForUser('user-1', { status: 'archived' });

    expect(prisma.parcel.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: {
          in: [ParcelStatus.DELIVERED, ParcelStatus.REMOVED],
        },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('marks a parcel delivered and writes a user status event', async () => {
    const delivered = { ...baseParcel, status: ParcelStatus.DELIVERED };
    prisma.parcel.findFirst.mockResolvedValue(baseParcel);
    prisma.parcel.updateMany.mockResolvedValue({ count: 1 });
    prisma.parcel.findFirstOrThrow.mockResolvedValue(delivered);

    const result = await service.markDelivered('user-1', 'parcel-1');

    expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'parcel-1',
        userId: 'user-1',
        status: ParcelStatus.NEW,
      },
      data: { status: ParcelStatus.DELIVERED },
    });
    expect(prisma.parcelStatusEvent.create).toHaveBeenCalledWith({
      data: {
        parcelId: 'parcel-1',
        fromStatus: ParcelStatus.NEW,
        toStatus: ParcelStatus.DELIVERED,
        source: StatusEventSource.USER,
      },
    });
    expect(result.status).toBe('DELIVERED');
  });

  it('marks a removed parcel delivered and writes a cross-archive user event', async () => {
    const removed = { ...baseParcel, status: ParcelStatus.REMOVED };
    const delivered = { ...baseParcel, status: ParcelStatus.DELIVERED };
    prisma.parcel.findFirst.mockResolvedValue(removed);
    prisma.parcel.updateMany.mockResolvedValue({ count: 1 });
    prisma.parcel.findFirstOrThrow.mockResolvedValue(delivered);

    const result = await service.markDelivered('user-1', 'parcel-1');

    expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'parcel-1',
        userId: 'user-1',
        status: ParcelStatus.REMOVED,
      },
      data: { status: ParcelStatus.DELIVERED },
    });
    expect(prisma.parcelStatusEvent.create).toHaveBeenCalledWith({
      data: {
        parcelId: 'parcel-1',
        fromStatus: ParcelStatus.REMOVED,
        toStatus: ParcelStatus.DELIVERED,
        source: StatusEventSource.USER,
      },
    });
    expect(result.status).toBe('DELIVERED');
  });

  it('is idempotent when marking delivered on an already delivered parcel', async () => {
    const delivered = { ...baseParcel, status: ParcelStatus.DELIVERED };
    prisma.parcel.findFirst.mockResolvedValue(delivered);

    const result = await service.markDelivered('user-1', 'parcel-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.parcelStatusEvent.create).not.toHaveBeenCalled();
    expect(result.status).toBe('DELIVERED');
  });

  it('is idempotent when marking removed on an already removed parcel', async () => {
    const removed = { ...baseParcel, status: ParcelStatus.REMOVED };
    prisma.parcel.findFirst.mockResolvedValue(removed);

    const result = await service.markRemoved('user-1', 'parcel-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.parcelStatusEvent.create).not.toHaveBeenCalled();
    expect(result.status).toBe('REMOVED');
  });

  it('throws NotFoundException when parcel is missing or belongs to another user', async () => {
    prisma.parcel.findFirst.mockResolvedValue(null);

    await expect(
      service.markDelivered('user-1', 'missing-parcel'),
    ).rejects.toThrow(NotFoundException);
  });
});
