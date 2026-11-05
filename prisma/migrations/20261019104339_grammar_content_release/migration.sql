-- CreateEnum
CREATE TYPE "GrammarRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "GrammarRuleState" AS ENUM ('OPEN', 'RETIRED');

-- CreateEnum
CREATE TYPE "GrammarProvenance" AS ENUM ('AI_DRAFT', 'ORIGINAL', 'EXTERNAL', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GrammarActivationAction" AS ENUM ('ACTIVATE', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "GrammarOverlayAction" AS ENUM ('HIDE', 'UNHIDE');

-- CreateTable
CREATE TABLE "GrammarLanguage" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL DEFAULT '',
    "dir" TEXT NOT NULL DEFAULT 'ltr',
    "blocks" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "levelSystem" TEXT NOT NULL DEFAULT 'none',
    "scripts" TEXT[],
    "categories" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarLanguage_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "GrammarRule" (
    "id" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "levelSystem" TEXT,
    "levelValue" TEXT,
    "levelConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "state" "GrammarRuleState" NOT NULL DEFAULT 'OPEN',
    "replacedById" TEXT,
    "retiredReason" TEXT,
    "createdById" TEXT,
    "createdLabel" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "deletedSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarSlugAlias" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarSlugAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarIdCounter" (
    "lang" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GrammarIdCounter_pkey" PRIMARY KEY ("lang")
);

-- CreateTable
CREATE TABLE "GrammarRevision" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "explanationLang" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "status" "GrammarRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "rev" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "contentSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "provenance" "GrammarProvenance" NOT NULL DEFAULT 'UNKNOWN',
    "authorId" TEXT,
    "authorLabel" TEXT,
    "lastEditedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedHash" TEXT,
    "selfApproved" BOOLEAN NOT NULL DEFAULT false,
    "checks" JSONB,
    "reviewNote" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarReviewEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "revisionId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarRelease" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "contentSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "languages" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "baseReleaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarReleaseItem" (
    "releaseId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "explanationLang" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "meta" JSONB NOT NULL,

    CONSTRAINT "GrammarReleaseItem_pkey" PRIMARY KEY ("releaseId","ruleId","explanationLang")
);

-- CreateTable
CREATE TABLE "GrammarActivation" (
    "seq" SERIAL NOT NULL,
    "releaseId" TEXT NOT NULL,
    "action" "GrammarActivationAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousReleaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarActivation_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "GrammarOverlayEvent" (
    "seq" SERIAL NOT NULL,
    "ruleId" TEXT NOT NULL,
    "action" "GrammarOverlayAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarOverlayEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "GrammarImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "report" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "GrammarImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrammarRule_createdById_idx" ON "GrammarRule"("createdById");

-- CreateIndex
CREATE INDEX "GrammarRule_lang_state_idx" ON "GrammarRule"("lang", "state");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarRule_lang_slug_key" ON "GrammarRule"("lang", "slug");

-- CreateIndex
CREATE INDEX "GrammarSlugAlias_ruleId_idx" ON "GrammarSlugAlias"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarSlugAlias_lang_slug_key" ON "GrammarSlugAlias"("lang", "slug");

-- CreateIndex
CREATE INDEX "GrammarRevision_status_idx" ON "GrammarRevision"("status");

-- CreateIndex
CREATE INDEX "GrammarRevision_authorId_idx" ON "GrammarRevision"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarRevision_ruleId_explanationLang_revisionNo_key" ON "GrammarRevision"("ruleId", "explanationLang", "revisionNo");

-- CreateIndex
CREATE INDEX "GrammarReviewEvent_ruleId_createdAt_idx" ON "GrammarReviewEvent"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "GrammarReviewEvent_revisionId_idx" ON "GrammarReviewEvent"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarRelease_seq_key" ON "GrammarRelease"("seq");

-- CreateIndex
CREATE INDEX "GrammarReleaseItem_revisionId_idx" ON "GrammarReleaseItem"("revisionId");

-- CreateIndex
CREATE INDEX "GrammarOverlayEvent_ruleId_seq_idx" ON "GrammarOverlayEvent"("ruleId", "seq");

-- AddForeignKey
ALTER TABLE "GrammarSlugAlias" ADD CONSTRAINT "GrammarSlugAlias_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GrammarRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarRevision" ADD CONSTRAINT "GrammarRevision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GrammarRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarReleaseItem" ADD CONSTRAINT "GrammarReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "GrammarRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarReleaseItem" ADD CONSTRAINT "GrammarReleaseItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "GrammarRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Grammar Library: DB darajasidagi invariantlar (ADR-001) ─────────────
-- Ilova xatosi yoki to'g'ridan-to'g'ri SQL bilan ham buzib bo'lmaydigan qoidalar.

-- 1) Revision: tasdiqlangan/rad etilgan o'zgarmas; IN_REVIEW'da kontent o'zgarmaydi; faqat ruxsat etilgan status o'tishlari.
CREATE OR REPLACE FUNCTION grammar_revision_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'GrammarRevision % (status %) o''chirib bo''lmaydi', OLD."id", OLD."status" USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."ruleId" IS DISTINCT FROM OLD."ruleId"
     OR NEW."explanationLang" IS DISTINCT FROM OLD."explanationLang"
     OR NEW."revisionNo" IS DISTINCT FROM OLD."revisionNo" THEN
    RAISE EXCEPTION 'GrammarRevision identifikatsiyasi o''zgarmaydi' USING ERRCODE = 'check_violation';
  END IF;

  -- Rad etilgan (hech qachon approved bo'lmagan) revision faqat soft-delete qilinishi mumkin; boshqa hech narsa o'zgarmaydi
  IF OLD."status" = 'REJECTED' AND OLD."approvedAt" IS NULL AND NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"
     AND (to_jsonb(NEW) - 'deletedAt' - 'updatedAt') = (to_jsonb(OLD) - 'deletedAt' - 'updatedAt') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'GrammarRevision % immutable (status %)', OLD."id", OLD."status" USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" = 'IN_REVIEW' AND (
       NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
    OR NEW."contentSchemaVersion" IS DISTINCT FROM OLD."contentSchemaVersion"
    OR NEW."provenance" IS DISTINCT FROM OLD."provenance") THEN
    RAISE EXCEPTION 'IN_REVIEW holatida kontent o''zgarmaydi' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status", NEW."status") IN (
      ('DRAFT', 'IN_REVIEW'),
      ('IN_REVIEW', 'DRAFT'),
      ('IN_REVIEW', 'APPROVED'),
      ('IN_REVIEW', 'CHANGES_REQUESTED'),
      ('IN_REVIEW', 'REJECTED'),
      ('CHANGES_REQUESTED', 'IN_REVIEW'))) THEN
      RAISE EXCEPTION 'Ruxsat etilmagan status o''tishi: % -> %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" = 'APPROVED' AND (NEW."approvedById" IS NULL OR NEW."approvedAt" IS NULL
       OR NEW."approvedHash" IS NULL OR NEW."approvedHash" <> NEW."contentHash") THEN
      RAISE EXCEPTION 'APPROVED uchun approvedById/approvedAt va approvedHash = contentHash majburiy' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" AND OLD."status" NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Faqat DRAFT/CHANGES_REQUESTED revision soft-delete qilinadi' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrammarRevision_guard"
  BEFORE UPDATE OR DELETE ON "GrammarRevision"
  FOR EACH ROW EXECUTE FUNCTION grammar_revision_guard();

