-- Vague 6 : paiement Mobile Money (CinetPay) des réservations.
-- Migration additive, sans perte : nouvelles colonnes avec valeur par défaut, nouvelle table.
-- Les réservations existantes passent à paymentStatus = 'NONE' (aucun paiement attendu).

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('NONE', 'UNPAID', 'PAID', 'REFUND_DUE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED', 'FAILED');

-- AlterTable
ALTER TABLE "Booking"
    ADD COLUMN "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'NONE',
    ADD COLUMN "paymentDueAt" TIMESTAMP(3),
    ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_paymentDueAt_idx" ON "Booking"("paymentStatus", "paymentDueAt");

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "transactionId" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentUrl" VARCHAR(2048),
    "providerRef" VARCHAR(255),
    "operatorId" VARCHAR(255),
    "method" VARCHAR(50),
    "rawStatus" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_createdAt_idx" ON "Payment"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase : table inaccessible par la Data API (clé anon), comme les autres tables ; Prisma
-- (propriétaire de la table) n'est pas concerné.
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
