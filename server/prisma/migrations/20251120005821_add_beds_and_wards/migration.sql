/*
  Warnings:

  - The values [RESERVED] on the enum `BedStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `code` on the `Bed` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Ward` table. All the data in the column will be lost.
  - Added the required column `bedNumber` to the `Bed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hospitalId` to the `Bed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wardId` to the `Bed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hospitalId` to the `Room` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomNumber` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BedStatus_new" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE', 'BLOCKED');
ALTER TABLE "public"."Bed" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Bed" ALTER COLUMN "status" TYPE "BedStatus_new" USING ("status"::text::"BedStatus_new");
ALTER TYPE "BedStatus" RENAME TO "BedStatus_old";
ALTER TYPE "BedStatus_new" RENAME TO "BedStatus";
DROP TYPE "public"."BedStatus_old";
ALTER TABLE "Bed" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
COMMIT;

-- AlterTable
ALTER TABLE "Bed" DROP COLUMN "code",
ADD COLUMN     "bedNumber" TEXT NOT NULL,
ADD COLUMN     "hospitalId" INTEGER NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wardId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "code",
DROP COLUMN "type",
ADD COLUMN     "hospitalId" INTEGER NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roomNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Ward" DROP COLUMN "code",
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "BedAssignment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "bedId" INTEGER NOT NULL,
    "from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "to" TIMESTAMP(3),

    CONSTRAINT "BedAssignment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
