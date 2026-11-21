BEGIN;
ALTER TABLE "DispenseRecord" ADD COLUMN "partialClosureReason" TEXT CHECK (
  "partialClosureReason" IS NULL OR length(btrim("partialClosureReason")) BETWEEN 5 AND 1000
);
ALTER TABLE "InvoiceAdjustment" ADD COLUMN "partialDispense" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InvoiceAdjustment" DROP CONSTRAINT "InvoiceAdjustment_insuranceDelta_full_credit";
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_insuranceDelta_full_credit" CHECK (
  ("partialDispense" AND NOT "insuranceOnly" AND kind = 'CREDIT' AND delta <= 0 AND "insuranceDelta" <= 0
    AND "correctedAmount" > 0 AND "correctedAmount" < "previousAmount"
    AND delta + "insuranceDelta" = "correctedAmount" - "previousAmount")
  OR (NOT "partialDispense" AND (
    ("insuranceOnly" AND kind = 'CREDIT' AND delta = 0 AND "insuranceDelta" < 0)
    OR (NOT "insuranceOnly" AND ("insuranceDelta" = 0 OR (
      "insuranceDelta" < 0 AND kind = 'CREDIT' AND delta < 0 AND "correctedAmount" = 0
      AND delta + "insuranceDelta" = -"previousAmount"
    )))
  ))
);
CREATE UNIQUE INDEX partial_dispense_credit_once ON "InvoiceAdjustment" ("invoiceId")
  WHERE "partialDispense" AND status IN ('PENDING', 'POSTED');

CREATE OR REPLACE FUNCTION effective_tracked_insurance_share(invoice_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT i."insuranceShare" + COALESCE(SUM(a."insuranceDelta"), 0)
  FROM "Invoice" i LEFT JOIN "InvoiceAdjustment" a ON a."invoiceId" = i.id AND a."hospitalId" = i."hospitalId"
    AND (a."insuranceOnly" OR a."partialDispense") AND a.status = 'POSTED'
  WHERE i.id = invoice_id GROUP BY i.id;
$$;

CREATE FUNCTION protect_partial_dispense_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."partialDispense" AND NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Partial dispense credit requires a pending request';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."partialDispense" THEN RAISE EXCEPTION 'Partial dispense credit is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."partialDispense" <> OLD."partialDispense" OR (OLD."partialDispense" AND (
    OLD.status <> 'PENDING' OR NEW.status NOT IN ('POSTED', 'REJECTED', 'CANCELLED')
    OR (to_jsonb(NEW) - ARRAY['status','reviewedById','reviewedAt','reviewReason','postingEntryId'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewedById','reviewedAt','reviewReason','postingEntryId'])
  )) THEN RAISE EXCEPTION 'Partial dispense credit is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER partial_dispense_credit_immutable BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION protect_partial_dispense_credit();

CREATE FUNCTION verify_partial_dispense_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Prescription" p
    JOIN "DispenseRecord" d ON d."prescriptionId" = p.id AND d."hospitalId" = p."hospitalId" AND d."partialClosureReason" IS NOT NULL
    JOIN "Invoice" i ON i.id = p."prepaidInvoiceId" AND i."hospitalId" = p."hospitalId"
    JOIN "EncounterCharge" c ON c.id = NEW."chargeId" AND c."invoiceId" = i.id AND c."sourceId" = p.id
      AND c."sourceType" = 'PHARMACY_PRESCRIPTION' AND c."hospitalId" = i."hospitalId"
    JOIN "AccountingEntry" e ON e.id = NEW."postingEntryId" AND e."hospitalId" = i."hospitalId"
    WHERE i.id = NEW."invoiceId" AND i."hospitalId" = NEW."hospitalId" AND p.status = 'PARTIALLY_COMPLETED'
      AND NEW."previousAmount" = i."totalAmount"
      AND NEW."correctedAmount" = (SELECT SUM(li."totalAmount") FROM "DispenseItem" li WHERE li."dispenseRecordId" = d.id)
      AND i."patientShare" + NEW.delta >= 0 AND i."insuranceShare" + NEW."insuranceDelta" >= 0
      AND e."postingKey" = concat('adjustment:', i."hospitalId", ':', NEW.id)
      AND (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = NEW."previousAmount" - NEW."correctedAmount"
      AND (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = NEW."previousAmount" - NEW."correctedAmount"
  ) THEN RAISE EXCEPTION 'Partial dispense credit must match the recorded quantities and journal'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER partial_dispense_credit_balanced AFTER UPDATE ON "InvoiceAdjustment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."partialDispense" AND NEW.status = 'POSTED')
  EXECUTE FUNCTION verify_partial_dispense_credit();
COMMIT;
