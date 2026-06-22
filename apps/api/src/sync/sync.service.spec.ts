import { Carrier, ParcelSource, ParcelStatus } from '@prisma/client';
import { allegroInPostShipmentFixture } from '../extraction/fixtures/email-fixtures';
import { ExtractionError } from '../extraction/types';
import { GmailAuthError } from '../gmail/types';
import { SyncJobRegistry } from './sync-job.registry';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let registry: SyncJobRegistry;
  let settings: { getEffectiveSettings: jest.Mock };
  let gmail: { listMatchingEmailIds: jest.Mock; getMessage: jest.Mock };
  let extraction: { extractParcelFields: jest.Mock };
  let prisma: {
    $transaction: jest.Mock;
    gmailMessage: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    parcel: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    parcelEmail: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    registry = new SyncJobRegistry();
    settings = {
      getEffectiveSettings: jest.fn().mockResolvedValue({
        gmailScanLabel: 'ParcelScrubber',
        scanPeriodDays: 30,
      }),
    };
    gmail = {
      listMatchingEmailIds: jest.fn(),
      getMessage: jest.fn(),
    };
    extraction = { extractParcelFields: jest.fn() };
    prisma = {
      gmailMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      parcel: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'parcel-1',
          userId: 'user-1',
          status: ParcelStatus.NEW,
          source: ParcelSource.GMAIL,
          store: 'Allegro',
          description: 'Etui na telefon',
          carrier: Carrier.INPOST,
          customCarrierLabel: null,
          trackingNumber: '520000012680041086770098',
          orderDate: new Date('2026-01-15'),
          trackingUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      parcelEmail: {
        findMany: jest.fn().mockResolvedValue([
          {
            gmailMessage: {
              internalDate: new Date('2026-01-15T10:00:00.000Z'),
            },
          },
        ]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction = jest.fn(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );

    service = new SyncService(
      registry,
      settings as never,
      gmail as never,
      extraction as never,
      prisma as never,
    );
  });

  it('imports a new parcel and completes the job', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmail.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extraction.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Etui na telefon',
    });

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    const job = registry.get(started!.jobId, 'user-1');
    expect(job).toMatchObject({
      status: 'completed',
      phase: 'done',
      total: 1,
      processed: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
    });
    expect(prisma.parcel.create).toHaveBeenCalled();
    expect(prisma.gmailMessage.create).toHaveBeenCalled();
    expect(prisma.parcelEmail.create).toHaveBeenCalled();
  });

  it('skips ledgered message ids on second run', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    prisma.gmailMessage.findMany.mockResolvedValue([
      { gmailMessageId: 'msg-1' },
    ]);

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(gmail.getMessage).not.toHaveBeenCalled();
    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      total: 0,
      processed: 0,
      status: 'completed',
    });
  });

  it('ledgers unknown sender without creating a parcel', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmail.getMessage.mockResolvedValue({
      ...allegroInPostShipmentFixture,
      from: 'spam@example.com',
    });

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(extraction.extractParcelFields).not.toHaveBeenCalled();
    expect(prisma.parcel.create).not.toHaveBeenCalled();
    expect(prisma.gmailMessage.create).toHaveBeenCalled();
    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      skipped: 1,
      imported: 0,
    });
  });

  it('ledgers extraction failures and continues', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmail.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extraction.extractParcelFields.mockRejectedValue(
      new ExtractionError('OpenRouter failed'),
    );

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      failed: 1,
      imported: 0,
      status: 'completed',
    });
    expect(prisma.gmailMessage.create).toHaveBeenCalled();
    expect(prisma.parcel.create).not.toHaveBeenCalled();
  });

  it('keeps archived parcel status while refreshing metadata', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmail.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extraction.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Updated description',
    });
    prisma.parcel.findFirst.mockResolvedValue({
      id: 'parcel-archived',
      userId: 'user-1',
      status: ParcelStatus.DELIVERED,
      source: ParcelSource.GMAIL,
      store: 'Allegro',
      description: 'Old',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      trackingNumber: '520000012680041086770098',
      orderDate: new Date('2026-01-01'),
      trackingUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(prisma.parcel.create).not.toHaveBeenCalled();
    expect(prisma.parcel.update).toHaveBeenCalledWith({
      where: { id: 'parcel-archived' },
      data: {
        store: 'Allegro',
        description: 'Updated description',
        carrier: Carrier.INPOST,
        customCarrierLabel: null,
      },
    });
    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      imported: 0,
      processed: 1,
    });
  });

  it('continues after unexpected per-message errors', async () => {
    gmail.listMatchingEmailIds.mockResolvedValue(['msg-1', 'msg-2']);
    gmail.getMessage
      .mockRejectedValueOnce(new Error('Gmail API unavailable'))
      .mockResolvedValueOnce(allegroInPostShipmentFixture);
    extraction.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Etui na telefon',
    });

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      status: 'completed',
      total: 2,
      processed: 2,
      failed: 1,
      imported: 1,
    });
    expect(gmail.getMessage).toHaveBeenCalledTimes(2);
  });

  it('marks job failed with GMAIL_AUTH_REQUIRED on auth error', async () => {
    gmail.listMatchingEmailIds.mockRejectedValue(
      new GmailAuthError('Token revoked'),
    );

    const started = registry.start('user-1');
    await service.runJob('user-1', started!.jobId);

    expect(registry.get(started!.jobId, 'user-1')).toMatchObject({
      status: 'failed',
      errorCode: 'GMAIL_AUTH_REQUIRED',
    });
    expect(registry.isUserRunning('user-1')).toBe(false);
  });
});
