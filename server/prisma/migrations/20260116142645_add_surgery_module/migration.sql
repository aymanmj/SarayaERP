-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'RECOVERY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurgeryRole" AS ENUM ('SURGEON', 'ASSISTANT_SURGEON', 'ANESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'TECHNICIAN');

-- CreateTable
CREATE TABLE "OperatingTheatre" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OperatingTheatre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryCase" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "theatreId" INTEGER NOT NULL,
    "surgeryName" TEXT NOT NULL,
    "serviceItemId" INTEGER,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "SurgeryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "preOpDiagnosis" TEXT,
    "postOpDiagnosis" TEXT,
    "surgeonNotes" TEXT,
    "anesthesiaNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryTeam" (
    "id" SERIAL NOT NULL,
    "surgeryCaseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "SurgeryRole" NOT NULL,
    "commissionAmount" DECIMAL(18,3),

    CONSTRAINT "SurgeryTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryConsumable" (
    "id" SERIAL NOT NULL,
    "surgeryCaseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalPrice" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "SurgeryConsumable_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OperatingTheatre" ADD CONSTRAINT "OperatingTheatre_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "OperatingTheatre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryTeam" ADD CONSTRAINT "SurgeryTeam_surgeryCaseId_fkey" FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryTeam" ADD CONSTRAINT "SurgeryTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryConsumable" ADD CONSTRAINT "SurgeryConsumable_surgeryCaseId_fkey" FOREIGN KEY ("surgeryCaseId") REFERENCES "SurgeryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryConsumable" ADD CONSTRAINT "SurgeryConsumable_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
