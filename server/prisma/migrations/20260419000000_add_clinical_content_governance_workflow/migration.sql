DO $$
BEGIN
  CREATE TYPE "ClinicalContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ClinicalContentEventType" AS ENUM (
    'CREATED',
    'UPDATED',
    'VERSION_CLONED',
    'SUBMITTED_FOR_REVIEW',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
    'RETIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrderSet"
  ADD COLUMN IF NOT EXISTS "contentKey" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "status" "ClinicalContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "previousVersionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "submittedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retiredById" INTEGER,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "changeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseNotes" TEXT;

UPDATE "OrderSet"
SET
  "contentKey" = COALESCE("contentKey", 'os-' || "id"::TEXT),
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "contentKey" IS NULL OR "status" <> 'PUBLISHED';

ALTER TABLE "OrderSet"
  ALTER COLUMN "contentKey" SET NOT NULL;

ALTER TABLE "ClinicalPathway"
  ADD COLUMN IF NOT EXISTS "contentKey" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "ClinicalContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "previousVersionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "submittedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retiredById" INTEGER,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "changeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseNotes" TEXT;

UPDATE "ClinicalPathway"
SET
  "contentKey" = COALESCE("contentKey", 'cp-' || "id"::TEXT),
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "contentKey" IS NULL OR "status" <> 'PUBLISHED';

ALTER TABLE "ClinicalPathway"
  ALTER COLUMN "contentKey" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "OrderSetReviewEvent" (
  "id" SERIAL PRIMARY KEY,
  "orderSetId" INTEGER NOT NULL,
  "eventType" "ClinicalContentEventType" NOT NULL,
  "actorId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ClinicalPathwayReviewEvent" (
  "id" SERIAL PRIMARY KEY,
  "pathwayId" INTEGER NOT NULL,
  "eventType" "ClinicalContentEventType" NOT NULL,
  "actorId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "OrderSet"
  DROP CONSTRAINT IF EXISTS "OrderSet_hospitalId_name_key";

ALTER TABLE "ClinicalPathway"
  DROP CONSTRAINT IF EXISTS "ClinicalPathway_hospitalId_name_version_key";

ALTER TABLE "OrderSet"
  ADD CONSTRAINT "OrderSet_hospitalId_contentKey_version_key" UNIQUE ("hospitalId", "contentKey", "version");

ALTER TABLE "ClinicalPathway"
  ADD CONSTRAINT "ClinicalPathway_hospitalId_contentKey_version_key" UNIQUE ("hospitalId", "contentKey", "version");

CREATE INDEX IF NOT EXISTS "OrderSet_hospitalId_status_idx" ON "OrderSet"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "OrderSet_hospitalId_contentKey_idx" ON "OrderSet"("hospitalId", "contentKey");
CREATE INDEX IF NOT EXISTS "ClinicalPathway_hospitalId_status_idx" ON "ClinicalPathway"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "ClinicalPathway_hospitalId_contentKey_idx" ON "ClinicalPathway"("hospitalId", "contentKey");
CREATE INDEX IF NOT EXISTS "OrderSetReviewEvent_orderSetId_createdAt_idx" ON "OrderSetReviewEvent"("orderSetId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClinicalPathwayReviewEvent_pathwayId_createdAt_idx" ON "ClinicalPathwayReviewEvent"("pathwayId", "createdAt");

ALTER TABLE "OrderSet"
  ADD CONSTRAINT "OrderSet_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "OrderSet"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderSet_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderSet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderSet_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderSet_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalPathway"
  ADD CONSTRAINT "ClinicalPathway_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "ClinicalPathway"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ClinicalPathway_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ClinicalPathway_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ClinicalPathway_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ClinicalPathway_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderSetReviewEvent"
  ADD CONSTRAINT "OrderSetReviewEvent_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "OrderSet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderSetReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalPathwayReviewEvent"
  ADD CONSTRAINT "ClinicalPathwayReviewEvent_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClinicalPathwayReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
