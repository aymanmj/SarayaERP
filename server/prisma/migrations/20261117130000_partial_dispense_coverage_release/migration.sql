BEGIN;

ALTER TABLE "InsurancePolicy"
  ADD COLUMN "releaseCoverageOnPartialDispense" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT insurance_partial_release_requires_cap CHECK (
    NOT "releaseCoverageOnPartialDispense" OR ("maxCoverageAmount" IS NOT NULL AND "maxCoverageAmount" > 0)
  );
ALTER TABLE "Invoice" ADD COLUMN "releaseCoverageOnPartialDispense" BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION snapshot_partial_dispense_coverage_term() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' THEN
    IF NEW."releaseCoverageOnPartialDispense" IS DISTINCT FROM OLD."releaseCoverageOnPartialDispense" THEN
      RAISE EXCEPTION 'Issued invoice coverage term is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD."releaseCoverageOnPartialDispense" AND OLD.status <> 'CANCELLED' AND NEW.status = 'CANCELLED'
      AND EXISTS (
        SELECT 1 FROM "InvoiceAdjustment" a WHERE a."invoiceId" = OLD.id
          AND a."partialDispense" AND a.status = 'POSTED' AND a."insuranceDelta" < 0
      )
    THEN
      RAISE EXCEPTION 'Cannot cancel an invoice after final partial dispensing released coverage' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  NEW."releaseCoverageOnPartialDispense" := COALESCE((
    SELECT p."releaseCoverageOnPartialDispense" FROM "InsurancePolicy" p
    WHERE p.id = NEW."coveragePolicyId" AND NEW.type = 'INVOICE' AND NEW.status NOT IN ('DRAFT', 'CANCELLED')
  ), false);
  RETURN NEW;
END $$;

-- Runs after invoice_coverage_balance_guard so the attributed policy is available.
CREATE TRIGGER invoice_coverage_term_snapshot
  BEFORE INSERT OR UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION snapshot_partial_dispense_coverage_term();

CREATE FUNCTION release_partial_dispense_coverage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  invoice "Invoice"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT invoice FROM "Invoice" i
  WHERE i.id = NEW."invoiceId" AND i."hospitalId" = NEW."hospitalId" FOR UPDATE;
  IF NOT invoice."releaseCoverageOnPartialDispense" THEN
    RETURN NEW;
  END IF;
  IF invoice."coveragePolicyId" IS NULL OR invoice.status = 'CANCELLED' OR
    NEW."insuranceDelta" < -invoice."insuranceShare" OR
    NEW."reviewedById" IS NULL OR NEW."reviewedById" = NEW."requestedById"
  THEN
    RAISE EXCEPTION 'Invalid partial dispense coverage release' USING ERRCODE = '23514';
  END IF;
  UPDATE "InsuranceCoverageBalance"
    SET "usedAmount" = "usedAmount" + NEW."insuranceDelta"
    WHERE "patientId" = invoice."patientId" AND "policyId" = invoice."coveragePolicyId"
      AND "usedAmount" >= -NEW."insuranceDelta";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insurance coverage balance requires reconciliation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- The financial posting's deferred journal and dispense checks still govern commit.
CREATE TRIGGER partial_dispense_coverage_release
  AFTER UPDATE ON "InvoiceAdjustment"
  FOR EACH ROW WHEN (OLD.status = 'PENDING' AND NEW.status = 'POSTED' AND NEW."partialDispense" AND NEW."insuranceDelta" < 0)
  EXECUTE FUNCTION release_partial_dispense_coverage();

COMMIT;
