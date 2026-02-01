/*
  Warnings:

  - You are about to drop the column `hashedRefreshToken` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phoneHash]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailHash]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mrnHash]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CDSSAlertType" AS ENUM ('DRUG_INTERACTION', 'DRUG_ALLERGY', 'DUPLICATE_THERAPY', 'DOSAGE_WARNING', 'LAB_CRITICAL', 'VITAL_CRITICAL', 'AGE_CONTRAINDICATION', 'RENAL_DOSE_ADJUST', 'PREGNANCY_RISK', 'DRUG_DISEASE');

-- CreateEnum
CREATE TYPE "CDSSAlertSeverity" AS ENUM ('INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CDSSAlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'OVERRIDDEN', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DrugInteractionSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'CONTRAINDICATED');

-- CreateEnum
CREATE TYPE "JobRank" AS ENUM ('CONSULTANT', 'SPECIALIST', 'RESIDENT', 'GENERAL_PRACTITIONER');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryCountType" AS ENUM ('FULL', 'QUARTERLY', 'SPOT_CHECK');

-- CreateEnum
CREATE TYPE "CarePlanType" AS ENUM ('MEDICATION', 'VITALS', 'LAB_ORDER', 'RADIOLOGY', 'DIET', 'ACTIVITY', 'NURSING_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONTINUED', 'HELD');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('NURSING_ROUTINE', 'NURSING_HANDOVER', 'DOCTOR_ROUND', 'DOCTOR_ADMISSION', 'DOCTOR_DISCHARGE', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('PERSONAL_ID', 'PASSPORT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountingSourceModule" ADD VALUE 'PURCHASE_RETURN';
ALTER TYPE "AccountingSourceModule" ADD VALUE 'PATIENT_REFUND';
ALTER TYPE "AccountingSourceModule" ADD VALUE 'INVENTORY_ADJUSTMENT';

-- AlterEnum
ALTER TYPE "RadiologyStatus" ADD VALUE 'IN_PROGRESS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemAccountKey" ADD VALUE 'INVENTORY_GAIN';
ALTER TYPE "SystemAccountKey" ADD VALUE 'INVENTORY_LOSS';
ALTER TYPE "SystemAccountKey" ADD VALUE 'RETAINED_EARNINGS';

-- DropIndex
DROP INDEX "LabOrder_orderId_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSpecial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "queueNumber" INTEGER,
ADD COLUMN     "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON';

-- AlterTable
ALTER TABLE "DoctorSchedule" ADD COLUMN     "consultationPrice" DECIMAL(18,3) DEFAULT 0,
ADD COLUMN     "endTime" TEXT DEFAULT '16:00',
ADD COLUMN     "maxEmergency" INTEGER DEFAULT 10,
ADD COLUMN     "reservedNumbers" TEXT DEFAULT '1,3,5,7,9',
ADD COLUMN     "slotDuration" INTEGER DEFAULT 15,
ADD COLUMN     "specialty" TEXT,
ADD COLUMN     "startTime" TEXT DEFAULT '08:00',
ADD COLUMN     "workDays" TEXT DEFAULT '0,1,2,3,4';

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "printHeaderFooter" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "emailHash" TEXT,
ADD COLUMN     "familyBooklet" TEXT,
ADD COLUMN     "familySheet" TEXT,
ADD COLUMN     "identityType" "IdentityType",
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "mrnHash" TEXT,
ADD COLUMN     "phoneHash" TEXT,
ADD COLUMN     "registryNumber" TEXT,
ADD COLUMN     "webPassword" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "hashedRefreshToken",
ADD COLUMN     "jobRank" "JobRank" DEFAULT 'GENERAL_PRACTITIONER';

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedByToken" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "InventoryCountType" NOT NULL DEFAULT 'FULL',
    "assignedToId" INTEGER,
    "approvedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" SERIAL NOT NULL,
    "inventoryCountId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "systemQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "physicalQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "variance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "vatAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,3) NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountingEntryId" INTEGER,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnLine" (
    "id" SERIAL NOT NULL,
    "purchaseReturnId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "type" "NoteType" NOT NULL DEFAULT 'NURSING_ROUTINE',
    "content" TEXT NOT NULL,
    "shiftId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "frequency" TEXT,
    "startDate" TIMESTAMP(3),
    "type" "CarePlanType" NOT NULL DEFAULT 'OTHER',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanExecution" (
    "id" SERIAL NOT NULL,
    "carePlanItemId" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedById" INTEGER NOT NULL,
    "resultValue" TEXT,
    "note" TEXT,

    CONSTRAINT "CarePlanExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugInteraction" (
    "id" SERIAL NOT NULL,
    "drugAGeneric" TEXT NOT NULL,
    "drugBGeneric" TEXT NOT NULL,
    "severity" "DrugInteractionSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "recommendation" TEXT,
    "source" TEXT,
    "evidenceLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CDSSAlert" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encounterId" INTEGER,
    "prescriptionId" INTEGER,
    "orderId" INTEGER,
    "alertType" "CDSSAlertType" NOT NULL,
    "severity" "CDSSAlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "messageAr" TEXT,
    "context" JSONB,
    "status" "CDSSAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledgedById" INTEGER,
    "acknowledgedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CDSSAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DosageRule" (
    "id" SERIAL NOT NULL,
    "drugGeneric" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "weightMin" DECIMAL(5,2),
    "weightMax" DECIMAL(5,2),
    "renalFunction" TEXT,
    "minDose" DECIMAL(10,3),
    "maxDose" DECIMAL(10,3),
    "doseUnit" TEXT,
    "adjustmentFactor" DECIMAL(5,2),
    "recommendation" TEXT,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DosageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCriticalValue" (
    "id" SERIAL NOT NULL,
    "labTestCode" TEXT NOT NULL,
    "labTestName" TEXT NOT NULL,
    "criticalLow" DECIMAL(10,3),
    "criticalHigh" DECIMAL(10,3),
    "panicLow" DECIMAL(10,3),
    "panicHigh" DECIMAL(10,3),
    "unit" TEXT NOT NULL,
    "ageGroup" TEXT,
    "gender" "Gender",
    "action" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabCriticalValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalCriticalValue" (
    "id" SERIAL NOT NULL,
    "vitalType" TEXT NOT NULL,
    "vitalName" TEXT NOT NULL,
    "criticalLow" DECIMAL(6,2),
    "criticalHigh" DECIMAL(6,2),
    "unit" TEXT NOT NULL,
    "ageGroup" TEXT,
    "action" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VitalCriticalValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CPTCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPTCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_hashedToken_key" ON "RefreshToken"("hashedToken");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_accountingEntryId_key" ON "InventoryCount"("accountingEntryId");

-- CreateIndex
CREATE INDEX "InventoryCount_hospitalId_warehouseId_idx" ON "InventoryCount"("hospitalId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryCount_date_idx" ON "InventoryCount"("date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_inventoryCountId_productId_batchNumber_key" ON "InventoryCountLine"("inventoryCountId", "productId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_accountingEntryId_key" ON "PurchaseReturn"("accountingEntryId");

-- CreateIndex
CREATE INDEX "PurchaseReturn_hospitalId_supplierId_idx" ON "PurchaseReturn"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "ClinicalNote_encounterId_idx" ON "ClinicalNote"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalNote_type_idx" ON "ClinicalNote"("type");

-- CreateIndex
CREATE INDEX "CarePlanItem_encounterId_idx" ON "CarePlanItem"("encounterId");

-- CreateIndex
CREATE INDEX "CarePlanExecution_carePlanItemId_idx" ON "CarePlanExecution"("carePlanItemId");

-- CreateIndex
CREATE INDEX "DrugInteraction_drugAGeneric_idx" ON "DrugInteraction"("drugAGeneric");

-- CreateIndex
CREATE INDEX "DrugInteraction_drugBGeneric_idx" ON "DrugInteraction"("drugBGeneric");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteraction_drugAGeneric_drugBGeneric_key" ON "DrugInteraction"("drugAGeneric", "drugBGeneric");

-- CreateIndex
CREATE INDEX "CDSSAlert_hospitalId_patientId_idx" ON "CDSSAlert"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "CDSSAlert_hospitalId_status_idx" ON "CDSSAlert"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "CDSSAlert_alertType_severity_idx" ON "CDSSAlert"("alertType", "severity");

-- CreateIndex
CREATE INDEX "DosageRule_drugGeneric_idx" ON "DosageRule"("drugGeneric");

-- CreateIndex
CREATE UNIQUE INDEX "LabCriticalValue_labTestCode_ageGroup_gender_key" ON "LabCriticalValue"("labTestCode", "ageGroup", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "VitalCriticalValue_vitalType_ageGroup_key" ON "VitalCriticalValue"("vitalType", "ageGroup");

-- CreateIndex
CREATE UNIQUE INDEX "CPTCode_code_key" ON "CPTCode"("code");

-- CreateIndex
CREATE INDEX "Appointment_hospitalId_doctorId_scheduledStart_queueNumber_idx" ON "Appointment"("hospitalId", "doctorId", "scheduledStart", "queueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_phoneHash_key" ON "Patient"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_emailHash_key" ON "Patient"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrnHash_key" ON "Patient"("mrnHash");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanExecution" ADD CONSTRAINT "CarePlanExecution_carePlanItemId_fkey" FOREIGN KEY ("carePlanItemId") REFERENCES "CarePlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanExecution" ADD CONSTRAINT "CarePlanExecution_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDSSAlert" ADD CONSTRAINT "CDSSAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
