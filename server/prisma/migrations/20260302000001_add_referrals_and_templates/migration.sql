-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateTable: Referral
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "referringDoctorId" INTEGER NOT NULL,
    "receivingDoctorId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "clinicalSummary" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ClinicalNoteTemplate
CREATE TABLE "ClinicalNoteTemplate" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "noteType" "NoteType" NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_hospitalId_status_idx" ON "Referral"("hospitalId", "status");
CREATE INDEX "Referral_receivingDoctorId_status_idx" ON "Referral"("receivingDoctorId", "status");
CREATE INDEX "ClinicalNoteTemplate_hospitalId_specialty_idx" ON "ClinicalNoteTemplate"("hospitalId", "specialty");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referringDoctorId_fkey" FOREIGN KEY ("referringDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_receivingDoctorId_fkey" FOREIGN KEY ("receivingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalNoteTemplate" ADD CONSTRAINT "ClinicalNoteTemplate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteTemplate" ADD CONSTRAINT "ClinicalNoteTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
