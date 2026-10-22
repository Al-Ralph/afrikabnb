-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('WIFI', 'AIR_CONDITIONING', 'FAN', 'POOL', 'PARKING', 'KITCHEN', 'WASHER', 'TV', 'WORKSPACE', 'GENERATOR', 'SOLAR_POWER', 'WATER_TANK', 'WATER_HEATER', 'SECURITY', 'CCTV', 'BREAKFAST', 'SEA_VIEW', 'BEACH_ACCESS', 'GARDEN', 'TERRACE', 'BBQ', 'MOSQUITO_NETS', 'AIRPORT_SHUTTLE', 'HOUSEKEEPING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'DECLINED';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "amenities" "Amenity"[] DEFAULT ARRAY[]::"Amenity"[],
ADD COLUMN     "instantBook" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "path" VARCHAR(512),
    "position" INTEGER NOT NULL DEFAULT 0,
    "alt" VARCHAR(200),
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedPeriod" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingImage_listingId_position_idx" ON "ListingImage"("listingId", "position");

-- CreateIndex
CREATE INDEX "BlockedPeriod_listingId_startDate_endDate_idx" ON "BlockedPeriod"("listingId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedPeriod" ADD CONSTRAINT "BlockedPeriod_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Ajouts manuels (non générés par `prisma migrate diff`)
-- ---------------------------------------------------------------------------------------------

-- Note : `ALTER TYPE ... ADD VALUE` est accepté dans une transaction depuis PostgreSQL 12
-- (Supabase : 15+) ; les nouvelles valeurs DECLINED / EXPIRED ne sont pas utilisées dans cette
-- migration (contrainte PostgreSQL), uniquement par l'API ensuite. Aucune ligne existante modifiée.

-- Reprise des images existantes : chaque Listing.imageUrl devient la ListingImage de position 0
-- (image de couverture). `path` NULL : image externe, jamais supprimée du stockage.
INSERT INTO "ListingImage" ("id", "listingId", "url", "path", "position", "alt", "createdAt")
SELECT gen_random_uuid()::text, l."id", l."imageUrl", NULL, 0, LEFT(l."title", 200), CURRENT_TIMESTAMP
FROM "Listing" l
WHERE l."imageUrl" IS NOT NULL AND l."imageUrl" <> '';

-- Supabase Data API : Row Level Security sans policy sur les nouvelles tables (comme les autres).
ALTER TABLE "ListingImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
