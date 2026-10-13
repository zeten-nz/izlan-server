-- Bosqich 0: dars progressi asoslari. Faqat ADDITIVE (ustun/indeks qo'shiladi), hech narsa o'chirilmaydi.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "lastPageIndex" INTEGER,
ADD COLUMN     "visitedPageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "UserDirection" ADD COLUMN     "topicFrontier" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "Lesson_topicId_sortOrder_idx" ON "Lesson"("topicId", "sortOrder");

-- Backfill: mavjud darslarning tartibi (createdAt, id) aynan saqlanadi; oraliq 100 — keyingi qayta tartiblash uchun.
UPDATE "Lesson" AS l
SET "sortOrder" = r.rn * 100
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "topicId" ORDER BY "createdAt", id) AS rn
  FROM "Lesson"
) AS r
WHERE l.id = r.id;
