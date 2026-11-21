BEGIN;
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "sessionId" INTEGER;

-- AlterTable
ALTER TABLE "CashierShiftClosing" ADD COLUMN     "handedOverCashTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "openingCashTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedCashTotal" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "sessionId" INTEGER;

-- CreateTable
CREATE TABLE "CashierSession" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "openingAmount" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedById" INTEGER,
    "reviewReason" TEXT,
    "openingReference" TEXT,
    "openingKey" TEXT,
    "openedAt" TIMESTAMP(3),
    "countedAmount" DECIMAL(18,3),
    "countReason" TEXT,
    "countedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "reference" TEXT,
    "referenceKey" TEXT,
    "reviewReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRefund" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "adjustmentId" INTEGER NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "sessionId" INTEGER,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "reviewReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedById" INTEGER,
    "executionReference" TEXT,
    "executionEvidence" TEXT,
    "executionKey" TEXT,
    "executionRequestKey" TEXT,
    "executedAt" TIMESTAMP(3),
    "postingEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashierSession_requestKey_key" ON "CashierSession"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashierSession_openingKey_key" ON "CashierSession"("openingKey");

-- CreateIndex
CREATE INDEX "CashierSession_hospitalId_cashierId_status_idx" ON "CashierSession"("hospitalId", "cashierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_requestKey_key" ON "CashHandover"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_referenceKey_key" ON "CashHandover"("referenceKey");

-- CreateIndex
CREATE INDEX "CashHandover_hospitalId_sessionId_status_idx" ON "CashHandover"("hospitalId", "sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRefund_requestKey_key" ON "InvoiceRefund"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRefund_executionKey_key" ON "InvoiceRefund"("executionKey");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRefund_executionRequestKey_key" ON "InvoiceRefund"("executionRequestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRefund_postingEntryId_key" ON "InvoiceRefund"("postingEntryId");

-- CreateIndex
CREATE INDEX "InvoiceRefund_hospitalId_invoiceId_status_idx" ON "InvoiceRefund"("hospitalId", "invoiceId", "status");

-- CreateIndex
CREATE INDEX "InvoiceRefund_hospitalId_executedById_executedAt_idx" ON "InvoiceRefund"("hospitalId", "executedById", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashierShiftClosing_sessionId_key" ON "CashierShiftClosing"("sessionId");

-- AddForeignKey
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashierSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "InvoiceAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashierSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashierSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashierSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "CashierSession_one_active_cashier" ON "CashierSession"("hospitalId","cashierId") WHERE "status" IN ('PENDING','OPEN','CLOSING');
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_valid_state" CHECK ("status" IN ('PENDING','OPEN','CLOSING','CLOSED','REJECTED','CANCELLED'));
ALTER TABLE "CashierSession" ADD CONSTRAINT "CashierSession_count_controls" CHECK ("openingAmount" >= 0 AND ("countedAmount" IS NULL OR "countedAmount" >= 0) AND ("reviewedById" IS NULL OR "reviewedById" <> "cashierId") AND ("closedById" IS NULL OR "closedById" <> "cashierId") AND ("status" NOT IN ('OPEN','CLOSING','CLOSED') OR ("openedAt" IS NOT NULL AND "reviewedById" IS NOT NULL)) AND ("status" NOT IN ('CLOSING','CLOSED') OR ("countedAmount" IS NOT NULL AND "countedAt" IS NOT NULL)) AND ("status" <> 'CLOSED' OR ("closedById" IS NOT NULL AND "closedAt" IS NOT NULL)));
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_valid_state" CHECK ("amount" > 0 AND "status" IN ('PENDING','POSTED','REJECTED','CANCELLED') AND ("reviewedById" IS NULL OR "reviewedById" <> "requestedById") AND ("status" <> 'POSTED' OR ("reviewedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "reference" IS NOT NULL AND "referenceKey" IS NOT NULL)));
ALTER TABLE "InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_valid_state" CHECK ("amount" > 0 AND "method" IN ('CASH','CARD','TRANSFER') AND "status" IN ('PENDING','APPROVED','EXECUTED','REJECTED','CANCELLED') AND ("reviewedById" IS NULL OR "reviewedById" <> "requestedById") AND ("executedById" IS NULL OR "executedById" <> "reviewedById") AND ("status" NOT IN ('APPROVED','EXECUTED') OR ("reviewedById" IS NOT NULL AND "approvedAt" IS NOT NULL)) AND ("status" <> 'EXECUTED' OR ("executedById" IS NOT NULL AND "executedAt" IS NOT NULL AND "executionReference" IS NOT NULL AND "executionEvidence" IS NOT NULL AND "executionKey" IS NOT NULL AND "executionRequestKey" IS NOT NULL AND "postingEntryId" IS NOT NULL AND ("method" <> 'CASH' OR "sessionId" IS NOT NULL))) AND ("status" = 'EXECUTED' OR ("executedById" IS NULL AND "executedAt" IS NULL AND "postingEntryId" IS NULL)));
INSERT INTO "Permission" ("code","description") VALUES
 ('cashier:refunds:request','طلب استرداد مبلغ للمريض'),
 ('cashier:refunds:approve','اعتماد أو رفض طلب استرداد'),
 ('cashier:refunds:execute','تسجيل تنفيذ استرداد مثبت'),
 ('cashier:sessions:approve','اعتماد فتح الصندوق وتسليم الخزينة وإقفال العد الفعلي')
ON CONFLICT ("code") DO NOTHING;

COMMIT;
