-- CreateEnum
CREATE TYPE "XpEventType" AS ENUM ('LESSON_COMPLETE', 'TOPIC_COMPLETE', 'QUIZ_TIER', 'NOTE_VERIFIED');

-- CreateEnum
CREATE TYPE "XpEntryKind" AS ENUM ('EARN', 'SPEND', 'ADJUST');

-- CreateTable
CREATE TABLE "XpLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "XpEntryKind" NOT NULL DEFAULT 'EARN',
    "eventType" "XpEventType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "topicId" TEXT,
    "baseXp" INTEGER NOT NULL,
    "multiplierBp" INTEGER NOT NULL,
    "grantedXp" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "topicDayOrd" INTEGER,
    "balanceAfter" INTEGER NOT NULL,
    "totalAfter" INTEGER NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpTopicDay" (
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTopicDay_pkey" PRIMARY KEY ("userId","dayKey","topicId")
);

-- CreateTable
CREATE TABLE "TopicCompletion" (
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'LESSONS',

    CONSTRAINT "TopicCompletion_pkey" PRIMARY KEY ("userId","topicId")
);

-- CreateTable
CREATE TABLE "TopicQuiz" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizVersion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "status" "LessonVersionStatus" NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "QuizVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "scorePct" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XpLedger_dedupeKey_key" ON "XpLedger"("dedupeKey");

-- CreateIndex
CREATE INDEX "XpLedger_userId_createdAt_idx" ON "XpLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "XpLedger_userId_dayKey_topicId_idx" ON "XpLedger"("userId", "dayKey", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "XpTopicDay_userId_dayKey_ord_key" ON "XpTopicDay"("userId", "dayKey", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "TopicQuiz_topicId_key" ON "TopicQuiz"("topicId");

-- CreateIndex
CREATE INDEX "QuizVersion_quizId_status_idx" ON "QuizVersion"("quizId", "status");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_versionId_idx" ON "QuizAttempt"("userId", "versionId");

-- AddForeignKey
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTopicDay" ADD CONSTRAINT "XpTopicDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicCompletion" ADD CONSTRAINT "TopicCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicQuiz" ADD CONSTRAINT "TopicQuiz_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicQuiz" ADD CONSTRAINT "TopicQuiz_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizVersion" ADD CONSTRAINT "QuizVersion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TopicQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuizVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───── XP ledger: invariantlar ─────
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_amounts" CHECK (
  ("kind" = 'EARN' AND "grantedXp" >= 0 AND "baseXp" >= 0 AND "multiplierBp" BETWEEN 0 AND 10000)
  OR ("kind" <> 'EARN' AND "grantedXp" <= 0)
) ;
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_balances" CHECK ("balanceAfter" >= 0 AND "totalAfter" >= "balanceAfter");
ALTER TABLE "XpTopicDay" ADD CONSTRAINT "XpTopicDay_ord_positive" CHECK ("ord" >= 1);
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_counts" CHECK ("correctCount" >= 0 AND "total" > 0 AND "correctCount" <= "total" AND "scorePct" BETWEEN 0 AND 100);

-- Append-only: UPDATE hech qachon; DELETE faqat foydalanuvchi o'chirilganda (FK cascade ichida trigger chuqurligi >= 2).
CREATE OR REPLACE FUNCTION xp_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'XpLedger append-only: UPDATE taqiqlangan';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'XpLedger append-only: DELETE taqiqlangan';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "XpLedger_append_only"
  BEFORE UPDATE OR DELETE ON "XpLedger"
  FOR EACH ROW EXECUTE FUNCTION xp_ledger_append_only();

-- ───── Mavjud tarix: hozir tugagan mavzularni BELGILAB qo'yamiz (XP BERILMAYDI) ─────
-- Aks holda keyin qo'shilgan yangi dars tugatilganda eski mavzu "birinchi marta tugadi" deb 25 XP berar edi.
WITH pub AS (
  SELECT l."id", l."topicId" FROM "Lesson" l WHERE l."publishedVersionId" IS NOT NULL
),
tot AS (
  SELECT "topicId", COUNT(*) AS n FROM pub GROUP BY "topicId"
),
done AS (
  SELECT lp."userId", v."lessonId", MAX(lp."completedAt") AS at
  FROM "LessonProgress" lp JOIN "LessonVersion" v ON v."id" = lp."versionId"
  WHERE lp."completedAt" IS NOT NULL
  GROUP BY lp."userId", v."lessonId"
),
per AS (
  SELECT d."userId", p."topicId", COUNT(*) AS c, MAX(d.at) AS at
  FROM done d JOIN pub p ON p."id" = d."lessonId"
  GROUP BY d."userId", p."topicId"
)
INSERT INTO "TopicCompletion" ("userId", "topicId", "completedAt", "source")
SELECT per."userId", per."topicId", per.at, 'BACKFILL'
FROM per JOIN tot ON tot."topicId" = per."topicId"
WHERE per.c >= tot.n
ON CONFLICT DO NOTHING;
