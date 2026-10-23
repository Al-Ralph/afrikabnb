-- Vague 6 (correctifs) : suivi du remboursement au niveau du paiement (doublon sur une réservation
-- déjà payée, montant / devise discordants). Additive, sans perte : deux valeurs d'enum ajoutées.
-- ALTER TYPE … ADD VALUE : aucune ligne existante modifiée ; valeurs utilisables après le commit.

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_DUE';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';
