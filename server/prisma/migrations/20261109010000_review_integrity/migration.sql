-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "depositFingerprint" TEXT,
ADD COLUMN     "depositRequestKey" TEXT,
ADD COLUMN     "isDepositApplication" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MedicationAdministration" ADD COLUMN     "isBarcodeMatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestFingerprint" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "cashierSessionId" INTEGER,
ADD COLUMN     "depositEncounterId" INTEGER,
ADD COLUMN     "depositFingerprint" TEXT,
ADD COLUMN     "depositPatientId" INTEGER,
ADD COLUMN     "depositRequestKey" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,3);

-- CreateTable
CREATE TABLE "ClaimReceipt" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "claimId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "adjustmentAmount" DECIMAL(18,3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimReceipt_requestKey_key" ON "ClaimReceipt"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_depositRequestKey_key" ON "Payment"("depositRequestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationAdministration_requestKey_key" ON "MedicationAdministration"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_depositRequestKey_key" ON "Voucher"("depositRequestKey");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_depositPatientId_fkey" FOREIGN KEY ("depositPatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_depositEncounterId_fkey" FOREIGN KEY ("depositEncounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "ClaimReceipt_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "ClaimReceipt_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "ClaimReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "deposit_patient_scope_idx" ON "Voucher"("hospitalId","depositPatientId","depositEncounterId");
CREATE INDEX "claim_receipt_scope_idx" ON "ClaimReceipt"("hospitalId","claimId");
ALTER TABLE "Voucher" ADD CONSTRAINT "deposit_voucher_contract" CHECK ("depositPatientId" IS NULL OR ("depositRequestKey" IS NOT NULL AND "depositFingerprint" IS NOT NULL AND "status"='POSTED' AND "amount">0 AND "deletedAt" IS NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "deposit_payment_contract" CHECK (NOT "isDepositApplication" OR ("depositRequestKey" IS NOT NULL AND "depositFingerprint" IS NOT NULL AND "method"='OTHER' AND "amount">0 AND "sessionId" IS NULL));
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "claim_receipt_amount_contract" CHECK ("amount">0 AND "adjustmentAmount"=0);
CREATE FUNCTION protect_review_ledgers() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='Voucher' THEN IF OLD."depositPatientId" IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF; END IF;
 IF TG_TABLE_NAME='Payment' THEN IF NOT OLD."isDepositApplication" THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF; END IF;
 RAISE EXCEPTION 'Posted deposit/claim receipt is immutable; an approved correction is required';
END $$;
CREATE TRIGGER deposit_voucher_immutable BEFORE UPDATE OR DELETE ON "Voucher" FOR EACH ROW EXECUTE FUNCTION protect_review_ledgers();
CREATE TRIGGER deposit_payment_immutable BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION protect_review_ledgers();
CREATE TRIGGER claim_receipt_immutable BEFORE UPDATE OR DELETE ON "ClaimReceipt" FOR EACH ROW EXECUTE FUNCTION protect_review_ledgers();
INSERT INTO "Permission" ("code","description") VALUES ('nursing:medications:administer','تنفيذ توثيق إعطاء الأدوية'),('nursing:medications:override','اعتماد تجاوز دوائي طارئ موثق') ON CONFLICT ("code") DO NOTHING;
