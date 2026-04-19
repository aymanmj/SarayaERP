-- CreateEnum
CREATE TYPE "TerminologySystem" AS ENUM ('ICD10', 'SNOMED_CT', 'LOINC', 'ATC', 'RXNORM', 'LOCAL');

-- CreateTable
CREATE TABLE "TerminologyConcept" (
    "id" SERIAL NOT NULL,
    "system" "TerminologySystem" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "displayAr" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminologyConcept_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DiagnosisCode" ADD COLUMN "terminologyConceptId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "terminologyConceptId" INTEGER;

-- AlterTable
ALTER TABLE "SurgeryCase"
ADD COLUMN "procedureConceptId" INTEGER,
ADD COLUMN "preOpDiagnosisConceptId" INTEGER,
ADD COLUMN "postOpDiagnosisConceptId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "TerminologyConcept_system_code_key" ON "TerminologyConcept"("system", "code");
CREATE INDEX "TerminologyConcept_system_idx" ON "TerminologyConcept"("system");
CREATE INDEX "TerminologyConcept_code_idx" ON "TerminologyConcept"("code");
CREATE INDEX "DiagnosisCode_terminologyConceptId_idx" ON "DiagnosisCode"("terminologyConceptId");
CREATE INDEX "Product_terminologyConceptId_idx" ON "Product"("terminologyConceptId");
CREATE INDEX "SurgeryCase_procedureConceptId_idx" ON "SurgeryCase"("procedureConceptId");
CREATE INDEX "SurgeryCase_preOpDiagnosisConceptId_idx" ON "SurgeryCase"("preOpDiagnosisConceptId");
CREATE INDEX "SurgeryCase_postOpDiagnosisConceptId_idx" ON "SurgeryCase"("postOpDiagnosisConceptId");

-- AddForeignKey
ALTER TABLE "DiagnosisCode" ADD CONSTRAINT "DiagnosisCode_terminologyConceptId_fkey" FOREIGN KEY ("terminologyConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_terminologyConceptId_fkey" FOREIGN KEY ("terminologyConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_procedureConceptId_fkey" FOREIGN KEY ("procedureConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_preOpDiagnosisConceptId_fkey" FOREIGN KEY ("preOpDiagnosisConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_postOpDiagnosisConceptId_fkey" FOREIGN KEY ("postOpDiagnosisConceptId") REFERENCES "TerminologyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
