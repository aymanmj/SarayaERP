-- CreateTable
CREATE TABLE "CashierShiftClosing" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "systemCashTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualCashTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "difference" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierShiftClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashierShiftClosing_hospitalId_idx" ON "CashierShiftClosing"("hospitalId");

-- CreateIndex
CREATE INDEX "CashierShiftClosing_cashierId_idx" ON "CashierShiftClosing"("cashierId");

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShiftClosing" ADD CONSTRAINT "CashierShiftClosing_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
