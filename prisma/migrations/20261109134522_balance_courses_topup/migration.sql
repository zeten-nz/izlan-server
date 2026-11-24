-- CreateEnum
CREATE TYPE "MoneyKind" AS ENUM ('TOPUP', 'PURCHASE', 'ADJUST');

-- AlterTable
ALTER TABLE "Direction" ADD COLUMN     "monthlyPriceUzs" INTEGER;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "balanceUzs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MoneyLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MoneyKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "directionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyLedger_dedupeKey_key" ON "MoneyLedger"("dedupeKey");

-- CreateIndex
CREATE INDEX "MoneyLedger_userId_createdAt_idx" ON "MoneyLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_userId_directionId_key" ON "CourseAccess"("userId", "directionId");

-- AddForeignKey
ALTER TABLE "MoneyLedger" ADD CONSTRAINT "MoneyLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankIncomeStatus" AS ENUM ('MATCHED', 'LATE_MATCHED', 'REVIEW', 'ASSIGNED', 'IGNORED');

-- CreateTable
CREATE TABLE "TopupRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "suffix" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TopupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankIncome" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "hasFraction" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "rawText" TEXT,
    "status" "BankIncomeStatus" NOT NULL,
    "reason" TEXT,
    "topupRequestId" TEXT,
    "creditedUserId" TEXT,
    "creditedAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankIncome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopupRequest_amount_status_idx" ON "TopupRequest"("amount", "status");

-- CreateIndex
CREATE INDEX "TopupRequest_status_expiresAt_idx" ON "TopupRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TopupRequest_userId_createdAt_idx" ON "TopupRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankIncome_externalId_key" ON "BankIncome"("externalId");

-- CreateIndex
CREATE INDEX "BankIncome_status_createdAt_idx" ON "BankIncome"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankIncome" ADD CONSTRAINT "BankIncome_topupRequestId_fkey" FOREIGN KEY ("topupRequestId") REFERENCES "TopupRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Qo'shimcha cheklovlar (qo'lda) ─────
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balanceUzs_nonneg" CHECK ("balanceUzs" >= 0);
ALTER TABLE "Direction" ADD CONSTRAINT "Direction_monthlyPriceUzs_nonneg" CHECK ("monthlyPriceUzs" IS NULL OR "monthlyPriceUzs" >= 0);
ALTER TABLE "MoneyLedger" ADD CONSTRAINT "MoneyLedger_amounts" CHECK (
  "amount" <> 0 AND "balanceAfter" >= 0
  AND (("kind" = 'TOPUP' AND "amount" > 0) OR ("kind" = 'PURCHASE' AND "amount" < 0) OR "kind" = 'ADJUST')
);

-- Append-only: UPDATE hech qachon; DELETE faqat foydalanuvchi o'chirilganda (FK cascade ichida trigger chuqurligi >= 2).
CREATE OR REPLACE FUNCTION money_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'MoneyLedger append-only: UPDATE taqiqlangan';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'MoneyLedger append-only: DELETE taqiqlangan';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MoneyLedger_append_only"
  BEFORE UPDATE OR DELETE ON "MoneyLedger"
  FOR EACH ROW EXECUTE FUNCTION money_ledger_append_only();

-- ───── Saytdan to'ldirish: qo'shimcha cheklovlar (qo'lda) ─────
-- Bir vaqtda bitta faol so'rov: summa bo'yicha ham, foydalanuvchi bo'yicha ham
CREATE UNIQUE INDEX "TopupRequest_amount_pending_key" ON "TopupRequest"("amount") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "TopupRequest_user_pending_key" ON "TopupRequest"("userId") WHERE "status" = 'PENDING';
ALTER TABLE "TopupRequest" ADD CONSTRAINT "TopupRequest_amounts" CHECK (
  "baseAmount" > 0 AND "baseAmount" % 1000 = 0 AND "suffix" BETWEEN 1 AND 999 AND "amount" = "baseAmount" + "suffix"
);
ALTER TABLE "BankIncome" ADD CONSTRAINT "BankIncome_amounts" CHECK ("amount" > 0 AND ("creditedAmount" IS NULL OR "creditedAmount" > 0));
