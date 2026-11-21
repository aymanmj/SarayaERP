ALTER TABLE "Invoice" ADD COLUMN "coveragePolicyId" INTEGER;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_coveragePolicyId_fkey"
  FOREIGN KEY ("coveragePolicyId") REFERENCES "InsurancePolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Invoice_coverage_attribution_idx"
  ON "Invoice"("hospitalId", "patientId", "insuranceProviderId", "coveragePolicyId");

CREATE TABLE "InsuranceCoverageBalance" (
  "patientId" INTEGER NOT NULL,
  "policyId" INTEGER NOT NULL,
  "usedAmount" DECIMAL(24,3) NOT NULL DEFAULT 0 CHECK ("usedAmount" >= 0),
  CONSTRAINT "InsuranceCoverageBalance_pkey" PRIMARY KEY ("patientId", "policyId"),
  CONSTRAINT "InsuranceCoverageBalance_patientId_fkey" FOREIGN KEY ("patientId")
    REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InsuranceCoverageBalance_policyId_fkey" FOREIGN KEY ("policyId")
    REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InsuranceCoverageBalance_policyId_idx" ON "InsuranceCoverageBalance"("policyId");

CREATE FUNCTION track_invoice_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  policy_id INTEGER;
  policy_cap DECIMAL(18,3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."coveragePolicyId" IS NOT NULL AND OLD.status <> 'CANCELLED' THEN
      RAISE EXCEPTION 'Cancel the tracked invoice before removal' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."coveragePolicyId" IS NOT NULL THEN
    IF ROW(NEW."coveragePolicyId", NEW."hospitalId", NEW."patientId",
           NEW."insuranceProviderId", NEW."insuranceShare", NEW.type)
       IS DISTINCT FROM
       ROW(OLD."coveragePolicyId", OLD."hospitalId", OLD."patientId",
           OLD."insuranceProviderId", OLD."insuranceShare", OLD.type)
      OR NEW.status = 'DRAFT'
      OR (OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED') THEN
      RAISE EXCEPTION 'Tracked invoice coverage cannot be rewritten' USING ERRCODE = '23514';
    END IF;

    IF OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
      -- Settlement and denial do not themselves reverse the original coverage.
      IF OLD."claimStatus" IN ('SUBMITTED', 'PAID')
        OR EXISTS (SELECT 1 FROM "Claim" WHERE "invoiceId" = OLD.id AND status <> 'VOID') THEN
        RAISE EXCEPTION 'Resolve the insurance claim before cancelling coverage' USING ERRCODE = '23514';
      END IF;
      UPDATE "InsuranceCoverageBalance"
      SET "usedAmount" = "usedAmount" - OLD."insuranceShare"
      WHERE "patientId" = OLD."patientId" AND "policyId" = OLD."coveragePolicyId"
        AND "usedAmount" >= OLD."insuranceShare";
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insurance coverage balance requires reconciliation' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' THEN
    IF NEW."coveragePolicyId" IS NOT NULL OR
      ROW(NEW."hospitalId", NEW."patientId", NEW."insuranceProviderId", NEW."insuranceShare", NEW.type)
      IS DISTINCT FROM
      ROW(OLD."hospitalId", OLD."patientId", OLD."insuranceProviderId", OLD."insuranceShare", OLD.type)
      AND (OLD."insuranceShare" > 0 OR NEW."insuranceShare" > 0) THEN
      RAISE EXCEPTION 'Issued coverage requires a separate correction' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.type <> 'INVOICE' OR NEW.status IN ('DRAFT', 'CANCELLED') OR NEW."insuranceShare" <= 0 THEN
    IF NEW."coveragePolicyId" IS NOT NULL THEN
      RAISE EXCEPTION 'Only an issued insured invoice can allocate coverage' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT policy.id, policy."maxCoverageAmount" INTO policy_id, policy_cap
  FROM "Patient" patient
  JOIN "InsurancePolicy" policy ON policy.id = patient."insurancePolicyId"
  JOIN "InsuranceProvider" provider ON provider.id = policy."insuranceProviderId"
  WHERE patient.id = NEW."patientId" AND patient."hospitalId" = NEW."hospitalId"
    AND provider."hospitalId" = NEW."hospitalId" AND provider.id = NEW."insuranceProviderId"
  FOR SHARE OF patient, policy;

  IF NEW."coveragePolicyId" IS NOT NULL AND NEW."coveragePolicyId" IS DISTINCT FROM policy_id THEN
    RAISE EXCEPTION 'Invoice coverage policy does not match the patient and provider' USING ERRCODE = '23514';
  END IF;
  IF policy_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM "Patient" patient
      JOIN "InsurancePolicy" policy ON policy.id = patient."insurancePolicyId"
      WHERE patient.id = NEW."patientId" AND policy."maxCoverageAmount" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Capped patient invoice requires a matching insurance policy' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF policy_cap IS NOT NULL AND EXISTS (
    SELECT 1 FROM "Invoice" historical
    WHERE historical."hospitalId" = NEW."hospitalId" AND historical."patientId" = NEW."patientId"
      AND historical."insuranceProviderId" = NEW."insuranceProviderId"
      AND historical."coveragePolicyId" IS NULL AND historical."insuranceShare" > 0
      AND historical.type = 'INVOICE' AND historical.status NOT IN ('DRAFT', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Historical insurance coverage requires reconciliation' USING ERRCODE = '23514';
  END IF;
  IF policy_cap IS NOT NULL AND NEW."insuranceShare" > policy_cap THEN
    RAISE EXCEPTION 'Insurance coverage limit exceeded' USING ERRCODE = '23514';
  END IF;

  INSERT INTO "InsuranceCoverageBalance" ("patientId", "policyId", "usedAmount")
  VALUES (NEW."patientId", policy_id, NEW."insuranceShare")
  ON CONFLICT ("patientId", "policyId") DO UPDATE
    SET "usedAmount" = "InsuranceCoverageBalance"."usedAmount" + EXCLUDED."usedAmount"
    WHERE policy_cap IS NULL OR
      "InsuranceCoverageBalance"."usedAmount" + EXCLUDED."usedAmount" <= policy_cap;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insurance coverage limit exceeded' USING ERRCODE = '23514';
  END IF;
  NEW."coveragePolicyId" := policy_id;
  RETURN NEW;
END $$;

CREATE TRIGGER invoice_coverage_balance_guard
  BEFORE INSERT OR UPDATE OF "status", "insuranceShare", "coveragePolicyId",
    "insuranceProviderId", "patientId", "hospitalId", "type" OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION track_invoice_coverage();
