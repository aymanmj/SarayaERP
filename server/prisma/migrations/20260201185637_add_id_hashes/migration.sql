/*
  Warnings:

  - A unique constraint covering the columns `[nationalIdHash]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[identityNumberHash]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Patient_nationalId_key";

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "identityNumberHash" TEXT,
ADD COLUMN     "nationalIdHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nationalIdHash_key" ON "Patient"("nationalIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_identityNumberHash_key" ON "Patient"("identityNumberHash");
