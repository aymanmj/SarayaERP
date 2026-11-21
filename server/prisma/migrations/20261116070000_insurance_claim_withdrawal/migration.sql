CREATE TABLE "InsuranceClaimWithdrawal" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "claimId" INTEGER,
  "recordedById" INTEGER NOT NULL,
  "payerReference" TEXT NOT NULL CHECK (length(btrim("payerReference")) BETWEEN 5 AND 200),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  "previousInvoiceStatus" TEXT,
  "previousClaimStatus" "ClaimStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsuranceClaimWithdrawal_invoiceId_fkey" FOREIGN KEY ("invoiceId")
    REFERENCES "Invoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InsuranceClaimWithdrawal_claimId_fkey" FOREIGN KEY ("claimId")
    REFERENCES "Claim"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InsuranceClaimWithdrawal_hospitalId_fkey" FOREIGN KEY ("hospitalId")
    REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InsuranceClaimWithdrawal_recordedById_fkey" FOREIGN KEY ("recordedById")
    REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InsuranceClaimWithdrawal_invoiceId_key" ON "InsuranceClaimWithdrawal"("invoiceId");
CREATE UNIQUE INDEX "InsuranceClaimWithdrawal_claimId_key" ON "InsuranceClaimWithdrawal"("claimId");

CREATE FUNCTION protect_insurance_claim_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance withdrawal evidence is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER insurance_claim_withdrawal_immutable BEFORE UPDATE OR DELETE ON "InsuranceClaimWithdrawal"
  FOR EACH ROW EXECUTE FUNCTION protect_insurance_claim_withdrawal();

CREATE FUNCTION protect_withdrawn_invoice_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."claimStatus" = 'WITHDRAWN' AND NEW."claimStatus" IS DISTINCT FROM OLD."claimStatus" THEN
    RAISE EXCEPTION 'Withdrawn invoice claim cannot be reopened' USING ERRCODE = '23514';
  END IF;
  IF NEW."claimStatus" = 'WITHDRAWN' AND NOT EXISTS (
    SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = NEW.id
      AND w."hospitalId" = NEW."hospitalId"
  ) THEN
    RAISE EXCEPTION 'Claim withdrawal requires payer evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_claim_withdrawal_guard BEFORE UPDATE OF "claimStatus" ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION protect_withdrawn_invoice_claim();

CREATE FUNCTION protect_withdrawn_rcm_claim() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE evidence_id INTEGER;
BEGIN
  SELECT w."claimId" INTO evidence_id
  FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = NEW."invoiceId";
  IF FOUND AND (NEW.id IS DISTINCT FROM evidence_id OR NEW.status <> 'VOID' OR NEW."batchId" IS NOT NULL) THEN
    RAISE EXCEPTION 'A withdrawn claim cannot be reopened or replaced' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'VOID' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A void claim cannot be reopened' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rcm_claim_withdrawal_guard BEFORE INSERT OR UPDATE OF "status", "invoiceId", "batchId" ON "Claim"
  FOR EACH ROW EXECUTE FUNCTION protect_withdrawn_rcm_claim();
