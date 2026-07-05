import {
  Carrier,
  ParcelSource,
  ParcelStatus,
  Prisma,
  StatusEventSource,
} from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { ParcelsService } from './parcels.service';
import { ParcelValidationError } from './parcel-validation.error';

describe('ParcelsService', () => {
  let service: ParcelsService;
  let prisma: {
    parcel: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
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
        create: jest.fn(),
        update: jest.fn(),
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

  it('reactivates a delivered parcel to NEW and writes a user status event', async () => {
    const delivered = { ...baseParcel, status: ParcelStatus.DELIVERED };
    const reactivated = { ...baseParcel, status: ParcelStatus.NEW };
    prisma.parcel.findFirst
      .mockResolvedValueOnce(delivered)
      .mockResolvedValueOnce(delivered);
    prisma.parcel.updateMany.mockResolvedValue({ count: 1 });
    prisma.parcel.findFirstOrThrow.mockResolvedValue(reactivated);

    const result = await service.reactivateParcel('user-1', 'parcel-1');

    expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'parcel-1',
        userId: 'user-1',
        status: ParcelStatus.DELIVERED,
      },
      data: { status: ParcelStatus.NEW },
    });
    expect(prisma.parcelStatusEvent.create).toHaveBeenCalledWith({
      data: {
        parcelId: 'parcel-1',
        fromStatus: ParcelStatus.DELIVERED,
        toStatus: ParcelStatus.NEW,
        source: StatusEventSource.USER,
      },
    });
    expect(result.status).toBe('NEW');
  });

  it('reactivates a removed parcel to NEW and writes a user status event', async () => {
    const removed = { ...baseParcel, status: ParcelStatus.REMOVED };
    const reactivated = { ...baseParcel, status: ParcelStatus.NEW };
    prisma.parcel.findFirst
      .mockResolvedValueOnce(removed)
      .mockResolvedValueOnce(removed);
    prisma.parcel.updateMany.mockResolvedValue({ count: 1 });
    prisma.parcel.findFirstOrThrow.mockResolvedValue(reactivated);

    const result = await service.reactivateParcel('user-1', 'parcel-1');

    expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'parcel-1',
        userId: 'user-1',
        status: ParcelStatus.REMOVED,
      },
      data: { status: ParcelStatus.NEW },
    });
    expect(prisma.parcelStatusEvent.create).toHaveBeenCalledWith({
      data: {
        parcelId: 'parcel-1',
        fromStatus: ParcelStatus.REMOVED,
        toStatus: ParcelStatus.NEW,
        source: StatusEventSource.USER,
      },
    });
    expect(result.status).toBe('NEW');
  });

  it('is idempotent when reactivating an already active NEW parcel', async () => {
    prisma.parcel.findFirst.mockResolvedValue(baseParcel);

    const result = await service.reactivateParcel('user-1', 'parcel-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.parcelStatusEvent.create).not.toHaveBeenCalled();
    expect(result.status).toBe('NEW');
  });

  it('throws BadRequestException when reactivating an IN_TRANSIT parcel', async () => {
    const inTransit = { ...baseParcel, status: ParcelStatus.IN_TRANSIT };
    prisma.parcel.findFirst.mockResolvedValue(inTransit);

    await expect(
      service.reactivateParcel('user-1', 'parcel-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when reactivating a missing parcel', async () => {
    prisma.parcel.findFirst.mockResolvedValue(null);

    await expect(
      service.reactivateParcel('user-1', 'missing-parcel'),
    ).rejects.toThrow(NotFoundException);
  });

  describe('createForUser', () => {
    const validBody = {
      store: 'Allegro',
      carrier: Carrier.INPOST,
      trackingNumber: '520000012680041086770098',
      orderDate: '2026-03-01',
    };

    it('creates a manual parcel with NEW status and normalized tracking number', async () => {
      const created = {
        ...baseParcel,
        id: 'parcel-new',
        source: ParcelSource.MANUAL,
        status: ParcelStatus.NEW,
        store: 'Allegro',
        trackingNumber: '520000012680041086770098',
      };
      prisma.parcel.findFirst.mockResolvedValue(null);
      prisma.parcel.create.mockResolvedValue(created);

      const result = await service.createForUser('user-1', validBody);

      expect(prisma.parcel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          source: ParcelSource.MANUAL,
          status: ParcelStatus.NEW,
          store: 'Allegro',
          trackingNumber: '520000012680041086770098',
          orderDate: new Date('2026-03-01T00:00:00.000Z'),
        }) as object,
      });
      expect(result.source).toBe('MANUAL');
      expect(result.status).toBe('NEW');
      expect(result.trackingUrlOverride).toBeNull();
      expect(result.trackingUrl).toContain('inpost');
    });

    it('stores uppercase trimmed tracking number', async () => {
      prisma.parcel.findFirst.mockResolvedValue(null);
      prisma.parcel.create.mockResolvedValue({
        ...baseParcel,
        source: ParcelSource.MANUAL,
        trackingNumber: 'ABC123',
      });

      await service.createForUser('user-1', {
        ...validBody,
        trackingNumber: '  abc 123  ',
      });

      expect(prisma.parcel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          trackingNumber: 'ABC123',
        }) as object,
      });
    });

    it('rejects missing store, tracking, order date, and CUSTOM without label', async () => {
      await expect(
        service.createForUser('user-1', {
          ...validBody,
          store: '  ',
        }),
      ).rejects.toMatchObject({
        errors: [{ field: 'store', message: 'Store is required' }],
      });

      await expect(
        service.createForUser('user-1', {
          ...validBody,
          trackingNumber: '',
        }),
      ).rejects.toMatchObject({
        errors: [
          { field: 'trackingNumber', message: 'Tracking number is required' },
        ],
      });

      await expect(
        service.createForUser('user-1', {
          ...validBody,
          orderDate: 'not-a-date',
        }),
      ).rejects.toMatchObject({
        errors: [{ field: 'orderDate', message: expect.any(String) as string }],
      });

      await expect(
        service.createForUser('user-1', {
          ...validBody,
          carrier: Carrier.CUSTOM,
        }),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'customCarrierLabel',
            message: 'Custom carrier label is required when carrier is Custom',
          },
        ],
      });
    });

    it('rejects unsafe tracking URL override', async () => {
      await expect(
        service.createForUser('user-1', {
          ...validBody,
          trackingUrl: 'javascript:alert(1)',
        }),
      ).rejects.toMatchObject({
        errors: [
          {
            field: 'trackingUrl',
            message: 'Tracking URL must be a valid http or https URL',
          },
        ],
      });
    });

    it('rejects duplicate tracking number', async () => {
      prisma.parcel.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.createForUser('user-1', validBody)).rejects.toThrow(
        ParcelValidationError,
      );
    });

    it('maps Prisma P2002 to duplicate tracking validation error', async () => {
      prisma.parcel.findFirst.mockResolvedValue(null);
      prisma.parcel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createForUser('user-1', validBody),
      ).rejects.toMatchObject({
        errors: [{ field: 'trackingNumber' }],
      });
    });
  });

  describe('getByIdForUser', () => {
    it('returns mapped parcel for owner', async () => {
      prisma.parcel.findFirst.mockResolvedValue(baseParcel);

      const result = await service.getByIdForUser('user-1', 'parcel-1');

      expect(result.id).toBe('parcel-1');
      expect(result.trackingUrlOverride).toBeNull();
      expect(result.trackingUrl).toContain('inpost');
    });

    it('throws NotFoundException for missing parcel', async () => {
      prisma.parcel.findFirst.mockResolvedValue(null);

      await expect(service.getByIdForUser('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateForUser', () => {
    it('updates partial fields', async () => {
      const updated = { ...baseParcel, description: 'Updated item' };
      prisma.parcel.findFirst
        .mockResolvedValueOnce(baseParcel)
        .mockResolvedValueOnce(updated);
      prisma.parcel.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateForUser('user-1', 'parcel-1', {
        description: 'Updated item',
      });

      expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
        where: { id: 'parcel-1', userId: 'user-1' },
        data: { description: 'Updated item' },
      });
      expect(result.description).toBe('Updated item');
    });

    it('clears custom carrier label when carrier changes away from CUSTOM', async () => {
      const customParcel = {
        ...baseParcel,
        carrier: Carrier.CUSTOM,
        customCarrierLabel: 'Bike courier',
      };
      const updated = {
        ...customParcel,
        carrier: Carrier.INPOST,
        customCarrierLabel: null,
      };
      prisma.parcel.findFirst
        .mockResolvedValueOnce(customParcel)
        .mockResolvedValueOnce(updated);
      prisma.parcel.updateMany.mockResolvedValue({ count: 1 });

      await service.updateForUser('user-1', 'parcel-1', {
        carrier: Carrier.INPOST,
      });

      expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
        where: { id: 'parcel-1', userId: 'user-1' },
        data: { carrier: Carrier.INPOST, customCarrierLabel: null },
      });
    });

    it('clears tracking URL override with empty string', async () => {
      const withOverride = {
        ...baseParcel,
        trackingUrl: 'https://example.com/track',
      };
      const cleared = { ...withOverride, trackingUrl: null };
      prisma.parcel.findFirst
        .mockResolvedValueOnce(withOverride)
        .mockResolvedValueOnce(cleared);
      prisma.parcel.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateForUser('user-1', 'parcel-1', {
        trackingUrl: '',
      });

      expect(prisma.parcel.updateMany).toHaveBeenCalledWith({
        where: { id: 'parcel-1', userId: 'user-1' },
        data: { trackingUrl: null },
      });
      expect(result.trackingUrlOverride).toBeNull();
      expect(result.trackingUrl).toContain('inpost');
    });

    it('rejects store values longer than the max length', async () => {
      prisma.parcel.findFirst.mockResolvedValue(baseParcel);

      await expect(
        service.updateForUser('user-1', 'parcel-1', {
          store: 'x'.repeat(201),
        }),
      ).rejects.toMatchObject({
        errors: [{ field: 'store' }],
      });
    });

    it('rejects empty patch body', async () => {
      prisma.parcel.findFirst.mockResolvedValue(baseParcel);

      await expect(
        service.updateForUser('user-1', 'parcel-1', {}),
      ).rejects.toMatchObject({
        errors: [{ message: 'Request body must include at least one field' }],
      });
    });

    it('rejects duplicate tracking number on another parcel', async () => {
      prisma.parcel.findFirst
        .mockResolvedValueOnce(baseParcel)
        .mockResolvedValueOnce({ id: 'other-parcel' });

      await expect(
        service.updateForUser('user-1', 'parcel-1', {
          trackingNumber: 'NEWTRACK123',
        }),
      ).rejects.toMatchObject({
        errors: [{ field: 'trackingNumber' }],
      });
    });

    it('throws NotFoundException when parcel is missing', async () => {
      prisma.parcel.findFirst.mockResolvedValue(null);

      await expect(
        service.updateForUser('user-1', 'missing', { store: 'Shop' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
