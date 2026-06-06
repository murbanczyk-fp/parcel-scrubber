import { execSync } from 'node:child_process';
import path from 'node:path';

import {
  Carrier,
  ParcelSource,
  ParcelStatus,
  PrismaClient,
  StatusEventSource,
} from '@prisma/client';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://parcel:parcel@localhost:5432/parcel_scrubber_test';

const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

async function truncateAppTables(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "parcel_status_events", "parcels", "users" CASCADE',
  );
}

describe('Parcel schema (e2e)', () => {
  let prisma: PrismaClient;
  let userCounter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
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

  afterEach(async () => {
    await truncateAppTables(prisma);
  });

  afterAll(async () => {
    await truncateAppTables(prisma);
    await prisma?.$disconnect();
  });

  async function createTestUser() {
    userCounter += 1;
    return prisma.user.create({
      data: {
        googleSub: `e2e-google-sub-${userCounter}`,
        email: `e2e-${userCounter}@example.com`,
      },
    });
  }

  it('persists parcel with enums and @db.Date orderDate', async () => {
    const user = await createTestUser();
    const orderDate = new Date('2024-06-15T12:00:00.000Z');

    const parcel = await prisma.parcel.create({
      data: {
        userId: user.id,
        trackingNumber: '520000012680041086770098',
        carrier: Carrier.INPOST,
        source: ParcelSource.GMAIL,
        status: ParcelStatus.IN_TRANSIT,
        orderDate,
      },
    });

    const readBack = await prisma.parcel.findUniqueOrThrow({
      where: { id: parcel.id },
    });

    expect(readBack.trackingNumber).toBe('520000012680041086770098');
    expect(readBack.carrier).toBe(Carrier.INPOST);
    expect(readBack.source).toBe(ParcelSource.GMAIL);
    expect(readBack.status).toBe(ParcelStatus.IN_TRANSIT);
    expect(readBack.orderDate.toISOString()).toBe('2024-06-15T00:00:00.000Z');
  });

  it('allows multiple parcels with null trackingNumber for the same user', async () => {
    const user = await createTestUser();
    const orderDate = new Date('2024-01-01');

    await prisma.parcel.create({
      data: {
        userId: user.id,
        orderDate,
        trackingNumber: null,
      },
    });

    await expect(
      prisma.parcel.create({
        data: {
          userId: user.id,
          orderDate,
          trackingNumber: null,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('rejects duplicate (userId, trackingNumber) when trackingNumber is set', async () => {
    const user = await createTestUser();
    const orderDate = new Date('2024-01-01');
    const trackingNumber = 'DUPLICATE-TRACK-001';

    await prisma.parcel.create({
      data: {
        userId: user.id,
        orderDate,
        trackingNumber,
      },
    });

    await expect(
      prisma.parcel.create({
        data: {
          userId: user.id,
          orderDate,
          trackingNumber,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('persists ParcelStatusEvent with StatusEventSource.USER', async () => {
    const user = await createTestUser();
    const orderDate = new Date('2024-01-01');

    const parcel = await prisma.parcel.create({
      data: {
        userId: user.id,
        orderDate,
        trackingNumber: 'EVENT-TRACK-001',
      },
    });

    const event = await prisma.parcelStatusEvent.create({
      data: {
        parcelId: parcel.id,
        fromStatus: ParcelStatus.NEW,
        toStatus: ParcelStatus.IN_TRANSIT,
        source: StatusEventSource.USER,
      },
    });

    const readBack = await prisma.parcelStatusEvent.findUniqueOrThrow({
      where: { id: event.id },
      include: { parcel: true },
    });

    expect(readBack.source).toBe(StatusEventSource.USER);
    expect(readBack.parcel.id).toBe(parcel.id);
  });

  it('cascades delete from user to parcels and status events', async () => {
    const user = await prisma.user.create({
      data: {
        googleSub: 'e2e-cascade-user',
        email: 'cascade@example.com',
      },
    });
    const orderDate = new Date('2024-01-01');

    const parcel = await prisma.parcel.create({
      data: {
        userId: user.id,
        orderDate,
        trackingNumber: 'CASCADE-TRACK-001',
      },
    });

    await prisma.parcelStatusEvent.create({
      data: {
        parcelId: parcel.id,
        fromStatus: ParcelStatus.NEW,
        toStatus: ParcelStatus.DELIVERED,
        source: StatusEventSource.USER,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.parcel.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.parcelStatusEvent.count({ where: { parcelId: parcel.id } }),
    ).toBe(0);
  });
});
