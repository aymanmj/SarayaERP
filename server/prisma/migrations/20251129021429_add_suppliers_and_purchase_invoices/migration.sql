-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "AccountingEntryLine" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "DrugItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "EncounterCharge" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "ServiceItem" ALTER COLUMN "defaultPrice" SET DATA TYPE DECIMAL(18,3);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "taxNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,3) NOT NULL,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" SERIAL NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "expenseAccountId" INTEGER,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER,
    "amount" DECIMAL(18,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "accountingEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_hospitalId_name_idx" ON "Supplier"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "Supplier_hospitalId_code_idx" ON "Supplier"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_hospitalId_supplierId_idx" ON "PurchaseInvoice"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_hospitalId_invoiceDate_idx" ON "PurchaseInvoice"("hospitalId", "invoiceDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_purchaseInvoiceId_idx" ON "PurchaseInvoiceLine"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "SupplierPayment_hospitalId_supplierId_idx" ON "SupplierPayment"("hospitalId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_hospitalId_paidAt_idx" ON "SupplierPayment"("hospitalId", "paidAt");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
