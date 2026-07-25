import { execSync } from 'node:child_process';
import path from 'node:path';

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Carrier,
  ParcelSource,
  ParcelStatus,
  PrismaClient,
} from '@prisma/client';

import { resolveEnvFilePaths } from '../src/config/env-files';
import { allegroInPostShipmentFixture } from '../src/extraction/fixtures/email-fixtures';
import { ExtractionService } from '../src/extraction/extraction.service';
import { GmailService } from '../src/gmail/gmail.service';
import { ParcelsModule } from '../src/parcels/parcels.module';
import { ParcelsService } from '../src/parcels/parcels.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { SettingsModule } from '../src/settings/settings.module';
import { SyncJobRegistry } from '../src/sync/sync-job.registry';
import { SyncModule } from '../src/sync/sync.module';
import { SyncService } from '../src/sync/sync.service';
import { truncateAppTables } from './truncate-app-tables';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://parcel:parcel@localhost:5432/parcel_scrubber_test';

const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

function assertE2eDatabaseUrl(url: string): void {
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `E2E_DATABASE_URL must point at a test database (name ending in _test); got "${dbName}"`,
    );
  }
}

describe('SyncService (e2e)', () => {
  let prisma: PrismaClient;
  let syncService: SyncService;
  let parcelsService: ParcelsService;
  let registry: SyncJobRegistry;
  let gmailService: {
    listMatchingEmailIds: jest.Mock;
    getMessage: jest.Mock;
  };
  let extractionService: {
    extractParcelFields: jest.Mock;
  };
  let userCounter = 0;

  beforeAll(async () => {
    assertE2eDatabaseUrl(TEST_DATABASE_URL);
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL =
      'http://localhost:8080/api/auth/google/callback';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'inherit',
    });
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    await truncateAppTables(prisma);
  });

  beforeEach(async () => {
    await truncateAppTables(prisma);
    userCounter += 1;

    gmailService = {
      listMatchingEmailIds: jest.fn(),
      getMessage: jest.fn(),
    };
    extractionService = {
      extractParcelFields: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: resolveEnvFilePaths(),
        }),
        PrismaModule,
        ParcelsModule,
        SettingsModule,
        SyncModule,
      ],
    })
      .overrideProvider(GmailService)
      .useValue(gmailService)
      .overrideProvider(ExtractionService)
      .useValue(extractionService)
      .compile();

    syncService = moduleFixture.get(SyncService);
    parcelsService = moduleFixture.get(ParcelsService);
    registry = moduleFixture.get(SyncJobRegistry);
  });

  afterAll(async () => {
    await truncateAppTables(prisma);
    await prisma?.$disconnect();
  });

  async function createTestUser() {
    return prisma.user.create({
      data: {
        googleSub: `e2e-sync-user-${userCounter}`,
        email: `e2e-sync-${userCounter}@example.com`,
      },
    });
  }

  it('imports a new parcel from a mocked merchant message', async () => {
    const user = await createTestUser();
    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extractionService.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Etui na telefon',
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    const parcels = await prisma.parcel.findMany({
      where: { userId: user.id },
    });
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      trackingNumber: '520000012680041086770098',
      status: ParcelStatus.NEW,
      source: ParcelSource.GMAIL,
    });

    const ledger = await prisma.gmailMessage.findMany({
      where: { userId: user.id },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.gmailMessageId).toBe('msg-1');
  });

  it('skips ledgered Gmail ids on a second sync run', async () => {
    const user = await createTestUser();
    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extractionService.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Etui na telefon',
    });

    const first = registry.start(user.id);
    await syncService.runJob(user.id, first!.jobId);

    const second = registry.start(user.id);
    await syncService.runJob(user.id, second!.jobId);

    expect(gmailService.getMessage).toHaveBeenCalledTimes(1);
    expect(await prisma.parcel.count({ where: { userId: user.id } })).toBe(1);
  });

  it('keeps archived parcel status and only fills empty metadata on resync', async () => {
    const user = await createTestUser();
    const orderDate = new Date('2026-01-01');

    await prisma.parcel.create({
      data: {
        userId: user.id,
        trackingNumber: '520000012680041086770098',
        carrier: Carrier.INPOST,
        status: ParcelStatus.DELIVERED,
        source: ParcelSource.GMAIL,
        orderDate,
        store: null,
        description: 'Old description',
      },
    });

    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extractionService.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Updated description',
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    const parcel = await prisma.parcel.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(parcel.status).toBe(ParcelStatus.DELIVERED);
    expect(parcel.store).toBe('Allegro');
    expect(parcel.description).toBe('Old description');
  });

  it('imports a non-merchant sender with tracking as a null-store parcel', async () => {
    const user = await createTestUser();
    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue({
      ...allegroInPostShipmentFixture,
      from: 'noreply@inpost.pl',
    });
    extractionService.extractParcelFields.mockResolvedValue({
      store: null,
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Paczka w drodze',
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    expect(extractionService.extractParcelFields).toHaveBeenCalled();
    const parcels = await prisma.parcel.findMany({
      where: { userId: user.id },
    });
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      store: null,
      trackingNumber: '520000012680041086770098',
      description: 'Paczka w drodze',
    });
  });

  it('enriches empty fields when merchant mail matches carrier tracking', async () => {
    const user = await createTestUser();
    await prisma.parcel.create({
      data: {
        userId: user.id,
        trackingNumber: '520000012680041086770098',
        carrier: Carrier.INPOST,
        status: ParcelStatus.NEW,
        source: ParcelSource.GMAIL,
        orderDate: new Date('2026-01-01'),
        store: null,
        description: 'Carrier text',
      },
    });

    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue(allegroInPostShipmentFixture);
    extractionService.extractParcelFields.mockResolvedValue({
      store: 'Allegro',
      trackingNumber: '520000012680041086770098',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Merchant description',
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    const parcels = await prisma.parcel.findMany({
      where: { userId: user.id },
    });
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      store: 'Allegro',
      description: 'Carrier text',
    });
  });

  it('deduplicates equivalent tracking numbers from two Gmail messages', async () => {
    const user = await createTestUser();
    gmailService.listMatchingEmailIds.mockResolvedValue([
      'dedupe-carrier-message',
      'dedupe-merchant-message',
    ]);
    gmailService.getMessage
      .mockResolvedValueOnce({
        ...allegroInPostShipmentFixture,
        from: 'carrier@example.com',
        date: '2026-01-05T10:00:00.000Z',
        subject: 'Carrier accepted the parcel',
      })
      .mockResolvedValueOnce({
        ...allegroInPostShipmentFixture,
        date: '2026-01-10T10:00:00.000Z',
        subject: 'Merchant shipped the order',
      });
    extractionService.extractParcelFields
      .mockResolvedValueOnce({
        store: null,
        trackingNumber: 'same track 123',
        carrier: Carrier.DPD,
        customCarrierLabel: null,
        description: 'Carrier notice',
      })
      .mockResolvedValueOnce({
        store: 'Literal Merchant',
        trackingNumber: ' SameTrack123 ',
        carrier: Carrier.DPD,
        customCarrierLabel: null,
        description: 'Merchant description',
      });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    const parcels = await prisma.parcel.findMany({
      where: { userId: user.id },
    });
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      trackingNumber: 'SAMETRACK123',
      store: 'Literal Merchant',
      description: 'Carrier notice',
      carrier: Carrier.DPD,
      orderDate: new Date('2026-01-05T00:00:00.000Z'),
    });

    const ledgerIds = (
      await prisma.gmailMessage.findMany({
        where: { userId: user.id },
        orderBy: { gmailMessageId: 'asc' },
      })
    ).map((message) => message.gmailMessageId);
    expect(ledgerIds).toEqual([
      'dedupe-carrier-message',
      'dedupe-merchant-message',
    ]);

    const linkIds = (
      await prisma.parcelEmail.findMany({
        where: { parcelId: parcels[0].id },
        orderBy: { gmailMessageId: 'asc' },
      })
    ).map((link) => link.gmailMessageId);
    expect(linkIds).toEqual([
      'dedupe-carrier-message',
      'dedupe-merchant-message',
    ]);
  });

  it('preserves user-edited values while filling empty metadata on sync', async () => {
    const user = await createTestUser();
    const parcel = await prisma.parcel.create({
      data: {
        userId: user.id,
        trackingNumber: 'USEREDITTRACK123',
        carrier: Carrier.INPOST,
        status: ParcelStatus.IN_TRANSIT,
        source: ParcelSource.MANUAL,
        orderDate: new Date('2026-01-01T00:00:00.000Z'),
        store: 'Initial store',
        description: null,
        trackingUrl: 'https://example.test/user-tracking-override',
      },
    });
    await parcelsService.updateForUser(user.id, parcel.id, {
      store: 'User-selected store',
      carrier: Carrier.DPD,
    });

    gmailService.listMatchingEmailIds.mockResolvedValue([
      'user-edit-enrichment-message',
    ]);
    gmailService.getMessage.mockResolvedValue({
      ...allegroInPostShipmentFixture,
      date: '2026-02-15T09:00:00.000Z',
    });
    extractionService.extractParcelFields.mockResolvedValue({
      store: 'Conflicting extracted store',
      trackingNumber: ' user edit track 123 ',
      carrier: Carrier.INPOST,
      customCarrierLabel: null,
      description: 'Filled extracted description',
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    const persisted = await prisma.parcel.findUniqueOrThrow({
      where: { id: parcel.id },
    });
    expect(persisted).toMatchObject({
      id: parcel.id,
      trackingNumber: 'USEREDITTRACK123',
      store: 'User-selected store',
      description: 'Filled extracted description',
      carrier: Carrier.DPD,
      status: ParcelStatus.IN_TRANSIT,
      source: ParcelSource.MANUAL,
      trackingUrl: 'https://example.test/user-tracking-override',
    });
    expect(await prisma.parcel.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await prisma.parcelEmail.findMany({ where: { parcelId: parcel.id } }),
    ).toEqual([
      expect.objectContaining({
        gmailMessageId: 'user-edit-enrichment-message',
      }),
    ]);
  });

  it('ledgers non-merchant sender without tracking and skips', async () => {
    const user = await createTestUser();
    gmailService.listMatchingEmailIds.mockResolvedValue(['msg-1']);
    gmailService.getMessage.mockResolvedValue({
      ...allegroInPostShipmentFixture,
      from: 'spam@example.com',
    });
    extractionService.extractParcelFields.mockResolvedValue({
      store: null,
      trackingNumber: null,
      carrier: Carrier.CUSTOM,
      customCarrierLabel: null,
      description: null,
    });

    const started = registry.start(user.id);
    await syncService.runJob(user.id, started!.jobId);

    expect(extractionService.extractParcelFields).toHaveBeenCalled();
    expect(await prisma.parcel.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.gmailMessage.count({ where: { userId: user.id } }),
    ).toBe(1);
    expect(registry.get(started!.jobId, user.id)).toMatchObject({
      skipped: 1,
      imported: 0,
    });
  });
});
