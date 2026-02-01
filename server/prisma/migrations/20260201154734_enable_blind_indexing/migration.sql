/*
  Warnings:

  - A unique constraint covering the columns `[nationalId]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Patient_nationalId_key" ON "Patient"("nationalId");
