import { execSync } from 'node:child_process';
import path from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Carrier,
  ParcelSource,
  ParcelStatus,
  PrismaClient,
  StatusEventSource,
  type User,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request, { type SuperAgentTest } from 'supertest';
import type { App } from 'supertest/types';

import { AuthService } from '../src/auth/auth.service';
import type { SessionUser } from '../src/auth/types';
import { AppModule } from '../src/app.module';
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

describe('Parcels HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let authService: AuthService;
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    authService = moduleFixture.get(AuthService);
  });

  beforeEach(async () => {
    await truncateAppTables(prisma);
  });

  afterAll(async () => {
    await truncateAppTables(prisma);
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createTestUser(): Promise<User> {
    userCounter += 1;
    return prisma.user.create({
      data: {
        googleSub: `e2e-parcels-user-${userCounter}`,
        email: `e2e-parcels-${userCounter}@example.com`,
        displayName: 'E2E User',
      },
    });
  }

  function createAuthenticatedAgent(user: User): SuperAgentTest {
    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
    const token = authService.signSession(sessionUser);
    return request
      .agent(app.getHttpServer())
      .set('Cookie', `${authService.getCookieName()}=${token}`);
  }

  async function createParcel(
    userId: string,
    data: {
      status?: ParcelStatus;
      trackingNumber?: string;
    } = {},
  ) {
    return prisma.parcel.create({
      data: {
        userId,
        orderDate: new Date('2026-01-15'),
        trackingNumber: data.trackingNumber ?? '520000012680041086770098',
        carrier: Carrier.INPOST,
        source: ParcelSource.GMAIL,
        status: data.status ?? ParcelStatus.NEW,
      },
    });
  }

  it('lists active parcels and excludes them from archived', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);
    const parcel = await createParcel(user.id);

    const activeResponse = await agent
      .get('/api/parcels?status=active')
      .expect(200);
    const activeIds = (activeResponse.body as Array<{ id: string }>).map(
      (row) => row.id,
    );
    expect(activeIds).toContain(parcel.id);

    const archivedResponse = await agent
      .get('/api/parcels?status=archived')
      .expect(200);
    const archivedIds = (archivedResponse.body as Array<{ id: string }>).map(
      (row) => row.id,
    );
    expect(archivedIds).not.toContain(parcel.id);
  });

  it('delivers a parcel, moves it to archived, and writes a status event', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);
    const parcel = await createParcel(user.id);

    const deliverResponse = await agent
      .post(`/api/parcels/${parcel.id}/deliver`)
      .expect(200);

    expect(deliverResponse.body).toMatchObject({
      id: parcel.id,
      status: 'DELIVERED',
    });

    const activeIds = (
      (await agent.get('/api/parcels?status=active').expect(200))
        .body as Array<{
        id: string;
      }>
    ).map((row) => row.id);
    expect(activeIds).not.toContain(parcel.id);

    const archived = (
      (await agent.get('/api/parcels?status=archived').expect(200))
        .body as Array<{
        id: string;
        status: string;
      }>
    ).find((row) => row.id === parcel.id);
    expect(archived).toMatchObject({ status: 'DELIVERED' });

    const events = await prisma.parcelStatusEvent.findMany({
      where: { parcelId: parcel.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: ParcelStatus.NEW,
      toStatus: ParcelStatus.DELIVERED,
      source: StatusEventSource.USER,
    });
  });

  it('is idempotent when delivering an already delivered parcel', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);
    const parcel = await createParcel(user.id);

    await agent.post(`/api/parcels/${parcel.id}/deliver`).expect(200);
    await agent.post(`/api/parcels/${parcel.id}/deliver`).expect(200);

    const eventCount = await prisma.parcelStatusEvent.count({
      where: { parcelId: parcel.id },
    });
    expect(eventCount).toBe(1);
  });

  it('removes a parcel and shows it in archived with REMOVED status', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);
    const parcel = await createParcel(user.id);

    const removeResponse = await agent
      .post(`/api/parcels/${parcel.id}/remove`)
      .expect(200);

    expect(removeResponse.body).toMatchObject({
      id: parcel.id,
      status: 'REMOVED',
    });

    const archived = (
      (await agent.get('/api/parcels?status=archived').expect(200))
        .body as Array<{
        id: string;
        status: string;
      }>
    ).find((row) => row.id === parcel.id);
    expect(archived).toMatchObject({ status: 'REMOVED' });
  });

  it('is idempotent when removing an already removed parcel', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);
    const parcel = await createParcel(user.id);

    await agent.post(`/api/parcels/${parcel.id}/remove`).expect(200);
    await agent.post(`/api/parcels/${parcel.id}/remove`).expect(200);

    const eventCount = await prisma.parcelStatusEvent.count({
      where: { parcelId: parcel.id },
    });
    expect(eventCount).toBe(1);
  });

  it('returns 404 for unknown parcel or another user parcel', async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();
    const parcel = await createParcel(owner.id);
    const otherAgent = createAuthenticatedAgent(otherUser);

    await otherAgent.post(`/api/parcels/${parcel.id}/deliver`).expect(404);
    await otherAgent.post(`/api/parcels/${parcel.id}/remove`).expect(404);

    const ownerAgent = createAuthenticatedAgent(owner);
    await ownerAgent.post('/api/parcels/missing-parcel-id/deliver').expect(404);
    await ownerAgent.post('/api/parcels/missing-parcel-id/remove').expect(404);
  });

  it('returns 400 when status query parameter is omitted', async () => {
    const user = await createTestUser();
    const agent = createAuthenticatedAgent(user);

    await agent.get('/api/parcels').expect(400);
  });
});
