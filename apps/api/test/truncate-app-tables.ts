import type { PrismaClient } from '@prisma/client';

export async function truncateAppTables(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "parcel_status_events", "parcels", "user_settings", "users" CASCADE',
  );
}
