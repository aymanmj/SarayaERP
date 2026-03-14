-- ==============================================================
-- Idempotent Migration: Safe to run on databases where some
-- objects may already exist (e.g. applied via db push).
-- ==============================================================

-- CreateEnum (idempotent via DO blocks)
DO $$ BEGIN CREATE TYPE "BabyStatus" AS ENUM ('ALIVE', 'STILLBORN', 'NICU'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PregnancyRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PregnancyStatus" AS ENUM ('ACTIVE', 'DELIVERED', 'MISCARRIAGE', 'ECTOPIC', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "InfertilityType" AS ENUM ('MALE_FACTOR', 'FEMALE_FACTOR', 'BOTH', 'UNEXPLAINED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CycleType" AS ENUM ('IVF', 'ICSI', 'IUI', 'FET', 'EGG_FREEZING', 'NATURAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FertilityCaseStatus" AS ENUM ('ACTIVE', 'SUCCESSFUL', 'DISCONTINUED', 'REFERRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PregnancyResult" AS ENUM ('PENDING', 'POSITIVE', 'NEGATIVE', 'BIOCHEMICAL', 'ECTOPIC', 'MISCARRIAGE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "EmbryoStatus" AS ENUM ('DEVELOPING', 'TRANSFERRED', 'FROZEN', 'THAWED', 'DISCARDED', 'DONATED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SystemSettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AdmissionType" AS ENUM ('EMERGENCY', 'URGENT', 'ELECTIVE', 'TRANSFER', 'OBSERVATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AdmissionStatus" AS ENUM ('SCHEDULED', 'ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING', 'DISCHARGED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AdmissionPriority" AS ENUM ('CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DischargeDisposition" AS ENUM ('HOME', 'TRANSFER_TO_ANOTHER_FACILITY', 'REHABILITATION', 'LONG_TERM_CARE', 'HOME_HEALTH_CARE', 'HOSPICE', 'LEFT_AGAINST_MEDICAL_ADVICE', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "IsolationType" AS ENUM ('NONE', 'STANDARD', 'DROPLET', 'AIRBORNE', 'CONTACT', 'PROTECTIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TransferOrderStatus" AS ENUM ('REQUESTED', 'BED_ALLOCATED', 'HANDOVER_DRAFTED', 'HANDOVER_SIGNED', 'TRANSFERRED', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterEnum (IF NOT EXISTS supported in PG 9.3+)
ALTER TYPE "AccountingSourceModule" ADD VALUE IF NOT EXISTS 'JOURNAL_REVERSAL';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CALLED';
ALTER TYPE "BedStatus" ADD VALUE IF NOT EXISTS 'NEEDS_CLEANING';
ALTER TYPE "EncounterType" ADD VALUE IF NOT EXISTS 'ICU';
ALTER TYPE "EncounterType" ADD VALUE IF NOT EXISTS 'NICU';
ALTER TYPE "EncounterType" ADD VALUE IF NOT EXISTS 'PICU';

-- AlterTable: BabyProfile
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "apgarScore10" INTEGER;
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "bcgVaccineGiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "headCircumference" DECIMAL(5,1);
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "length" DECIMAL(5,1);
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "status" "BabyStatus" NOT NULL DEFAULT 'ALIVE';
ALTER TABLE "BabyProfile" ADD COLUMN IF NOT EXISTS "vitaminKGiven" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: DiagnosisCode
ALTER TABLE "DiagnosisCode" ADD COLUMN IF NOT EXISTS "icd10Code" TEXT;

-- AlterTable: MedicationAdministration
ALTER TABLE "MedicationAdministration" ADD COLUMN IF NOT EXISTS "infusionRate" DECIMAL(10,2);
ALTER TABLE "MedicationAdministration" ADD COLUMN IF NOT EXISTS "titrationLog" JSONB;

-- AlterTable: Patient
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "guarantorId" INTEGER;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "motherId" INTEGER;

-- AlterTable: Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rxNormCode" TEXT;

-- AlterTable: RefreshToken
DO $$ BEGIN
  ALTER TABLE "RefreshToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- CreateTable: AntenatalCare
CREATE TABLE IF NOT EXISTS "AntenatalCare" (
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

-- CreateTable: AntenatalVisit
CREATE TABLE IF NOT EXISTS "AntenatalVisit" (
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

-- CreateTable: FertilityCase
CREATE TABLE IF NOT EXISTS "FertilityCase" (
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

-- CreateTable: IVFCycle
CREATE TABLE IF NOT EXISTS "IVFCycle" (
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

-- CreateTable: EmbryoRecord
CREATE TABLE IF NOT EXISTS "EmbryoRecord" (
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

-- CreateTable: FertilityMedication
CREATE TABLE IF NOT EXISTS "FertilityMedication" (
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

-- CreateTable: SystemSetting
CREATE TABLE IF NOT EXISTS "SystemSetting" (
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

-- CreateTable: admissions
CREATE TABLE IF NOT EXISTS "admissions" (
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

-- CreateTable: admission_notes
CREATE TABLE IF NOT EXISTS "admission_notes" (
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

-- CreateTable: discharge_planning
CREATE TABLE IF NOT EXISTS "discharge_planning" (
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

-- CreateTable: bed_transfers
CREATE TABLE IF NOT EXISTS "bed_transfers" (
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

-- CreateTable: UserDevice
CREATE TABLE IF NOT EXISTS "UserDevice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TransferOrder
CREATE TABLE IF NOT EXISTS "TransferOrder" (
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

-- CreateTable: HandoverNote
CREATE TABLE IF NOT EXISTS "HandoverNote" (
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

-- CreateTable: ICUFlowsheet
CREATE TABLE IF NOT EXISTS "ICUFlowsheet" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "shiftDate" DATE NOT NULL,
    "shiftName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ICUFlowsheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ICUFlowsheetEntry
CREATE TABLE IF NOT EXISTS "ICUFlowsheetEntry" (
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

-- CreateTable: VentilatorLog
CREATE TABLE IF NOT EXISTS "VentilatorLog" (
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

-- CreateIndex (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "SystemSetting_hospitalId_group_idx" ON "SystemSetting"("hospitalId", "group");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_hospitalId_key_key" ON "SystemSetting"("hospitalId", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "admissions_encounterId_key" ON "admissions"("encounterId");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_admissionStatus_idx" ON "admissions"("hospitalId", "admissionStatus");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_patientId_idx" ON "admissions"("hospitalId", "patientId");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_actualAdmissionDate_idx" ON "admissions"("hospitalId", "actualAdmissionDate");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_dischargeDate_idx" ON "admissions"("hospitalId", "dischargeDate");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_wardId_idx" ON "admissions"("hospitalId", "wardId");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_departmentId_idx" ON "admissions"("hospitalId", "departmentId");
CREATE INDEX IF NOT EXISTS "admissions_hospitalId_admittingDoctorId_idx" ON "admissions"("hospitalId", "admittingDoctorId");
CREATE INDEX IF NOT EXISTS "admission_notes_admissionId_type_idx" ON "admission_notes"("admissionId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "discharge_planning_admissionId_key" ON "discharge_planning"("admissionId");
CREATE INDEX IF NOT EXISTS "bed_transfers_admissionId_status_idx" ON "bed_transfers"("admissionId", "status");
CREATE INDEX IF NOT EXISTS "bed_transfers_hospitalId_status_idx" ON "bed_transfers"("hospitalId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "UserDevice_token_key" ON "UserDevice"("token");
CREATE INDEX IF NOT EXISTS "UserDevice_userId_idx" ON "UserDevice"("userId");
CREATE INDEX IF NOT EXISTS "TransferOrder_hospitalId_status_idx" ON "TransferOrder"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "TransferOrder_encounterId_idx" ON "TransferOrder"("encounterId");
CREATE UNIQUE INDEX IF NOT EXISTS "HandoverNote_transferOrderId_key" ON "HandoverNote"("transferOrderId");
CREATE INDEX IF NOT EXISTS "ICUFlowsheet_hospitalId_idx" ON "ICUFlowsheet"("hospitalId");
CREATE UNIQUE INDEX IF NOT EXISTS "ICUFlowsheet_encounterId_shiftDate_shiftName_key" ON "ICUFlowsheet"("encounterId", "shiftDate", "shiftName");
CREATE UNIQUE INDEX IF NOT EXISTS "VentilatorLog_entryId_key" ON "VentilatorLog"("entryId");
CREATE INDEX IF NOT EXISTS "DiagnosisCode_icd10Code_idx" ON "DiagnosisCode"("icd10Code");
CREATE INDEX IF NOT EXISTS "Encounter_hospitalId_type_status_idx" ON "Encounter"("hospitalId", "type", "status");
CREATE INDEX IF NOT EXISTS "Encounter_patientId_idx" ON "Encounter"("patientId");
CREATE INDEX IF NOT EXISTS "LabOrder_resultStatus_idx" ON "LabOrder"("resultStatus");
CREATE INDEX IF NOT EXISTS "LabOrder_orderId_idx" ON "LabOrder"("orderId");
CREATE INDEX IF NOT EXISTS "Prescription_hospitalId_status_idx" ON "Prescription"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "Prescription_patientId_idx" ON "Prescription"("patientId");
CREATE INDEX IF NOT EXISTS "Product_rxNormCode_idx" ON "Product"("rxNormCode");

-- AddForeignKey (idempotent: check if constraint exists before adding)
DO $$ BEGIN ALTER TABLE "Patient" ADD CONSTRAINT "Patient_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Patient" ADD CONSTRAINT "Patient_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AntenatalCare" ADD CONSTRAINT "AntenatalCare_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "AntenatalVisit" ADD CONSTRAINT "AntenatalVisit_antenatalCareId_fkey" FOREIGN KEY ("antenatalCareId") REFERENCES "AntenatalCare"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "IVFCycle" ADD CONSTRAINT "IVFCycle_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "EmbryoRecord" ADD CONSTRAINT "EmbryoRecord_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "FertilityMedication" ADD CONSTRAINT "FertilityMedication_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_admittingDoctorId_fkey" FOREIGN KEY ("admittingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_primaryPhysicianId_fkey" FOREIGN KEY ("primaryPhysicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_referringDoctorId_fkey" FOREIGN KEY ("referringDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_attendingNurseId_fkey" FOREIGN KEY ("attendingNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admissions" ADD CONSTRAINT "admissions_previousAdmissionId_fkey" FOREIGN KEY ("previousAdmissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "admission_notes" ADD CONSTRAINT "admission_notes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_caseManagerId_fkey" FOREIGN KEY ("caseManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_socialWorkerId_fkey" FOREIGN KEY ("socialWorkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_followUpDoctorId_fkey" FOREIGN KEY ("followUpDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "discharge_planning" ADD CONSTRAINT "discharge_planning_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_transferOrderId_fkey" FOREIGN KEY ("transferOrderId") REFERENCES "TransferOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "HandoverNote" ADD CONSTRAINT "HandoverNote_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ICUFlowsheet" ADD CONSTRAINT "ICUFlowsheet_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_flowsheetId_fkey" FOREIGN KEY ("flowsheetId") REFERENCES "ICUFlowsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ICUFlowsheetEntry" ADD CONSTRAINT "ICUFlowsheetEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "VentilatorLog" ADD CONSTRAINT "VentilatorLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ICUFlowsheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
- -   A l t e r T a b l e 
 A L T E R   T A B L E   " a d m i s s i o n s "   A D D   C O L U M N   I F   N O T   E X I S T S   " f i n a n c i a l C l e a r a n c e "   B O O L E A N   N O T   N U L L   D E F A U L T   f a l s e ; 
 A L T E R   T A B L E   " a d m i s s i o n s "   A D D   C O L U M N   I F   N O T   E X I S T S   " m e d i c a l C l e a r a n c e "   B O O L E A N   N O T   N U L L   D E F A U L T   f a l s e ;  
 