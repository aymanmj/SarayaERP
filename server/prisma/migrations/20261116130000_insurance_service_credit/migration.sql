BEGIN;

ALTER TABLE "InvoiceAdjustment" ADD COLUMN "insuranceOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InvoiceAdjustment" DROP CONSTRAINT "InvoiceAdjustment_insuranceDelta_full_credit";
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_insuranceDelta_full_credit" CHECK (
  ("insuranceOnly" AND kind = 'CREDIT' AND delta = 0 AND "insuranceDelta" < 0) OR
  (NOT "insuranceOnly" AND ("insuranceDelta" = 0 OR (
    "insuranceDelta" < 0 AND kind = 'CREDIT' AND delta < 0
    AND "correctedAmount" = 0 AND delta + "insuranceDelta" = -"previousAmount"
  )))
);

CREATE FUNCTION effective_tracked_insurance_share(invoice_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT i."insuranceShare" + COALESCE(SUM(a."insuranceDelta"), 0)
  FROM "Invoice" i LEFT JOIN "InvoiceAdjustment" a
    ON a."invoiceId" = i.id AND a."hospitalId" = i."hospitalId" AND a."insuranceOnly" AND a.status = 'POSTED'
  WHERE i.id = invoice_id GROUP BY i.id;
$$;

CREATE OR REPLACE FUNCTION expected_settlement_claim_status(allocation_id INTEGER) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE
    WHEN balance.net = 0 AND EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id AND w."hospitalId" = i."hospitalId" AND w."claimId" IS NULL) THEN 'WITHDRAWN'
    WHEN balance.net = effective_tracked_insurance_share(i.id) THEN 'PAID'
    WHEN balance.net > 0 THEN 'PARTIALLY_PAID'
    ELSE 'SUBMITTED'
  END
  FROM "InsuranceSettlementAllocation" a
  JOIN "Invoice" i ON i.id = a."invoiceId"
  CROSS JOIN LATERAL (SELECT net_insurance_settlement_for_invoice(i.id) AS net) balance
  WHERE a.id = allocation_id;
$$;

CREATE FUNCTION protect_insurance_service_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."insuranceOnly" AND NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Insurance service credit requires a pending request';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT OLD."insuranceOnly" THEN
    IF TG_OP = 'UPDATE' AND NEW."insuranceOnly" THEN
      RAISE EXCEPTION 'Invoice adjustment scope is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Insurance service credit history is immutable'; END IF;
  IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('POSTED','REJECTED','CANCELLED')
    OR (to_jsonb(NEW) - ARRAY['status','reviewedById','reviewedAt','reviewReason','postingEntryId'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewedById','reviewedAt','reviewReason','postingEntryId'])
  THEN
    RAISE EXCEPTION 'Insurance service credit history is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insurance_service_credit_immutable BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceAdjustment"
  FOR EACH ROW EXECUTE FUNCTION protect_insurance_service_credit();

CREATE FUNCTION verify_insurance_service_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Invoice" i
    JOIN "EncounterCharge" c ON c.id = NEW."chargeId" AND c."invoiceId" = i.id AND c."hospitalId" = i."hospitalId"
    JOIN "Prescription" p ON p."prepaidInvoiceId" = i.id AND p."hospitalId" = i."hospitalId" AND p.id = c."sourceId"
    JOIN "InsuranceSettlementAllocation" a ON a."invoiceId" = i.id
    JOIN "AccountingEntryLine" ar ON ar.id = a."originalReceivableId"
    JOIN "AccountingEntry" e ON e.id = NEW."postingEntryId" AND e."hospitalId" = i."hospitalId"
    WHERE i.id = NEW."invoiceId" AND i."hospitalId" = NEW."hospitalId"
      AND c."sourceType" = 'PHARMACY_PRESCRIPTION' AND p.status = 'COMPLETED'
      AND EXISTS (SELECT 1 FROM "DispenseRecord" d WHERE d."prescriptionId" = p.id)
      AND e."postingKey" = concat('adjustment:', i."hospitalId", ':', NEW.id)
      AND net_insurance_settlement_for_invoice(i.id) <= effective_tracked_insurance_share(i.id)
      AND i."claimStatus" = expected_settlement_claim_status(a.id)
      AND (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = ar."accountId") = -NEW."insuranceDelta"
      AND (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = -NEW."insuranceDelta"
      AND (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = -NEW."insuranceDelta"
  ) THEN
    RAISE EXCEPTION 'Insurance service credit must match the performed service, settlement and journal';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER insurance_service_credit_balanced AFTER UPDATE ON "InvoiceAdjustment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."insuranceOnly" AND NEW.status = 'POSTED')
  EXECUTE FUNCTION verify_insurance_service_credit();

CREATE OR REPLACE FUNCTION verify_insurance_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settlement_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'InsuranceSettlement' THEN
    settlement_id := NEW.id;
  ELSE
    settlement_id := NEW."settlementId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceSettlement" s
    JOIN "InsuranceProvider" p ON p.id = s."providerId" AND p."hospitalId" = s."hospitalId"
    JOIN "User" u ON u.id = s."recordedById" AND u."hospitalId" = s."hospitalId"
    JOIN "AccountingEntry" e ON e.id = s."postingEntryId" AND e."hospitalId" = s."hospitalId"
    WHERE s.id = settlement_id
      AND e."postingKey" LIKE ('insurance-claim-settlement:' || s."hospitalId" || ':%')
      AND s.amount = (SELECT SUM(a.amount) FROM "InsuranceSettlementAllocation" a WHERE a."settlementId" = s.id)
      AND s.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND s.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "Invoice" i ON i.id = a."invoiceId"
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        JOIN "AccountingEntry" original ON original.id = r."entryId"
        WHERE a."settlementId" = s.id AND (
          i."hospitalId" <> s."hospitalId" OR i."insuranceProviderId" IS DISTINCT FROM s."providerId"
          OR i."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(a.id)
          OR a."outstandingBefore" > effective_tracked_insurance_share(i.id)
          OR net_insurance_settlement_for_invoice(i.id) <> effective_tracked_insurance_share(i.id) - a."outstandingBefore" + a.amount
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR original."postingKey" IS DISTINCT FROM ('invoice:' || s."hospitalId" || ':' || i.id)
          OR original."hospitalId" <> s."hospitalId" OR r.debit <> i."insuranceShare" OR r.credit <> 0
          OR EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" other
            WHERE other."invoiceId" = i.id AND other."originalReceivableId" <> a."originalReceivableId"
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        WHERE a."settlementId" = s.id
        GROUP BY r."accountId"
        HAVING SUM(a.amount) IS DISTINCT FROM (
          SELECT SUM(credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = r."accountId"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Insurance settlement must match its allocations, original receivables and journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
