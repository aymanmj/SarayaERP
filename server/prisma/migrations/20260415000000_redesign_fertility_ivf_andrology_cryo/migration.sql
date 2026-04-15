-- ==========================================
-- Redesign: Fertility, Andrology & Cryo Bank
-- Couple-Centric IVF Architecture
-- ==========================================

-- Step 1: Create new tables FIRST (before modifying FertilityCase)

-- Andrology Visit
CREATE TABLE "AndrologyVisit" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "fertilityCaseId" INTEGER,
    "erectileDisfunc" BOOLEAN NOT NULL DEFAULT false,
    "smokingHabit" TEXT,
    "varicoceleGrade" TEXT,
    "testicularVol" TEXT,
    "fshLevel" DECIMAL(5,2),
    "lhLevel" DECIMAL(5,2),
    "testosterone" DECIMAL(6,2),
    "prolactin" DECIMAL(5,2),
    "diagnosis" TEXT,
    "treatmentPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AndrologyVisit_pkey" PRIMARY KEY ("id")
);

-- Semen Analysis (WHO 6th Edition standard)
CREATE TABLE "SemenAnalysis" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "fertilityCaseId" INTEGER,
    "sampleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abstinenceDays" INTEGER,
    "volumeMl" DECIMAL(4,1),
    "ph" DECIMAL(3,1),
    "viscosity" TEXT,
    "liquefaction" TEXT,
    "countMilPerMl" DECIMAL(8,2),
    "totalCountMil" DECIMAL(8,2),
    "progressivePR" DECIMAL(5,2),
    "nonProgressiveNP" DECIMAL(5,2),
    "immotileIM" DECIMAL(5,2),
    "normalForms" DECIMAL(5,2),
    "vitality" DECIMAL(5,2),
    "wbcCount" DECIMAL(5,2),
    "agglutination" TEXT,
    "conclusion" TEXT,
    "doctorNotes" TEXT,
    CONSTRAINT "SemenAnalysis_pkey" PRIMARY KEY ("id")
);

-- Cryo Tank
CREATE TABLE "CryoTank" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    CONSTRAINT "CryoTank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CryoTank_code_key" ON "CryoTank"("code");

-- Cryo Canister
CREATE TABLE "CryoCanister" (
    "id" SERIAL NOT NULL,
    "tankId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    CONSTRAINT "CryoCanister_pkey" PRIMARY KEY ("id")
);

-- Cryo Item Type & Status enums
CREATE TYPE "CryoItemType" AS ENUM ('SPERM', 'OOCYTES', 'EMBRYO_D3', 'EMBRYO_D5', 'TESTICULAR_TISSUE');
CREATE TYPE "CryoStatus" AS ENUM ('FROZEN', 'THAWED', 'DISCARDED', 'TRANSFERRED_OUT');

-- Sperm Source & Fertilization Method enums
CREATE TYPE "SpermSource" AS ENUM ('EJACULATE', 'TESE', 'PESA', 'FROZEN_SPERM');
CREATE TYPE "FertilizationMethod" AS ENUM ('CONVENTIONAL_IVF', 'ICSI', 'IMSI', 'PICSI');

-- Cryo Item
CREATE TABLE "CryoItem" (
    "id" SERIAL NOT NULL,
    "canisterId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "itemType" "CryoItemType" NOT NULL,
    "freezeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "thawDate" TIMESTAMP(3),
    "status" "CryoStatus" NOT NULL DEFAULT 'FROZEN',
    "caneCode" TEXT,
    "gobletColor" TEXT,
    "visotubeColor" TEXT,
    "strawCount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "ivfCycleId" INTEGER,
    CONSTRAINT "CryoItem_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate FertilityCase to couple-centric

-- Add new columns
ALTER TABLE "FertilityCase" ADD COLUMN "femalePatientId" INTEGER;
ALTER TABLE "FertilityCase" ADD COLUMN "malePatientId" INTEGER;

-- Copy existing patientId to femalePatientId
UPDATE "FertilityCase" SET "femalePatientId" = "patientId";

-- Make femalePatientId NOT NULL
ALTER TABLE "FertilityCase" ALTER COLUMN "femalePatientId" SET NOT NULL;

-- Drop old columns that are now handled by SemenAnalysis
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "patientId";
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "partnerName";
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "partnerAge";
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "spermCount";
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "spermMotility";
ALTER TABLE "FertilityCase" DROP COLUMN IF EXISTS "spermMorphology";

-- Step 3: Update InfertilityType enum (rename BOTH -> COMBINED)
ALTER TYPE "InfertilityType" ADD VALUE IF NOT EXISTS 'COMBINED';

-- Step 4: Update IVFCycle with lab-quality fields
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "eggsMatureMII" INTEGER;
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "eggsMI" INTEGER;
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "eggsGV" INTEGER;
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "spermSource" "SpermSource" DEFAULT 'EJACULATE';
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "fertilizationMethod" "FertilizationMethod" DEFAULT 'ICSI';
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "eggsInjected" INTEGER;
ALTER TABLE "IVFCycle" ADD COLUMN IF NOT EXISTS "eggsFertilized2PN" INTEGER;

-- Drop old columns from IVFCycle that were renamed
ALTER TABLE "IVFCycle" DROP COLUMN IF EXISTS "eggsMature";
ALTER TABLE "IVFCycle" DROP COLUMN IF EXISTS "eggsFertilized";
ALTER TABLE "IVFCycle" DROP COLUMN IF EXISTS "stimulationDays";

-- Step 5: Update EmbryoRecord (remove freeze/thaw fields - now in CryoItem)
ALTER TABLE "EmbryoRecord" DROP COLUMN IF EXISTS "cellCount";
ALTER TABLE "EmbryoRecord" DROP COLUMN IF EXISTS "freezeDate";
ALTER TABLE "EmbryoRecord" DROP COLUMN IF EXISTS "thawDate";

-- Add ARRESTED to EmbryoStatus enum
ALTER TYPE "EmbryoStatus" ADD VALUE IF NOT EXISTS 'ARRESTED';

-- Remove DONATED from EmbryoStatus if not needed (can't remove enum values in PG, just leave it)

-- Step 6: Foreign Keys

-- AndrologyVisit
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AndrologyVisit" ADD CONSTRAINT "AndrologyVisit_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "AndrologyVisit_encounterId_key" ON "AndrologyVisit"("encounterId");

-- SemenAnalysis
ALTER TABLE "SemenAnalysis" ADD CONSTRAINT "SemenAnalysis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SemenAnalysis" ADD CONSTRAINT "SemenAnalysis_fertilityCaseId_fkey" FOREIGN KEY ("fertilityCaseId") REFERENCES "FertilityCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CryoTank
ALTER TABLE "CryoTank" ADD CONSTRAINT "CryoTank_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CryoCanister
ALTER TABLE "CryoCanister" ADD CONSTRAINT "CryoCanister_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "CryoTank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CryoItem
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_canisterId_fkey" FOREIGN KEY ("canisterId") REFERENCES "CryoCanister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CryoItem" ADD CONSTRAINT "CryoItem_ivfCycleId_fkey" FOREIGN KEY ("ivfCycleId") REFERENCES "IVFCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FertilityCase new FKs
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_femalePatientId_fkey" FOREIGN KEY ("femalePatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FertilityCase" ADD CONSTRAINT "FertilityCase_malePatientId_fkey" FOREIGN KEY ("malePatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old FK (patientId was removed)
ALTER TABLE "FertilityCase" DROP CONSTRAINT IF EXISTS "FertilityCase_patientId_fkey";
