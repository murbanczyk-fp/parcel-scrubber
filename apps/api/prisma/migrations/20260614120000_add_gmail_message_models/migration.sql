-- CreateTable
CREATE TABLE "gmail_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "internal_date" TIMESTAMP(3) NOT NULL,
    "thread_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_emails" (
    "parcel_id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "parcel_emails_pkey" PRIMARY KEY ("parcel_id","gmail_message_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gmail_messages_user_id_gmail_message_id_key" ON "gmail_messages"("user_id", "gmail_message_id");

-- AddForeignKey
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_emails" ADD CONSTRAINT "parcel_emails_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_emails" ADD CONSTRAINT "parcel_emails_user_id_gmail_message_id_fkey" FOREIGN KEY ("user_id", "gmail_message_id") REFERENCES "gmail_messages"("user_id", "gmail_message_id") ON DELETE CASCADE ON UPDATE CASCADE;
