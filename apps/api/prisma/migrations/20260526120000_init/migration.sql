-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "google_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "refresh_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
