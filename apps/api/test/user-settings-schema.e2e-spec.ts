import { execSync } from 'node:child_process';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import {
  resolveEffectiveSettings,
  USER_SETTING_KEYS,
} from '../src/user-settings';
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

describe('User settings schema (e2e)', () => {
  let prisma: PrismaClient;
  let userCounter = 0;

  beforeAll(async () => {
    assertE2eDatabaseUrl(TEST_DATABASE_URL);
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
        googleSub: `e2e-settings-google-sub-${userCounter}`,
        email: `e2e-settings-${userCounter}@example.com`,
      },
    });
  }

  it('returns PRD defaults when user has no settings rows', async () => {
    const user = await createTestUser();

    const rows = await prisma.userSetting.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(0);
    expect(resolveEffectiveSettings(rows)).toEqual({
      gmailScanLabel: 'ParcelScrubber',
      scanPeriodDays: 30,
    });
  });

  it('merges stored gmailScanLabel over defaults', async () => {
    const user = await createTestUser();

    await prisma.userSetting.create({
      data: {
        userId: user.id,
        settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
        settingValue: 'MyParcels',
      },
    });

    const rows = await prisma.userSetting.findMany({
      where: { userId: user.id },
    });
    expect(resolveEffectiveSettings(rows)).toEqual({
      gmailScanLabel: 'MyParcels',
      scanPeriodDays: 30,
    });
  });

  it('rejects duplicate (userId, settingKey)', async () => {
    const user = await createTestUser();

    await prisma.userSetting.create({
      data: {
        userId: user.id,
        settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
        settingValue: 'First',
      },
    });

    await expect(
      prisma.userSetting.create({
        data: {
          userId: user.id,
          settingKey: USER_SETTING_KEYS.GMAIL_SCAN_LABEL,
          settingValue: 'Second',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades delete from user to settings rows', async () => {
    const user = await createTestUser();

    await prisma.userSetting.create({
      data: {
        userId: user.id,
        settingKey: USER_SETTING_KEYS.SCAN_PERIOD_DAYS,
        settingValue: '14',
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.userSetting.count({ where: { userId: user.id } })).toBe(
      0,
    );
  });
});
