DROP INDEX "InsuranceSettlementAllocation_invoiceId_key";
DROP INDEX "InsuranceSettlementAllocation_originalReceivableId_key";
CREATE INDEX "InsuranceSettlementAllocation_invoiceId_idx" ON "InsuranceSettlementAllocation"("invoiceId");
CREATE INDEX "InsuranceSettlementAllocation_originalReceivableId_idx" ON "InsuranceSettlementAllocation"("originalReceivableId");
CREATE UNIQUE INDEX "InsuranceSettlementAllocation_settlementId_invoiceId_key" ON "InsuranceSettlementAllocation"("settlementId", "invoiceId");

CREATE FUNCTION net_insurance_settlement_for_invoice(invoice_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT COALESCE(SUM(a.amount - COALESCE((
    SELECT SUM(l.amount) FROM "InsuranceSettlementRefundLine" l
    JOIN "InsuranceSettlementRefund" r ON r.id = l."refundId"
    WHERE l."allocationId" = a.id AND r.status = 'POSTED'
  ), 0)), 0)
  FROM "InsuranceSettlementAllocation" a WHERE a."invoiceId" = invoice_id;
$$;

CREATE OR REPLACE FUNCTION expected_settlement_claim_status(allocation_id INTEGER) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE
    WHEN balance.net = i."insuranceShare" THEN 'PAID'
    WHEN balance.net > 0 THEN 'PARTIALLY_PAID'
    WHEN EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id AND w."hospitalId" = i."hospitalId" AND w."claimId" IS NULL) THEN 'WITHDRAWN'
    ELSE 'SUBMITTED'
  END
  FROM "InsuranceSettlementAllocation" a
  JOIN "Invoice" i ON i.id = a."invoiceId"
  CROSS JOIN LATERAL (SELECT net_insurance_settlement_for_invoice(i.id) AS net) balance
  WHERE a.id = allocation_id;
$$;

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
          OR i."claimStatus" IS DISTINCT FROM 'PAID' OR net_insurance_settlement_for_invoice(i.id) <> i."insuranceShare"
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR original."postingKey" IS DISTINCT FROM ('invoice:' || s."hospitalId" || ':' || i.id)
          OR original."hospitalId" <> s."hospitalId" OR r.debit <> i."insuranceShare" OR r.credit <> 0
          OR EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" other
            WHERE other."invoiceId" = i.id AND other."originalReceivableId" <> a."originalReceivableId"
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Insurance settlement must match its allocations, original receivables and journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
