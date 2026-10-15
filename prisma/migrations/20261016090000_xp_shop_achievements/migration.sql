-- AlterEnum
ALTER TYPE "XpEventType" ADD VALUE 'PURCHASE';

-- AlterTable
ALTER TABLE "UserAchievement" ADD COLUMN     "reason" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "ruleVersion" TEXT NOT NULL DEFAULT 'ach-v1',
ADD COLUMN     "showcaseOrder" INTEGER;

-- AlterTable
ALTER TABLE "XpLedger" ADD COLUMN     "cosmeticItemId" TEXT,
ADD COLUMN     "pricePaid" INTEGER;

-- CreateTable
CREATE TABLE "XpPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XpPurchase_ledgerId_key" ON "XpPurchase"("ledgerId");

-- CreateIndex
CREATE INDEX "XpPurchase_userId_createdAt_idx" ON "XpPurchase"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "XpPurchase_userId_idempotencyKey_key" ON "XpPurchase"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "XpPurchase_userId_itemId_key" ON "XpPurchase"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "XpPurchase" ADD CONSTRAINT "XpPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpPurchase" ADD CONSTRAINT "XpPurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CosmeticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpPurchase" ADD CONSTRAINT "XpPurchase_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "XpLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───── Narx: nol yoki manfiy bo'lmasin (null = belgilanmagan) ─────
ALTER TABLE "CosmeticItem" DROP CONSTRAINT IF EXISTS "CosmeticItem_price_nonnegative";
ALTER TABLE "CosmeticItem" ADD CONSTRAINT "CosmeticItem_price_positive" CHECK ("priceXp" IS NULL OR "priceXp" > 0);

-- ───── SPEND invarianti: bezak va narx snapshot'i majburiy, summa = -narx; totalXpEarned o'zgarmaydi ─────
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_spend_shape" CHECK (
  "kind" <> 'SPEND' OR (
    "cosmeticItemId" IS NOT NULL AND "pricePaid" IS NOT NULL AND "pricePaid" > 0 AND "grantedXp" = -"pricePaid"
  )
);
ALTER TABLE "XpPurchase" ADD CONSTRAINT "XpPurchase_price_positive" CHECK ("pricePaid" > 0);

-- ───── Achievement: asosiy badge tartibi 1..3, har foydalanuvchida noyob ─────
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_showcase_range" CHECK ("showcaseOrder" IS NULL OR "showcaseOrder" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "UserAchievement_userId_showcaseOrder_key" ON "UserAchievement"("userId", "showcaseOrder") WHERE "showcaseOrder" IS NOT NULL;

-- ───── Dastlabki 5 ta achievement ta'rifi (qoidalar kodda: ACHIEVEMENT_RULES_V1). Hech kimga berilmaydi. ─────
INSERT INTO "AchievementDefinition" ("id", "slug", "name", "description", "active") VALUES
  ('ach-first-step',    'birinchi-qadam',  'Birinchi qadam',  'Birinchi darsni yakunlading.', true),
  ('ach-knowledge-path','bilim-yolida',    'Bilim yo''lida',  '10 ta turli mavzuni yakunlading.', true),
  ('ach-test-master',   'sinov-ustasi',    'Sinov ustasi',    '10 ta turli mavzu testidan kamida 90% natija oldingiz.', true),
  ('ach-disciplined',   'intizomli',       'Intizomli',       '7 xil kunda tasdiqlangan o''quv faoliyati.', true),
  ('ach-devoted',       'ilm-fidoyisi',    'Ilm fidoyisi',    '100 ta turli mavzuni yakunlading.', true)
ON CONFLICT ("slug") DO NOTHING;
