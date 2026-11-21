-- Reconciles schema drift; preserves historical review and CAPA evidence.
-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockIssueStatus" AS ENUM ('ISSUED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "InventoryValuationMethod" AS ENUM ('FIFO', 'LIFO', 'WEIGHTED_AVERAGE', 'STANDARD_COST');

-- AlterEnum
ALTER TYPE "ClaimStatus" ADD VALUE 'QUEUED';

-- AlterEnum
ALTER TYPE "ConsentFormType" ADD VALUE 'DATA_SHARING';

-- DropForeignKey
ALTER TABLE "CapaAction" DROP CONSTRAINT "CapaAction_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "CapaAction" DROP CONSTRAINT "CapaAction_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "CapaAction" DROP CONSTRAINT "CapaAction_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalIncident" DROP CONSTRAINT "ClinicalIncident_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalIncident" DROP CONSTRAINT "ClinicalIncident_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicalIncident" DROP CONSTRAINT "ClinicalIncident_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "MpiConsentRecord" DROP CONSTRAINT "MpiConsentRecord_globalPatientId_fkey";

-- DropIndex
DROP INDEX "ClinicalIncident_incidentDate_idx";

-- DropIndex
DROP INDEX "ClinicalIncident_severity_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "previousHash" TEXT;

-- AlterTable
ALTER TABLE "CapaAction" RENAME COLUMN "completionNotes" TO "completedNotes";
ALTER TABLE "CapaAction" ALTER COLUMN "hospitalId" DROP NOT NULL,
ADD COLUMN     "isEffective" BOOLEAN,
ADD COLUMN     "verificationNotes" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClinicalIncident" RENAME COLUMN "rootCause" TO "rootCauseCategory";
ALTER TABLE "ClinicalIncident" RENAME COLUMN "rootCauseDetails" TO "rootCause";
ALTER TABLE "ClinicalIncident" ADD COLUMN "contributingFactors" TEXT,
ADD COLUMN     "investigatedById" INTEGER,
ADD COLUMN     "investigationDueDate" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DataRetentionPolicy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "GoodsReceiptItem" ADD COLUMN     "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "uomId" INTEGER;

-- AlterTable
ALTER TABLE "HepaticDoseRequirement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "addressLine1Ar" TEXT,
ADD COLUMN     "addressLine1En" TEXT,
ADD COLUMN     "addressLine2Ar" TEXT,
ADD COLUMN     "addressLine2En" TEXT,
ADD COLUMN     "displayNameAr" TEXT,
ADD COLUMN     "displayNameEn" TEXT,
ADD COLUMN     "legalNameAr" TEXT,
ADD COLUMN     "legalNameEn" TEXT,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "LabTest" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "MpiConsentRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PatientOtp" ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "requestingHospitalId" INTEGER,
ADD COLUMN     "requestingOrganizationId" INTEGER,
ADD COLUMN     "requestingUserId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseUomId" INTEGER,
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "isBatchTracked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "ProductStock" ADD COLUMN     "binId" INTEGER,
ADD COLUMN     "reorderLevel" DECIMAL(18,3),
ADD COLUMN     "unitCost" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "uomId" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseRequestItem" ADD COLUMN     "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "uomId" INTEGER;

-- AlterTable
ALTER TABLE "RadiologyStudy" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "RenalDoseRequirement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "ServiceItem" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "Specialty" ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "binId" INTEGER,
ADD COLUMN     "stockIssueId" INTEGER,
ADD COLUMN     "uomId" INTEGER;

-- AlterTable
ALTER TABLE "VentilatorLog" ADD COLUMN     "compliance" DECIMAL(6,2),
ADD COLUMN     "etco2" DECIMAL(5,2),
ADD COLUMN     "ieRatio" TEXT,
ADD COLUMN     "inspiratoryPressure" DECIMAL(5,2),
ADD COLUMN     "peakPressure" DECIMAL(5,2),
ADD COLUMN     "plateauPressure" DECIMAL(5,2),
ADD COLUMN     "pressureSupport" DECIMAL(5,2),
ADD COLUMN     "respiratoryRate" INTEGER;

