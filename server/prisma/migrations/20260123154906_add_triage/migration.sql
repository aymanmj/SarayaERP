-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('NON_URGENT', 'LESS_URGENT', 'URGENT', 'EMERGENT', 'RESUSCITATION');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "triageLevel" "TriageLevel",
ADD COLUMN     "triageNote" TEXT;

-- CreateTable
CREATE TABLE "TriageAssessment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "level" "TriageLevel" NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "temperature" DECIMAL(4,2),
    "heartRate" INTEGER,
    "respRate" INTEGER,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "o2Sat" INTEGER,
    "painScore" INTEGER,
    "notes" TEXT,
    "assessedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TriageAssessment_hospitalId_encounterId_idx" ON "TriageAssessment"("hospitalId", "encounterId");

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
