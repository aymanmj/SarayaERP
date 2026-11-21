BEGIN;

CREATE FUNCTION net_individual_claim_collection(claim_id INTEGER, hospital_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT COALESCE(SUM(r.amount - COALESCE((
    SELECT SUM(f.amount) FROM "ClaimReceiptRefund" f
    WHERE f."receiptId" = r.id AND f."hospitalId" = hospital_id AND f.status = 'POSTED'
  ), 0)), 0)
  FROM "ClaimReceipt" r WHERE r."claimId" = claim_id AND r."hospitalId" = hospital_id;
$$;

CREATE OR REPLACE FUNCTION claim_receipt_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  collected NUMERIC;
  effective_share NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM "ClaimReceipt" r WHERE r."claimId" = OLD.id AND r."hospitalId" = OLD."hospitalId") THEN
    collected := net_individual_claim_collection(OLD.id, OLD."hospitalId");
    effective_share := effective_tracked_insurance_share(OLD."invoiceId");
    IF NEW."hospitalId" <> OLD."hospitalId" OR NEW."invoiceId" <> OLD."invoiceId" OR NEW."claimedAmount" <> OLD."claimedAmount"
      OR COALESCE(NEW."paidAmount", 0) <> collected OR COALESCE(NEW."adjustmentAmount", 0) <> 0
      OR (collected > 0 AND collected < effective_share AND NEW.status <> 'PARTIALLY_PAID')
      OR (collected = effective_share AND NEW.status <> 'PAID' AND NOT (
        collected = 0 AND NEW.status = 'VOID' AND EXISTS (
          SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."claimId" = OLD.id
        )
      ))
      OR (collected = 0 AND effective_share > 0 AND NEW.status IN ('PAID','PARTIALLY_PAID'))
      OR collected < 0 OR collected > effective_share THEN
      RAISE EXCEPTION 'Claim collection balance and status must match its immutable receipt ledger';
    END IF;
  ELSIF COALESCE(NEW."paidAmount", 0) <> COALESCE(OLD."paidAmount", 0) THEN
    RAISE EXCEPTION 'Claim collections require an atomic receipt and journal workflow';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION verify_individual_insurance_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Claim" c
    JOIN "Invoice" i ON i.id = c."invoiceId" AND i."hospitalId" = NEW."hospitalId"
    JOIN "AccountingEntry" original ON original."postingKey" = concat('invoice:', i."hospitalId", ':', i.id)
      AND original."hospitalId" = i."hospitalId" AND original."sourceModule" = 'BILLING' AND original."sourceId" = i.id
    JOIN "AccountingEntryLine" ar ON ar."entryId" = original.id
      AND ar.description LIKE 'استحقاق تأمين (%' AND ar.debit = i."insuranceShare" AND ar.credit = 0
    JOIN "AccountingEntry" e ON e."postingKey" = concat('claim-receipt:', NEW."hospitalId", ':', NEW.id)
      AND e."hospitalId" = NEW."hospitalId" AND e."sourceModule" = 'CASHIER' AND e."sourceId" = NEW.id
    WHERE c.id = NEW."claimId" AND c."hospitalId" = NEW."hospitalId"
      AND i."claimStatus" = c.status::TEXT
      AND c."paidAmount" = net_individual_claim_collection(c.id, NEW."hospitalId")
      AND c.status::TEXT = CASE WHEN c."paidAmount" = effective_tracked_insurance_share(i.id) THEN 'PAID' ELSE 'PARTIALLY_PAID' END
      AND (SELECT COUNT(*) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = 2
      AND EXISTS (SELECT 1 FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = ar."accountId" AND l.credit = NEW.amount AND l.debit = 0)
      AND EXISTS (SELECT 1 FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" <> ar."accountId" AND l.debit = NEW.amount AND l.credit = 0)
  ) THEN
    RAISE EXCEPTION 'Individual insurer receipt must match the original receivable, journal and claim balance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER individual_insurance_receipt_balanced AFTER INSERT ON "ClaimReceipt"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_individual_insurance_receipt();

CREATE OR REPLACE FUNCTION verify_insurance_service_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Invoice" i
    JOIN "EncounterCharge" charge ON charge.id = NEW."chargeId" AND charge."invoiceId" = i.id AND charge."hospitalId" = i."hospitalId"
    JOIN "Prescription" p ON p."prepaidInvoiceId" = i.id AND p."hospitalId" = i."hospitalId" AND p.id = charge."sourceId"
    JOIN "AccountingEntry" original ON original."postingKey" = concat('invoice:', i."hospitalId", ':', i.id)
      AND original."hospitalId" = i."hospitalId" AND original."sourceModule" = 'BILLING' AND original."sourceId" = i.id
    JOIN "AccountingEntryLine" ar ON ar."entryId" = original.id
      AND ar.description LIKE 'استحقاق تأمين (%' AND ar.debit = i."insuranceShare" AND ar.credit = 0
    JOIN "AccountingEntry" e ON e.id = NEW."postingEntryId" AND e."hospitalId" = i."hospitalId"
    LEFT JOIN "Claim" c ON c."invoiceId" = i.id AND c."hospitalId" = i."hospitalId"
    WHERE i.id = NEW."invoiceId" AND i."hospitalId" = NEW."hospitalId"
      AND charge."sourceType" = 'PHARMACY_PRESCRIPTION' AND p.status = 'COMPLETED'
      AND EXISTS (SELECT 1 FROM "DispenseRecord" d WHERE d."prescriptionId" = p.id)
      AND e."postingKey" = concat('adjustment:', i."hospitalId", ':', NEW.id)
      AND (
        (c.id IS NULL AND net_insurance_settlement_for_invoice(i.id) <= effective_tracked_insurance_share(i.id)
          AND EXISTS (SELECT 1 FROM "InsuranceSettlementAllocation" a
            WHERE a."invoiceId" = i.id AND a."originalReceivableId" = ar.id
              AND i."claimStatus" = expected_settlement_claim_status(a.id)))
        OR (
          c."batchId" IS NULL AND c."claimedAmount" = i."insuranceShare" AND COALESCE(c."adjustmentAmount", 0) = 0
          AND (SELECT COUNT(*) FROM "Claim" x WHERE x."invoiceId" = i.id AND x."hospitalId" = i."hospitalId") = 1
          AND NOT EXISTS (SELECT 1 FROM "InsuranceSettlementAllocation" a WHERE a."invoiceId" = i.id)
          AND EXISTS (SELECT 1 FROM "ClaimReceipt" r WHERE r."claimId" = c.id AND r."hospitalId" = c."hospitalId")
          AND c."paidAmount" = net_individual_claim_collection(c.id, c."hospitalId")
          AND c."paidAmount" <= effective_tracked_insurance_share(i.id)
          AND (
            (c.status = 'VOID' AND c."paidAmount" = 0 AND effective_tracked_insurance_share(i.id) = 0
              AND i."claimStatus" = 'WITHDRAWN' AND EXISTS (
                SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."claimId" = c.id AND w."invoiceId" = i.id
              ))
            OR (c.status::TEXT = i."claimStatus" AND c.status::TEXT = CASE
              WHEN c."paidAmount" = effective_tracked_insurance_share(i.id) THEN 'PAID'
              WHEN c."paidAmount" = 0 THEN 'SUBMITTED' ELSE 'PARTIALLY_PAID' END)
          )
        )
      )
      AND (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = ar."accountId") = -NEW."insuranceDelta"
      AND (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = -NEW."insuranceDelta"
      AND (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id) = -NEW."insuranceDelta"
  ) THEN
    RAISE EXCEPTION 'Insurance service credit must match the performed service, settlement and journal';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION block_settled_insurance_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceModule" = 'JOURNAL_REVERSAL' THEN
    PERFORM id FROM "AccountingEntry" WHERE id = NEW."sourceId" AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM "InsuranceSettlementAllocation" a
      JOIN "AccountingEntryLine" l ON l.id = a."originalReceivableId"
      JOIN "InsuranceSettlement" s ON s.id = a."settlementId"
      WHERE (l."entryId" = NEW."sourceId" OR s."postingEntryId" = NEW."sourceId")
        AND s."hospitalId" = NEW."hospitalId"
    ) OR EXISTS (
      SELECT 1 FROM "AccountingEntry" e JOIN "Claim" c
        ON c."invoiceId" = e."sourceId" AND c."hospitalId" = e."hospitalId"
      JOIN "ClaimReceipt" r ON r."claimId" = c.id AND r."hospitalId" = c."hospitalId"
      WHERE e.id = NEW."sourceId" AND e."hospitalId" = NEW."hospitalId"
        AND e."postingKey" = concat('invoice:', e."hospitalId", ':', e."sourceId")
    ) THEN
      RAISE EXCEPTION 'Settled insurance accounting requires a documented correction' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
