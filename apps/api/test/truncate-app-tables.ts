import type { PrismaClient } from '@prisma/client';

export async function truncateAppTables(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "parcel_emails", "gmail_messages", "parcel_status_events", "parcels", "user_settings", "users" CASCADE',
  );
}
