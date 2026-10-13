-- AlterTable
ALTER TABLE "LessonBlockAttempt" ADD COLUMN     "wrongTries" INTEGER NOT NULL DEFAULT 0;

-- Eski qatorlar: faqat ishonchli faktlar. Hech qachon to'g'ri bo'lmagan blokda hamma urinish noto'g'ri;
-- to'g'ri bo'lib, oxirgi urinish noto'g'ri bo'lsa kamida bitta xato (pastki chegara). Qolganini taxmin qilmaymiz.
UPDATE "LessonBlockAttempt"
SET "wrongTries" = CASE WHEN "everCorrect" = false THEN "tries" WHEN "correct" = false THEN 1 ELSE 0 END
WHERE "everCorrect" = false OR "correct" = false;

-- CreateTable
CREATE TABLE "VocabularyEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "meaning" TEXT NOT NULL DEFAULT '',
    "meaningKey" TEXT NOT NULL DEFAULT '',
    "example" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "directionId" TEXT,
    "topicId" TEXT,
    "lessonId" TEXT,
    "pageId" TEXT,
    "sourceTitle" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "directionId" TEXT,
    "topicId" TEXT,
    "lessonId" TEXT,
    "pageId" TEXT,
    "sourceTitle" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedMaterial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL DEFAULT '',
    "directionId" TEXT,
    "topicId" TEXT,
    "lessonTitle" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyEntry_userId_createdAt_idx" ON "VocabularyEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabularyEntry_userId_directionId_idx" ON "VocabularyEntry"("userId", "directionId");

-- CreateIndex
CREATE INDEX "VocabularyEntry_userId_topicId_idx" ON "VocabularyEntry"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_userId_termKey_meaningKey_key" ON "VocabularyEntry"("userId", "termKey", "meaningKey");

-- CreateIndex
CREATE INDEX "StudentNote_userId_updatedAt_idx" ON "StudentNote"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudentNote_userId_directionId_idx" ON "StudentNote"("userId", "directionId");

-- CreateIndex
CREATE INDEX "StudentNote_userId_topicId_idx" ON "StudentNote"("userId", "topicId");

-- CreateIndex
CREATE INDEX "SavedMaterial_userId_createdAt_idx" ON "SavedMaterial"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedMaterial_userId_directionId_idx" ON "SavedMaterial"("userId", "directionId");

-- CreateIndex
CREATE INDEX "SavedMaterial_userId_topicId_idx" ON "SavedMaterial"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedMaterial_userId_lessonId_pageId_key" ON "SavedMaterial"("userId", "lessonId", "pageId");

-- AddForeignKey
ALTER TABLE "VocabularyEntry" ADD CONSTRAINT "VocabularyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedMaterial" ADD CONSTRAINT "SavedMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
