-- CreateEnum
CREATE TYPE "BabyStatus" AS ENUM ('ALIVE', 'STILLBORN', 'NICU');

-- CreateEnum
CREATE TYPE "PregnancyRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('ACTIVE', 'DELIVERED', 'MISCARRIAGE', 'ECTOPIC', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InfertilityType" AS ENUM ('MALE_FACTOR', 'FEMALE_FACTOR', 'BOTH', 'UNEXPLAINED');

-- CreateEnum
CREATE TYPE "CycleType" AS ENUM ('IVF', 'ICSI', 'IUI', 'FET', 'EGG_FREEZING', 'NATURAL');

-- CreateEnum
CREATE TYPE "FertilityCaseStatus" AS ENUM ('ACTIVE', 'SUCCESSFUL', 'DISCONTINUED', 'REFERRED');

-- CreateEnum
CREATE TYPE "PregnancyResult" AS ENUM ('PENDING', 'POSITIVE', 'NEGATIVE', 'BIOCHEMICAL', 'ECTOPIC', 'MISCARRIAGE');

-- CreateEnum
CREATE TYPE "EmbryoStatus" AS ENUM ('DEVELOPING', 'TRANSFERRED', 'FROZEN', 'THAWED', 'DISCARDED', 'DONATED');

-- CreateEnum
CREATE TYPE "SystemSettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "AdmissionType" AS ENUM ('EMERGENCY', 'URGENT', 'ELECTIVE', 'TRANSFER', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('SCHEDULED', 'ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING', 'DISCHARGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdmissionPriority" AS ENUM ('CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DischargeDisposition" AS ENUM ('HOME', 'TRANSFER_TO_ANOTHER_FACILITY', 'REHABILITATION', 'LONG_TERM_CARE', 'HOME_HEALTH_CARE', 'HOSPICE', 'LEFT_AGAINST_MEDICAL_ADVICE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IsolationType" AS ENUM ('NONE', 'STANDARD', 'DROPLET', 'AIRBORNE', 'CONTACT', 'PROTECTIVE');

-- CreateEnum
CREATE TYPE "TransferOrderStatus" AS ENUM ('REQUESTED', 'BED_ALLOCATED', 'HANDOVER_DRAFTED', 'HANDOVER_SIGNED', 'TRANSFERRED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AccountingSourceModule" ADD VALUE 'JOURNAL_REVERSAL';

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'CALLED';

-- AlterEnum
ALTER TYPE "BedStatus" ADD VALUE 'NEEDS_CLEANING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EncounterType" ADD VALUE 'ICU';
ALTER TYPE "EncounterType" ADD VALUE 'NICU';
ALTER TYPE "EncounterType" ADD VALUE 'PICU';

-- AlterTable
ALTER TABLE "BabyProfile" ADD COLUMN     "apgarScore10" INTEGER,
ADD COLUMN     "bcgVaccineGiven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "headCircumference" DECIMAL(5,1),
ADD COLUMN     "length" DECIMAL(5,1),
ADD COLUMN     "status" "BabyStatus" NOT NULL DEFAULT 'ALIVE',
ADD COLUMN     "vitaminKGiven" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DiagnosisCode" ADD COLUMN     "icd10Code" TEXT;

-- AlterTable
ALTER TABLE "MedicationAdministration" ADD COLUMN     "infusionRate" DECIMAL(10,2),
ADD COLUMN     "titrationLog" JSONB;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "guarantorId" INTEGER,
ADD COLUMN     "motherId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "rxNormCode" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "AntenatalCare" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "lmpDate" TIMESTAMP(3) NOT NULL,
    "eddDate" TIMESTAMP(3) NOT NULL,
    "gravida" INTEGER NOT NULL DEFAULT 1,
    "para" INTEGER NOT NULL DEFAULT 0,
    "bloodGroup" TEXT,
    "rhFactor" TEXT,
    "partnerRhFactor" TEXT,
    "rhIncompatible" BOOLEAN NOT NULL DEFAULT false,
    "antiDWeek28Given" BOOLEAN NOT NULL DEFAULT false,
    "antiDPostpartumGiven" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" "PregnancyRisk" NOT NULL DEFAULT 'LOW',
    "riskFactors" TEXT,
    "status" "PregnancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntenatalCare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntenatalVisit" (
    "id" SERIAL NOT NULL,
    "antenatalCareId" INTEGER NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gestationalWeek" INTEGER,
    "weight" DECIMAL(5,1),
    "bloodPressureSys" INTEGER,
    "bloodPressureDia" INTEGER,
    "fundalHeight" DECIMAL(5,1),
    "fetalHeartRate" INTEGER,
    "fetalMovement" BOOLEAN,
    "presentation" TEXT,
    "edema" BOOLEAN NOT NULL DEFAULT false,
    "urineProtein" TEXT,
    "urineGlucose" TEXT,
    "hemoglobin" DECIMAL(4,1),
    "complaints" TEXT,
    "notes" TEXT,
    "nextVisitDate" TIMESTAMP(3),

    CONSTRAINT "AntenatalVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilityCase" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "partnerName" TEXT,
    "partnerAge" INTEGER,
    "infertilityType" "InfertilityType" NOT NULL DEFAULT 'UNEXPLAINED',
    "diagnosis" TEXT,
    "durationYears" INTEGER,
    "previousTreatments" TEXT,
    "amhLevel" DECIMAL(5,2),
    "fshLevel" DECIMAL(5,2),
    "lhLevel" DECIMAL(5,2),
    "spermCount" DECIMAL(8,2),
    "spermMotility" DECIMAL(5,2),
    "spermMorphology" DECIMAL(5,2),
    "status" "FertilityCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FertilityCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IVFCycle" (
    "id" SERIAL NOT NULL,
    "fertilityCaseId" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "cycleType" "CycleType" NOT NULL DEFAULT 'IVF',
    "protocol" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "stimulationDays" INTEGER,
    "eggRetrievalDate" TIMESTAMP(3),
    "eggsRetrieved" INTEGER,
    "eggsMature" INTEGER,
    "eggsFertilized" INTEGER,
    "embryosDay3" INTEGER,
    "embryosDay5" INTEGER,
    "transferDate" TIMESTAMP(3),
    "embryosTransferred" INTEGER,
    "embryosFrozen" INTEGER,
    "endometrialThickness" DECIMAL(4,1),
    "betaHCGDate" TIMESTAMP(3),
    "betaHCGResult" DECIMAL(8,2),
    "pregnancyResult" "PregnancyResult" NOT NULL DEFAULT 'PENDING',
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IVFCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbryoRecord" (
    "id" SERIAL NOT NULL,
    "ivfCycleId" INTEGER NOT NULL,
    "embryoNumber" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "grade" TEXT,
    "cellCount" INTEGER,
    "fragmentation" TEXT,
    "status" "EmbryoStatus" NOT NULL DEFAULT 'DEVELOPING',
    "freezeDate" TIMESTAMP(3),
    "thawDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbryoRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FertilityMedication" (
    "id" SERIAL NOT NULL,
    "ivfCycleId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FertilityMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "group" TEXT,
    "type" "SystemSettingType" NOT NULL DEFAULT 'STRING',
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "admissionType" "AdmissionType" NOT NULL,
    "admissionStatus" "AdmissionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priority" "AdmissionPriority" NOT NULL,
    "scheduledAdmissionDate" TIMESTAMP(3),
    "actualAdmissionDate" TIMESTAMP(3) NOT NULL,
    "dischargeDate" TIMESTAMP(3),
    "expectedDischargeDate" TIMESTAMP(3),
    "medicalClearance" BOOLEAN NOT NULL DEFAULT false,
    "financialClearance" BOOLEAN NOT NULL DEFAULT false,
    "bedId" INTEGER,
    "roomId" INTEGER,
    "wardId" INTEGER,
    "departmentId" INTEGER,
    "admittingDoctorId" INTEGER NOT NULL,
    "primaryPhysicianId" INTEGER NOT NULL,
    "referringDoctorId" INTEGER,
    "attendingNurseId" INTEGER,
    "insuranceProviderId" TEXT,
    "insurancePolicyId" TEXT,
    "preAuthNumber" TEXT,
    "insuranceStatus" TEXT,
    "admissionReason" TEXT NOT NULL,
    "primaryDiagnosis" TEXT,
    "secondaryDiagnoses" JSONB,
    "procedures" JSONB,
    "medications" JSONB,
    "allergies" JSONB,
    "specialInstructions" TEXT,
    "fallRisk" TEXT,
    "pressureUlcerRisk" TEXT,
    "nutritionRisk" TEXT,
    "infectionRisk" TEXT,
    "isolationRequired" BOOLEAN NOT NULL DEFAULT false,
    "isolationType" "IsolationType" NOT NULL DEFAULT 'NONE',
    "isolationStartDate" TIMESTAMP(3),
    "isolationEndDate" TIMESTAMP(3),
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContact" JSONB,
    "emergencyNotes" TEXT,
    "isReadmission" BOOLEAN NOT NULL DEFAULT false,
    "previousAdmissionId" INTEGER,
    "readmissionReason" TEXT,
    "readmissionWithin30Days" BOOLEAN NOT NULL DEFAULT false,
    "dischargeDisposition" "DischargeDisposition",
    "dischargeInstructions" JSONB,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpInstructions" JSONB,
    "estimatedCost" DECIMAL(65,30),
    "actualCost" DECIMAL(65,30),
    "paymentStatus" TEXT,
    "billingStatus" TEXT,
    "lengthOfStay" INTEGER,
    "complicationFlag" BOOLEAN NOT NULL DEFAULT false,
    "complicationDetails" JSONB,
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_notes" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharge_planning" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "plannedDischargeDate" TIMESTAMP(3) NOT NULL,
    "dischargePlanningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medicalStability" BOOLEAN NOT NULL DEFAULT false,
    "vitalsStable" BOOLEAN NOT NULL DEFAULT false,
    "painControlled" BOOLEAN NOT NULL DEFAULT false,
    "medicationsReady" BOOLEAN NOT NULL DEFAULT false,
    "educationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dischargeDisposition" "DischargeDisposition" NOT NULL,
    "destinationFacility" TEXT,
    "homeHealthRequired" BOOLEAN NOT NULL DEFAULT false,
    "equipmentNeeded" JSONB,
    "homeModifications" JSONB,
    "followUpAppointment" TIMESTAMP(3),
    "followUpDoctorId" INTEGER,
    "followUpInstructions" TEXT,
    "caseManagerId" INTEGER,
    "socialWorkerId" INTEGER,
    "familyNotified" BOOLEAN NOT NULL DEFAULT false,
    "familyInstructions" JSONB,
    "insuranceApproval" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DECIMAL(65,30),
    "paymentArrangements" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "completedDate" TIMESTAMP(3),
    "barriers" JSONB,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discharge_planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_transfers" (
    "id" SERIAL NOT NULL,
    "admissionId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "fromBedId" INTEGER NOT NULL,
    "fromRoomId" INTEGER NOT NULL,
    "fromWardId" INTEGER NOT NULL,
    "toBedId" INTEGER NOT NULL,
    "toRoomId" INTEGER NOT NULL,
    "toWardId" INTEGER NOT NULL,
    "transferReason" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "requestedBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "completedBy" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bed_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOrder" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "fromBedId" INTEGER,
    "toBedId" INTEGER,
    "status" "TransferOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" INTEGER NOT NULL,
    "allocatedById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "TransferOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverNote" (
    "id" SERIAL NOT NULL,
    "transferOrderId" INTEGER NOT NULL,
    "situation" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "draftedById" INTEGER,
    "signedById" INTEGER,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "HandoverNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUFlowsheet" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "shiftDate" DATE NOT NULL,
    "shiftName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ICUFlowsheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICUFlowsheetEntry" (
    "id" SERIAL NOT NULL,
    "flowsheetId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" INTEGER NOT NULL,
    "heartRate" INTEGER,
    "respRate" INTEGER,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "meanArterialBp" INTEGER,
    "temperature" DECIMAL(4,2),
    "o2Sat" INTEGER,
    "intakeType" TEXT,
    "intakeAmount" DECIMAL(10,2),
    "outputType" TEXT,
    "outputAmount" DECIMAL(10,2),
    "gcsScore" INTEGER,
    "apgarScore" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ICUFlowsheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentilatorLog" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "fio2" DECIMAL(5,2),
    "peep" DECIMAL(5,2),
    "pip" DECIMAL(5,2),
    "tidalVolume" INTEGER,
    "respRateSet" INTEGER,
    "respRateActual" INTEGER,

    CONSTRAINT "VentilatorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemSetting_hospitalId_group_idx" ON "SystemSetting"("hospitalId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_hospitalId_key_key" ON "SystemSetting"("hospitalId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_encounterId_key" ON "admissions"("encounterId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_admissionStatus_idx" ON "admissions"("hospitalId", "admissionStatus");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_patientId_idx" ON "admissions"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_actualAdmissionDate_idx" ON "admissions"("hospitalId", "actualAdmissionDate");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_dischargeDate_idx" ON "admissions"("hospitalId", "dischargeDate");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_wardId_idx" ON "admissions"("hospitalId", "wardId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_departmentId_idx" ON "admissions"("hospitalId", "departmentId");

-- CreateIndex
CREATE INDEX "admissions_hospitalId_admittingDoctorId_idx" ON "admissions"("hospitalId", "admittingDoctorId");

-- CreateIndex
CREATE INDEX "admission_notes_admissionId_type_idx" ON "admission_notes"("admissionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_planning_admissionId_key" ON "discharge_planning"("admissionId");

-- CreateIndex
CREATE INDEX "bed_transfers_admissionId_status_idx" ON "bed_transfers"("admissionId", "status");

-- CreateIndex
CREATE INDEX "bed_transfers_hospitalId_status_idx" ON "bed_transfers"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_token_key" ON "UserDevice"("token");

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "UserDevice"("userId");

-- CreateIndex
CREATE INDEX "TransferOrder_hospitalId_status_idx" ON "TransferOrder"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "TransferOrder_encounterId_idx" ON "TransferOrder"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverNote_transferOrderId_key" ON "HandoverNote"("transferOrderId");

-- CreateIndex
CREATE INDEX "ICUFlowsheet_hospitalId_idx" ON "ICUFlowsheet"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "ICUFlowsheet_encounterId_shiftDate_shiftName_key" ON "ICUFlowsheet"("encounterId", "shiftDate", "shiftName");

-- CreateIndex
CREATE UNIQUE INDEX "VentilatorLog_entryId_key" ON "VentilatorLog"("entryId");

-- CreateIndex
CREATE INDEX "DiagnosisCode_icd10Code_idx" ON "DiagnosisCode"("icd10Code");

-- CreateIndex
CREATE INDEX "Encounter_hospitalId_type_status_idx" ON "Encounter"("hospitalId", "type", "status");

-- CreateIndex
CREATE INDEX "Encounter_patientId_idx" ON "Encounter"("patientId");

-- CreateIndex
CREATE INDEX "LabOrder_resultStatus_idx" ON "LabOrder"("resultStatus");

-- CreateIndex
CREATE INDEX "LabOrder_orderId_idx" ON "LabOrder"("orderId");

-- CreateIndex
CREATE INDEX "Prescription_hospitalId_status_idx" ON "Prescription"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Product_rxNormCode_idx" ON "Product"("rxNormCode");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntenatalVisit" ADD CONSTRAINT "AntenatalVisit_antenatalCareId_fkey" FOREIGN KEY ("antenatalCareId") REFERENCES "AntenatalCare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IVFCycle" ADD CONSTRAINT "IVFCycle_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbryoRecord" ADD CONSTRAINT "EmbryoRecord_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FertilityMedication" ADD CONSTRAINT "FertilityMedication_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_admittingDoctorId_fkey" FOREIGN KEY ("admittingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_primaryPhysicianId_fkey" FOREIGN KEY ("primaryPhysicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_referringDoctorId_fkey" FOREIGN KEY ("referringDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_attendingNurseId_fkey" FOREIGN KEY ("attendingNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_previousAdmissionId_fkey" FOREIGN KEY ("previousAdmissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_caseManagerId_fkey" FOREIGN KEY ("caseManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_socialWorkerId_fkey" FOREIGN KEY ("socialWorkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_followUpDoctorId_fkey" FOREIGN KEY ("followUpDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_transferOrderId_fkey" FOREIGN KEY ("transferOrderId") REFERENCES "TransferOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_flowsheetId_fkey" FOREIGN KEY ("flowsheetId") REFERENCES "ICUFlowsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentilatorLog" ADD CONSTRAINT "VentilatorLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ICUFlowsheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

