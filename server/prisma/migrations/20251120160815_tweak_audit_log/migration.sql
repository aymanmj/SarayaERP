/*
  Warnings:

  - You are about to drop the column `after` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `before` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `clientHostname` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `entityName` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `AuditLog` table. All the data in the column will be lost.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "after",
DROP COLUMN "before",
DROP COLUMN "clientHostname",
DROP COLUMN "entityName",
DROP COLUMN "userAgent",
ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "entity" TEXT,
DROP COLUMN "action",
ADD COLUMN     "action" TEXT NOT NULL;
