/*
  Warnings:

  - You are about to drop the column `serviceItemId` on the `Room` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_serviceItemId_fkey";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "serviceItemId";

-- AlterTable
ALTER TABLE "Ward" ADD COLUMN     "serviceItemId" INTEGER;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
