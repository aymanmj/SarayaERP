-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('PATIENT_TO_DOCTOR', 'DOCTOR_TO_PATIENT', 'SYSTEM_NOTIFICATION');

-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'DISPENSED');

-- CreateTable
CREATE TABLE "PatientMessage" (
    "id" SERIAL NOT NULL,
    "threadId" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "hospitalId" INTEGER NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationRefillRequest" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "status" "RefillStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationRefillRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientMessage_patientId_createdAt_idx" ON "PatientMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientMessage_doctorId_isRead_idx" ON "PatientMessage"("doctorId", "isRead");

-- CreateIndex
CREATE INDEX "PatientMessage_threadId_idx" ON "PatientMessage"("threadId");

-- CreateIndex
CREATE INDEX "MedicationRefillRequest_patientId_status_idx" ON "MedicationRefillRequest"("patientId", "status");

-- CreateIndex
CREATE INDEX "MedicationRefillRequest_hospitalId_status_idx" ON "MedicationRefillRequest"("hospitalId", "status");

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMessage" ADD CONSTRAINT "PatientMessage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRefillRequest" ADD CONSTRAINT "MedicationRefillRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
