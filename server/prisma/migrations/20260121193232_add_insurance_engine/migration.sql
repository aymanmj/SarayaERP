-- CreateEnum
CREATE TYPE "CopayType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "CoverageRuleType" AS ENUM ('INCLUSION', 'EXCLUSION');

-- AlterTable
ALTER TABLE "InsurancePolicy" ADD COLUMN     "planId" INTEGER;

-- CreateTable
CREATE TABLE "InsurancePlan" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCopayRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "maxCopayAmount" DECIMAL(18,3),

    CONSTRAINT "InsurancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageRule" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "serviceCategoryId" INTEGER,
    "serviceItemId" INTEGER,
    "ruleType" "CoverageRuleType" NOT NULL DEFAULT 'INCLUSION',
    "copayType" "CopayType" NOT NULL DEFAULT 'PERCENTAGE',
    "copayValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAuthorization" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "policyId" INTEGER NOT NULL,
    "serviceItemId" INTEGER,
    "diagnosisCodeId" INTEGER,
    "authCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAmount" DECIMAL(18,3),
    "approvedAmount" DECIMAL(18,3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAuthorization_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InsurancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePlan" ADD CONSTRAINT "InsurancePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InsurancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