-- CreateTable
CREATE TABLE "ServiceItemProduct" (
    "id" SERIAL NOT NULL,
    "serviceItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBundleItem" (
    "id" SERIAL NOT NULL,
    "parentServiceId" INTEGER NOT NULL,
    "childServiceId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserHospitalAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserHospitalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterChargeDiagnosis" (
    "id" SERIAL NOT NULL,
    "encounterChargeId" INTEGER NOT NULL,
    "encounterDiagnosisId" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterChargeDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseZone" (
    "id" SERIAL NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WarehouseZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseBin" (
    "id" SERIAL NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuationMethod" "InventoryValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "inventoryAccountId" INTEGER,
    "expenseAccountId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUOM" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "uomId" INTEGER NOT NULL,
    "conversionRate" DECIMAL(18,3) NOT NULL,
    "isPurchasingUOM" BOOLEAN NOT NULL DEFAULT false,
    "isIssuingUOM" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductUOM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "fromDepartmentId" INTEGER,
    "requestingWarehouseId" INTEGER NOT NULL,
    "fulfillingWarehouseId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequestItem" (
    "id" SERIAL NOT NULL,
    "materialRequestId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "uomId" INTEGER,
    "requestedQty" DECIMAL(18,3) NOT NULL,
    "issuedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "MaterialRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssue" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "materialRequestId" INTEGER NOT NULL,
    "issuedFromId" INTEGER NOT NULL,
    "issuedById" INTEGER NOT NULL,
    "status" "StockIssueStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueItem" (
    "id" SERIAL NOT NULL,
    "stockIssueId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "issuedQty" DECIMAL(18,3) NOT NULL,
    "uomId" INTEGER,
    "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "StockIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FhirSubscription" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT 'application/fhir+json',
    "headers" JSONB,
    "end" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FhirSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugDoseRange" (
    "id" SERIAL NOT NULL,
    "drugName" TEXT NOT NULL,
    "form" TEXT,
    "route" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "weightMin" DOUBLE PRECISION,
    "weightMax" DOUBLE PRECISION,
    "minDoseValue" DOUBLE PRECISION NOT NULL,
    "maxDoseValue" DOUBLE PRECISION NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "frequencyMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugDoseRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminologyRelationship" (
    "id" SERIAL NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminologyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergyGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllergyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergyGroupDrug" (
    "id" SERIAL NOT NULL,
    "allergyGroupId" INTEGER NOT NULL,
    "drugGeneric" TEXT NOT NULL,

    CONSTRAINT "AllergyGroupDrug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "hospitalId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperApp" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperAppScope" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperAppScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceItemProduct_serviceItemId_idx" ON "ServiceItemProduct"("serviceItemId");

-- CreateIndex
CREATE INDEX "ServiceItemProduct_productId_idx" ON "ServiceItemProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItemProduct_serviceItemId_productId_key" ON "ServiceItemProduct"("serviceItemId", "productId");

-- CreateIndex
CREATE INDEX "ServiceBundleItem_parentServiceId_idx" ON "ServiceBundleItem"("parentServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBundleItem_parentServiceId_childServiceId_key" ON "ServiceBundleItem"("parentServiceId", "childServiceId");

-- CreateIndex
CREATE INDEX "UserHospitalAccess_userId_idx" ON "UserHospitalAccess"("userId");

-- CreateIndex
CREATE INDEX "UserHospitalAccess_hospitalId_idx" ON "UserHospitalAccess"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserHospitalAccess_userId_hospitalId_key" ON "UserHospitalAccess"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "EncounterChargeDiagnosis_encounterChargeId_idx" ON "EncounterChargeDiagnosis"("encounterChargeId");

-- CreateIndex
CREATE INDEX "EncounterChargeDiagnosis_encounterDiagnosisId_idx" ON "EncounterChargeDiagnosis"("encounterDiagnosisId");

-- CreateIndex
CREATE UNIQUE INDEX "EncounterChargeDiagnosis_encounterChargeId_encounterDiagnos_key" ON "EncounterChargeDiagnosis"("encounterChargeId", "encounterDiagnosisId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseZone_warehouseId_code_key" ON "WarehouseZone"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_zoneId_code_key" ON "WarehouseBin"("zoneId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_hospitalId_name_key" ON "ItemCategory"("hospitalId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_hospitalId_code_key" ON "UnitOfMeasure"("hospitalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUOM_productId_uomId_key" ON "ProductUOM"("productId", "uomId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_hospitalId_requestNumber_key" ON "MaterialRequest"("hospitalId", "requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockIssue_hospitalId_issueNumber_key" ON "StockIssue"("hospitalId", "issueNumber");

-- CreateIndex
CREATE INDEX "DrugDoseRange_drugName_idx" ON "DrugDoseRange"("drugName");

-- CreateIndex
CREATE UNIQUE INDEX "AllergyGroup_name_key" ON "AllergyGroup"("name");

-- CreateIndex
CREATE INDEX "AllergyGroupDrug_drugGeneric_idx" ON "AllergyGroupDrug"("drugGeneric");

-- CreateIndex
CREATE UNIQUE INDEX "AllergyGroupDrug_allergyGroupId_drugGeneric_key" ON "AllergyGroupDrug"("allergyGroupId", "drugGeneric");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperAppScope_appId_scope_key" ON "DeveloperAppScope"("appId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ClinicalIncident_hospitalId_incidentDate_idx" ON "ClinicalIncident"("hospitalId", "incidentDate");

-- CreateIndex
CREATE INDEX "ClinicalIncident_hospitalId_severity_idx" ON "ClinicalIncident"("hospitalId", "severity");

-- AddForeignKey
ALTER TABLE "ServiceItemProduct" ADD CONSTRAINT "ServiceItemProduct_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemProduct" ADD CONSTRAINT "ServiceItemProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBundleItem" ADD CONSTRAINT "ServiceBundleItem_parentServiceId_fkey" FOREIGN KEY ("parentServiceId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBundleItem" ADD CONSTRAINT "ServiceBundleItem_childServiceId_fkey" FOREIGN KEY ("childServiceId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHospitalAccess" ADD CONSTRAINT "UserHospitalAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserHospitalAccess" ADD CONSTRAINT "UserHospitalAccess_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterChargeDiagnosis" ADD CONSTRAINT "EncounterChargeDiagnosis_encounterChargeId_fkey" FOREIGN KEY ("encounterChargeId") REFERENCES "EncounterCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterChargeDiagnosis" ADD CONSTRAINT "EncounterChargeDiagnosis_encounterDiagnosisId_fkey" FOREIGN KEY ("encounterDiagnosisId") REFERENCES "EncounterDiagnosis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_baseUomId_fkey" FOREIGN KEY ("baseUomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseZone" ADD CONSTRAINT "WarehouseZone_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "WarehouseZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUOM" ADD CONSTRAINT "ProductUOM_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUOM" ADD CONSTRAINT "ProductUOM_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requestingWarehouseId_fkey" FOREIGN KEY ("requestingWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_fulfillingWarehouseId_fkey" FOREIGN KEY ("fulfillingWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_issuedFromId_fkey" FOREIGN KEY ("issuedFromId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueItem" ADD CONSTRAINT "StockIssueItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllergyGroupDrug" ADD CONSTRAINT "AllergyGroupDrug_allergyGroupId_fkey" FOREIGN KEY ("allergyGroupId") REFERENCES "AllergyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalIncident" ADD CONSTRAINT "ClinicalIncident_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalIncident" ADD CONSTRAINT "ClinicalIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalIncident" ADD CONSTRAINT "ClinicalIncident_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalIncident" ADD CONSTRAINT "ClinicalIncident_investigatedById_fkey" FOREIGN KEY ("investigatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaAction" ADD CONSTRAINT "CapaAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ClinicalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaAction" ADD CONSTRAINT "CapaAction_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaAction" ADD CONSTRAINT "CapaAction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpiConsentRecord" ADD CONSTRAINT "MpiConsentRecord_globalPatientId_fkey" FOREIGN KEY ("globalPatientId") REFERENCES "GlobalPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperApp" ADD CONSTRAINT "DeveloperApp_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperAppScope" ADD CONSTRAINT "DeveloperAppScope_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing quantities predate UOM conversion and are already in base units.
UPDATE "GoodsReceiptItem" SET "baseQuantity" = "quantity";
UPDATE "PurchaseOrderItem" SET "baseQuantity" = "quantity";
UPDATE "PurchaseRequestItem" SET "baseQuantity" = "quantity";
UPDATE "StockTransaction" SET "baseQuantity" = "quantity";
-- Seed the newly introduced stock valuation from the existing product cost.
UPDATE "ProductStock" s SET "unitCost" = p."costPrice"
FROM "Product" p WHERE p."id" = s."productId";
