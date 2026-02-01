-- CreateEnum
CREATE TYPE "IntegrationProtocol" AS ENUM ('HL7_V2', 'DICOM', 'API_JSON');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "MedicalDevice" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" "IntegrationProtocol" NOT NULL DEFAULT 'HL7_V2',
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestMapping" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "serviceItemId" INTEGER,
    "labTestId" INTEGER,
    "deviceTestCode" TEXT NOT NULL,

    CONSTRAINT "TestMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "direction" "IntegrationDirection" NOT NULL,
    "messageType" TEXT,
    "rawMessage" TEXT NOT NULL,
    "parsedData" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestMapping_deviceId_labTestId_key" ON "TestMapping"("deviceId", "labTestId");

-- CreateIndex
CREATE UNIQUE INDEX "TestMapping_deviceId_deviceTestCode_key" ON "TestMapping"("deviceId", "deviceTestCode");

-- AddForeignKey
ALTER TABLE "MedicalDevice" ADD CONSTRAINT "MedicalDevice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMapping" ADD CONSTRAINT "TestMapping_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MedicalDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestMapping" ADD CONSTRAINT "TestMapping_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MedicalDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
