/*
  Warnings:

  - A unique constraint covering the columns `[hospitalId,code]` on the table `LabTest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[hospitalId,code]` on the table `RadiologyStudy` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LabTest_hospitalId_code_key" ON "LabTest"("hospitalId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RadiologyStudy_hospitalId_code_key" ON "RadiologyStudy"("hospitalId", "code");
