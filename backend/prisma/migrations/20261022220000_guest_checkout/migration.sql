-- Vague 4 : réservation sans compte + fiche de contact transmise à l'hôte.
-- Migration additive, sans perte : aucune colonne supprimée, aucune ligne effacée.

-- Réservation sans compte : plus de voyageur obligatoire (la clé étrangère et sa cascade restent).
ALTER TABLE "Booking" ALTER COLUMN "guestId" DROP NOT NULL;

-- Fiche de contact (nullable : les réservations existantes restent valides).
ALTER TABLE "Booking"
    ADD COLUMN "contactName" VARCHAR(100),
    ADD COLUMN "contactEmail" VARCHAR(254),
    ADD COLUMN "contactPhone" VARCHAR(32),
    ADD COLUMN "contactCountry" VARCHAR(2),
    ADD COLUMN "arrivalTime" VARCHAR(5),
    ADD COLUMN "messageToHost" VARCHAR(1000),
    ADD COLUMN "guestAccessTokenHash" CHAR(64),
    ADD COLUMN "guestAccessExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_guestAccessTokenHash_key" ON "Booking"("guestAccessTokenHash");

-- CreateIndex
CREATE INDEX "Booking_contactEmail_idx" ON "Booking"("contactEmail");

-- Reprise : nom et e-mail du compte pour les réservations existantes (téléphone et pays inconnus).
UPDATE "Booking" AS b
SET "contactName" = u."name",
    "contactEmail" = lower(u."email")
FROM "User" AS u
WHERE b."guestId" = u."id"
  AND b."contactEmail" IS NULL;
