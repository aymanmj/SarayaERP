CREATE TYPE "NursingNotificationKind" AS ENUM ('medication', 'vital');

CREATE TABLE "NursingNotification" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "kind" "NursingNotificationKind" NOT NULL,
    "recordId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NursingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NursingNotification_hospitalId_kind_recordId_key" ON "NursingNotification"("hospitalId", "kind", "recordId");
CREATE INDEX "NursingNotification_hospitalId_id_idx" ON "NursingNotification"("hospitalId", "id");
CREATE INDEX "NursingNotification_createdAt_idx" ON "NursingNotification"("createdAt");
CREATE INDEX "NursingNotification_encounterId_idx" ON "NursingNotification"("encounterId");

ALTER TABLE "NursingNotification" ADD CONSTRAINT "NursingNotification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NursingNotification" ADD CONSTRAINT "NursingNotification_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
