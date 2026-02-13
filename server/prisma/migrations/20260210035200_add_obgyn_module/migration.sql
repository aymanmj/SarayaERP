-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('NVD', 'ASSISTED_NVD', 'CS_ELECTIVE', 'CS_EMERGENCY', 'VBAC');

-- CreateEnum
CREATE TYPE "InductionMethod" AS ENUM ('NONE', 'OXYTOCIN', 'PROSTAGLANDIN', 'MECHANICAL');

-- CreateEnum
CREATE TYPE "PlacentaDelivery" AS ENUM ('SPONTANEOUS', 'MANUAL');

-- CreateEnum
CREATE TYPE "PerinealTear" AS ENUM ('NONE', 'DEGREE_1', 'DEGREE_2', 'DEGREE_3', 'DEGREE_4');

-- CreateTable
CREATE TABLE "ObstetricHistory" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "gravida" INTEGER NOT NULL DEFAULT 0,
    "para" INTEGER NOT NULL DEFAULT 0,
    "abortion" INTEGER NOT NULL DEFAULT 0,
    "prevCSCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryDate" TIMESTAMP(3),
    "bloodGroup" TEXT,
    "riskFactors" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObstetricHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAdmission" (
    "id" SERIAL NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "inductionMethod" "InductionMethod" NOT NULL DEFAULT 'NONE',
    "placentaDelivery" "PlacentaDelivery" NOT NULL DEFAULT 'SPONTANEOUS',
    "episiotomy" BOOLEAN NOT NULL DEFAULT false,
    "perinealTear" "PerinealTear" NOT NULL DEFAULT 'NONE',
    "bloodLoss" INTEGER,
    "babyCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "DeliveryAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BabyProfile" (
    "id" SERIAL NOT NULL,
    "deliveryAdmissionId" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "weight" DECIMAL(5,3),
    "birthTime" TIMESTAMP(3) NOT NULL,
    "apgarScore1" INTEGER,
    "apgarScore5" INTEGER,
    "notes" TEXT,
    "generatedPatientId" INTEGER,

    CONSTRAINT "BabyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObstetricHistory_patientId_key" ON "ObstetricHistory"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAdmission_encounterId_key" ON "DeliveryAdmission"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "BabyProfile_generatedPatientId_key" ON "BabyProfile"("generatedPatientId");

-- AddForeignKey
ALTER TABLE "ObstetricHistory" ADD CONSTRAINT "ObstetricHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAdmission" ADD CONSTRAINT "DeliveryAdmission_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyProfile" ADD CONSTRAINT "BabyProfile_deliveryAdmissionId_fkey" FOREIGN KEY ("deliveryAdmissionId") REFERENCES "DeliveryAdmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BabyProfile" ADD CONSTRAINT "BabyProfile_generatedPatientId_fkey" FOREIGN KEY ("generatedPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