-- 2) Append-only jadvallar: UPDATE/DELETE taqiqlangan (TRUNCATE faqat test/bazani tozalash uchun)
CREATE OR REPLACE FUNCTION grammar_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% jadvali append-only (% taqiqlangan)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrammarReviewEvent_append_only" BEFORE UPDATE OR DELETE ON "GrammarReviewEvent" FOR EACH ROW EXECUTE FUNCTION grammar_append_only();
CREATE TRIGGER "GrammarRelease_append_only" BEFORE UPDATE OR DELETE ON "GrammarRelease" FOR EACH ROW EXECUTE FUNCTION grammar_append_only();
CREATE TRIGGER "GrammarReleaseItem_append_only" BEFORE UPDATE OR DELETE ON "GrammarReleaseItem" FOR EACH ROW EXECUTE FUNCTION grammar_append_only();
CREATE TRIGGER "GrammarActivation_append_only" BEFORE UPDATE OR DELETE ON "GrammarActivation" FOR EACH ROW EXECUTE FUNCTION grammar_append_only();
CREATE TRIGGER "GrammarOverlayEvent_append_only" BEFORE UPDATE OR DELETE ON "GrammarOverlayEvent" FOR EACH ROW EXECUTE FUNCTION grammar_append_only();

-- 3) Release elementi faqat APPROVED (o'chirilmagan) revisionni ko'rsatishi mumkin
CREATE OR REPLACE FUNCTION grammar_release_item_guard() RETURNS trigger AS $$
DECLARE rev_status "GrammarRevisionStatus"; rev_deleted TIMESTAMP(3); rev_rule TEXT; rev_lang TEXT;
BEGIN
  SELECT "status", "deletedAt", "ruleId", "explanationLang" INTO rev_status, rev_deleted, rev_rule, rev_lang
    FROM "GrammarRevision" WHERE "id" = NEW."revisionId";
  IF rev_status IS DISTINCT FROM 'APPROVED' OR rev_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Release elementi faqat APPROVED revisionga ishora qila oladi' USING ERRCODE = 'check_violation';
  END IF;
  IF rev_rule <> NEW."ruleId" OR rev_lang <> NEW."explanationLang" THEN
    RAISE EXCEPTION 'Release elementi revision bilan mos emas' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrammarReleaseItem_guard" BEFORE INSERT ON "GrammarReleaseItem" FOR EACH ROW EXECUTE FUNCTION grammar_release_item_guard();

-- 4) Qoida: id/lang o'zgarmaydi, hard-delete yo'q (faqat soft delete); ID hisoblagichi kamaymaydi
CREATE OR REPLACE FUNCTION grammar_rule_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GrammarRule hard-delete taqiqlangan (soft delete ishlating)' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."lang" IS DISTINCT FROM OLD."lang" THEN
    RAISE EXCEPTION 'GrammarRule id/lang o''zgarmaydi' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."state" = 'RETIRED' AND NEW."state" IS DISTINCT FROM 'RETIRED' THEN
    RAISE EXCEPTION 'RETIRED qoida qayta ochilmaydi (ID qayta ishlatilmaydi)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrammarRule_guard" BEFORE UPDATE OR DELETE ON "GrammarRule" FOR EACH ROW EXECUTE FUNCTION grammar_rule_guard();

CREATE OR REPLACE FUNCTION grammar_counter_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."next" < OLD."next" THEN
    RAISE EXCEPTION 'GrammarIdCounter kamaymaydi (ID qayta ishlatilmaydi)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GrammarIdCounter_guard" BEFORE UPDATE ON "GrammarIdCounter" FOR EACH ROW EXECUTE FUNCTION grammar_counter_guard();
