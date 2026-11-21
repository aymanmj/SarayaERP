BEGIN;

ALTER TABLE "InsuranceSettlementAllocation" ADD COLUMN "outstandingBefore" DECIMAL(18,3);
ALTER TABLE "InsuranceSettlementAllocation" DISABLE TRIGGER insurance_settlement_allocation_immutable;
UPDATE "InsuranceSettlementAllocation" SET "outstandingBefore" = amount;
ALTER TABLE "InsuranceSettlementAllocation" ENABLE TRIGGER insurance_settlement_allocation_immutable;
ALTER TABLE "InsuranceSettlementAllocation"
  ALTER COLUMN "outstandingBefore" SET NOT NULL,
  ADD CONSTRAINT insurance_settlement_allocation_amount_limit CHECK (amount <= "outstandingBefore");

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
          OR a."outstandingBefore" > i."insuranceShare"
          OR net_insurance_settlement_for_invoice(i.id) <> i."insuranceShare" - a."outstandingBefore" + a.amount
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
