-- CreateEnum
CREATE TYPE "ParcelSource" AS ENUM ('gmail', 'manual');

-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('inpost', 'poczta_polska', 'dpd', 'dhl', 'custom');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('new', 'in_transit', 'in_delivery', 'delivered', 'removed');

-- CreateEnum
CREATE TYPE "StatusEventSource" AS ENUM ('user', 'sync', 'system');

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store" TEXT,
    "description" TEXT,
    "custom_carrier_label" TEXT,
    "carrier" "Carrier" NOT NULL DEFAULT 'custom',
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "order_date" DATE NOT NULL,
    "status" "ParcelStatus" NOT NULL DEFAULT 'new',
    "source" "ParcelSource" NOT NULL DEFAULT 'gmail',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_status_events" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "from_status" "ParcelStatus" NOT NULL,
    "to_status" "ParcelStatus" NOT NULL,
    "source" "StatusEventSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcels_user_id_status_idx" ON "parcels"("user_id", "status");

-- CreateIndex
CREATE INDEX "parcel_status_events_parcel_id_created_at_idx" ON "parcel_status_events"("parcel_id", "created_at");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_status_events" ADD CONSTRAINT "parcel_status_events_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: allow multiple null tracking numbers per user
CREATE UNIQUE INDEX "parcels_user_id_tracking_number_key"
  ON "parcels"("user_id", "tracking_number")
  WHERE "tracking_number" IS NOT NULL;
