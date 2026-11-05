-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('FRAME', 'BANNER', 'EFFECT', 'TITLE');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "CosmeticStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OwnershipSource" AS ENUM ('PURCHASE', 'ACHIEVEMENT', 'EVENT', 'ADMIN_GRANT');

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "showFullName" BOOLEAN NOT NULL DEFAULT false,
    "showAchievements" BOOLEAN NOT NULL DEFAULT false,
    "showStats" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UsernameAlias" (
    "oldUsername" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsernameAlias_pkey" PRIMARY KEY ("oldUsername")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "xpBalance" INTEGER NOT NULL DEFAULT 0,
    "totalXpEarned" INTEGER NOT NULL DEFAULT 0,
    "izlBalance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CosmeticItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceXp" INTEGER,
    "status" "CosmeticStatus" NOT NULL DEFAULT 'DRAFT',
    "preview" JSONB NOT NULL DEFAULT '{}',
    "season" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CosmeticItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticOwnership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" "OwnershipSource" NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquippedCosmetics" (
    "userId" TEXT NOT NULL,
    "frameId" TEXT,
    "bannerId" TEXT,
    "effectId" TEXT,
    "titleId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquippedCosmetics_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AchievementDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsernameAlias_userId_idx" ON "UsernameAlias"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticItem_slug_key" ON "CosmeticItem"("slug");

-- CreateIndex
CREATE INDEX "CosmeticItem_kind_status_idx" ON "CosmeticItem"("kind", "status");

-- CreateIndex
CREATE INDEX "CosmeticOwnership_itemId_idx" ON "CosmeticOwnership"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticOwnership_userId_itemId_key" ON "CosmeticOwnership"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementDefinition_slug_key" ON "AchievementDefinition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticOwnership" ADD CONSTRAINT "CosmeticOwnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticOwnership" ADD CONSTRAINT "CosmeticOwnership_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CosmeticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedCosmetics" ADD CONSTRAINT "EquippedCosmetics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "AchievementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Balanslar hech qachon manfiy bo'lmaydi; totalXpEarned xarid tufayli kamaymaydi (kod darajasida) va xpBalance'dan kichik bo'lmaydi.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonnegative" CHECK ("xpBalance" >= 0 AND "totalXpEarned" >= 0 AND "izlBalance" >= 0 AND "totalXpEarned" >= "xpBalance");
ALTER TABLE "CosmeticItem" ADD CONSTRAINT "CosmeticItem_price_nonnegative" CHECK ("priceXp" IS NULL OR "priceXp" >= 0);
