ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'INSURANCE_UNALLOCATED_RECEIPTS';

BEGIN;

ALTER TABLE "InsuranceSettlement"
  ADD COLUMN "unallocatedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "unallocatedAccountId" INTEGER REFERENCES "Account"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT insurance_settlement_unallocated_valid CHECK (
    "unallocatedAmount" >= 0
    AND "unallocatedAmount" <= amount
    AND (
      ("unallocatedAmount" = 0 AND "unallocatedAccountId" IS NULL)
      OR ("unallocatedAmount" > 0 AND "unallocatedAccountId" IS NOT NULL)
    )
  );
CREATE INDEX "InsuranceSettlement_unallocatedAccountId_idx"
  ON "InsuranceSettlement"("unallocatedAccountId");

CREATE TABLE "InsuranceSettlementApplication" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "settlementId" INTEGER NOT NULL REFERENCES "InsuranceSettlement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  "postingEntryId" INTEGER NOT NULL REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "recordedById" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InsuranceSettlementApplication_requestKey_key"
  ON "InsuranceSettlementApplication"("requestKey");
CREATE UNIQUE INDEX "InsuranceSettlementApplication_postingEntryId_key"
  ON "InsuranceSettlementApplication"("postingEntryId");
CREATE INDEX "InsuranceSettlementApplication_settlementId_createdAt_idx"
  ON "InsuranceSettlementApplication"("settlementId", "createdAt");
CREATE INDEX "InsuranceSettlementApplication_hospitalId_createdAt_idx"
  ON "InsuranceSettlementApplication"("hospitalId", "createdAt");

ALTER TABLE "InsuranceSettlementAllocation"
  ADD COLUMN "applicationId" INTEGER REFERENCES "InsuranceSettlementApplication"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "InsuranceSettlementAllocation_settlementId_invoiceId_key";
CREATE INDEX "InsuranceSettlementAllocation_applicationId_idx"
  ON "InsuranceSettlementAllocation"("applicationId");
CREATE UNIQUE INDEX "InsuranceSettlementAllocation_applicationId_invoiceId_key"
  ON "InsuranceSettlementAllocation"("applicationId", "invoiceId");
CREATE UNIQUE INDEX "InsuranceSettlementAllocation_initial_settlement_invoice_key"
  ON "InsuranceSettlementAllocation"("settlementId", "invoiceId")
  WHERE "applicationId" IS NULL;

ALTER TABLE "InsuranceSettlementRefund"
  ADD COLUMN "unallocatedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0
  CHECK ("unallocatedAmount" >= 0 AND "unallocatedAmount" <= amount);

CREATE FUNCTION reserved_unallocated_for_settlement(settlement_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT COALESCE(
    (SELECT SUM(app.amount) FROM "InsuranceSettlementApplication" app WHERE app."settlementId" = settlement_id),
    0
  ) + COALESCE(
    (SELECT SUM(r."unallocatedAmount") FROM "InsuranceSettlementRefund" r
     WHERE r."settlementId" = settlement_id AND r.status IN ('PENDING', 'POSTED')),
    0
  );
$$;

CREATE FUNCTION guard_insurance_settlement_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  settlement_unallocated NUMERIC;
  settlement_account_id INTEGER;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Insurance settlement applications are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT s."unallocatedAmount", s."unallocatedAccountId"
    INTO settlement_unallocated, settlement_account_id
  FROM "InsuranceSettlement" s
  WHERE s.id = NEW."settlementId" AND s."hospitalId" = NEW."hospitalId"
  FOR UPDATE;
  IF NOT FOUND OR settlement_account_id IS NULL OR settlement_unallocated <= 0 THEN
    RAISE EXCEPTION 'Settlement has no unallocated insurance balance' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."recordedById" AND "hospitalId" = NEW."hospitalId"
  ) THEN
    RAISE EXCEPTION 'Invalid settlement application recorder' USING ERRCODE = '23514';
  END IF;
  IF reserved_unallocated_for_settlement(NEW."settlementId") + NEW.amount > settlement_unallocated THEN
    RAISE EXCEPTION 'Settlement application exceeds available unallocated balance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER insurance_settlement_application_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceSettlementApplication"
  FOR EACH ROW EXECUTE FUNCTION guard_insurance_settlement_application();

CREATE OR REPLACE FUNCTION guard_insurance_settlement_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  settlement_unallocated NUMERIC;
  settlement_account_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Settlement refund history is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT s."unallocatedAmount", s."unallocatedAccountId"
    INTO settlement_unallocated, settlement_account_id
  FROM "InsuranceSettlement" s
  WHERE s.id = NEW."settlementId" AND s."hospitalId" = NEW."hospitalId"
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."requestedById" AND "hospitalId" = NEW."hospitalId"
  ) OR (NEW."reviewedById" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."reviewedById" AND "hospitalId" = NEW."hospitalId"
  )) THEN
    RAISE EXCEPTION 'Invalid settlement refund scope' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Settlement refund requires a pending request' USING ERRCODE = '23514';
    END IF;
    IF NEW."unallocatedAmount" > 0 AND (
      settlement_account_id IS NULL
      OR settlement_unallocated <= 0
      OR reserved_unallocated_for_settlement(NEW."settlementId") + NEW."unallocatedAmount" > settlement_unallocated
    ) THEN
      RAISE EXCEPTION 'Settlement refund exceeds available unallocated balance' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status <> 'PENDING' OR NEW.status NOT IN ('POSTED','REJECTED')
    OR ROW(NEW.id, NEW."hospitalId", NEW."settlementId", NEW."requestKey", NEW.amount, NEW."unallocatedAmount", NEW.reason, NEW."requestedById", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id, OLD."hospitalId", OLD."settlementId", OLD."requestKey", OLD.amount, OLD."unallocatedAmount", OLD.reason, OLD."requestedById", OLD."createdAt"))
  THEN
    RAISE EXCEPTION 'Settlement refund history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_settled_insurance_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation_id INTEGER;
BEGIN
  SELECT id INTO allocation_id FROM "InsuranceSettlementAllocation" WHERE "invoiceId" = OLD.id LIMIT 1;
  IF FOUND AND (
    ROW(NEW."insuranceProviderId", NEW."insuranceShare", NEW."hospitalId", NEW.type)
      IS DISTINCT FROM ROW(OLD."insuranceProviderId", OLD."insuranceShare", OLD."hospitalId", OLD.type)
    OR (NEW.status = 'CANCELLED' AND OLD.status <> NEW.status)
    OR (NEW."claimStatus" IS DISTINCT FROM OLD."claimStatus"
      AND NEW."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(allocation_id))
  ) THEN
    RAISE EXCEPTION 'Settled insurance invoice requires a documented correction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION verify_insurance_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settlement_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'InsuranceSettlement' THEN
    settlement_id := NEW.id;
  ELSE
    IF NEW."applicationId" IS NOT NULL THEN
      RETURN NEW;
    END IF;
    settlement_id := NEW."settlementId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceSettlement" s
    JOIN "InsuranceProvider" p ON p.id = s."providerId" AND p."hospitalId" = s."hospitalId"
    JOIN "User" u ON u.id = s."recordedById" AND u."hospitalId" = s."hospitalId"
    JOIN "AccountingEntry" e ON e.id = s."postingEntryId" AND e."hospitalId" = s."hospitalId"
    WHERE s.id = settlement_id
      AND e."postingKey" LIKE ('insurance-claim-settlement:' || s."hospitalId" || ':%')
      AND s.amount = COALESCE((SELECT SUM(a.amount) FROM "InsuranceSettlementAllocation" a WHERE a."settlementId" = s.id AND a."applicationId" IS NULL), 0) + s."unallocatedAmount"
      AND s.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND s.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND 1 = (SELECT COUNT(*) FROM "AccountingEntryLine" l JOIN "Account" acc ON acc.id = l."accountId"
               WHERE l."entryId" = e.id AND l.debit > 0 AND acc."hospitalId" = s."hospitalId" AND acc.type = 'ASSET')
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "Invoice" i ON i.id = a."invoiceId"
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        JOIN "AccountingEntry" original ON original.id = r."entryId"
        WHERE a."settlementId" = s.id AND a."applicationId" IS NULL AND (
          i."hospitalId" <> s."hospitalId" OR i."insuranceProviderId" IS DISTINCT FROM s."providerId"
          OR i."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(a.id)
          OR a."outstandingBefore" > effective_tracked_insurance_share(i.id)
          OR net_insurance_settlement_for_invoice(i.id) <> effective_tracked_insurance_share(i.id) - a."outstandingBefore" + a.amount
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR original."postingKey" IS DISTINCT FROM ('invoice:' || s."hospitalId" || ':' || i.id)
          OR original."hospitalId" <> s."hospitalId" OR r.debit <> i."insuranceShare" OR r.credit <> 0
          OR r."accountId" IS NOT DISTINCT FROM s."unallocatedAccountId"
          OR EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" other
            WHERE other."invoiceId" = i.id AND other."originalReceivableId" <> a."originalReceivableId"
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        WHERE a."settlementId" = s.id AND a."applicationId" IS NULL
        GROUP BY r."accountId"
        HAVING SUM(a.amount) IS DISTINCT FROM (
          SELECT SUM(credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = r."accountId"
        )
      )
      AND (s."unallocatedAmount" = 0 OR (
        EXISTS (
          SELECT 1 FROM "Account" ua
          WHERE ua.id = s."unallocatedAccountId" AND ua."hospitalId" = s."hospitalId" AND ua.type = 'LIABILITY'
        )
        AND s."unallocatedAmount" = COALESCE(
          (SELECT SUM(l.credit) FROM "AccountingEntryLine" l
           WHERE l."entryId" = e.id AND l."accountId" = s."unallocatedAccountId" AND l.debit = 0),
          0
        )
        AND NOT EXISTS (
          SELECT 1 FROM "AccountingEntryLine" l
          WHERE l."entryId" = e.id AND l."accountId" = s."unallocatedAccountId" AND l.debit > 0
        )
      ))
      AND NOT EXISTS (
        SELECT 1 FROM "AccountingEntryLine" l
        WHERE l."entryId" = e.id AND l.credit > 0
          AND l."accountId" IS DISTINCT FROM s."unallocatedAccountId"
          AND NOT EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" a
            JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
            WHERE a."settlementId" = s.id AND a."applicationId" IS NULL AND r."accountId" = l."accountId"
          )
      )
  ) THEN
    RAISE EXCEPTION 'Insurance settlement must match its allocations, original receivables, unallocated liability and journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION verify_insurance_settlement_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'InsuranceSettlementApplication' THEN
    app_id := NEW.id;
  ELSE
    IF NEW."applicationId" IS NULL THEN
      RETURN NEW;
    END IF;
    app_id := NEW."applicationId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceSettlementApplication" app
    JOIN "InsuranceSettlement" s ON s.id = app."settlementId" AND s."hospitalId" = app."hospitalId"
    JOIN "InsuranceProvider" p ON p.id = s."providerId" AND p."hospitalId" = s."hospitalId"
    JOIN "User" u ON u.id = app."recordedById" AND u."hospitalId" = app."hospitalId"
    JOIN "AccountingEntry" e ON e.id = app."postingEntryId" AND e."hospitalId" = app."hospitalId"
    JOIN "Account" ua ON ua.id = s."unallocatedAccountId" AND ua."hospitalId" = s."hospitalId" AND ua.type = 'LIABILITY'
    WHERE app.id = app_id
      AND s."unallocatedAmount" > 0
      AND reserved_unallocated_for_settlement(s.id) <= s."unallocatedAmount"
      AND e."postingKey" = concat('insurance-', app."requestKey")
      AND app.amount = (SELECT SUM(a.amount) FROM "InsuranceSettlementAllocation" a WHERE a."applicationId" = app.id)
      AND app.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND app.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id)
      AND 1 = (SELECT COUNT(*) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l.debit > 0)
      AND app.amount = COALESCE(
        (SELECT SUM(l.debit) FROM "AccountingEntryLine" l
         WHERE l."entryId" = e.id AND l."accountId" = s."unallocatedAccountId" AND l.credit = 0),
        0
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AccountingEntryLine" l
        WHERE l."entryId" = e.id AND l."accountId" = s."unallocatedAccountId" AND l.credit > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "Invoice" i ON i.id = a."invoiceId"
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        JOIN "AccountingEntry" original ON original.id = r."entryId"
        WHERE a."applicationId" = app.id AND (
          a."settlementId" <> app."settlementId"
          OR i."hospitalId" <> s."hospitalId" OR i."insuranceProviderId" IS DISTINCT FROM s."providerId"
          OR i."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(a.id)
          OR a."outstandingBefore" > effective_tracked_insurance_share(i.id)
          OR net_insurance_settlement_for_invoice(i.id) <> effective_tracked_insurance_share(i.id) - a."outstandingBefore" + a.amount
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR original."postingKey" IS DISTINCT FROM ('invoice:' || s."hospitalId" || ':' || i.id)
          OR original."hospitalId" <> s."hospitalId" OR r.debit <> i."insuranceShare" OR r.credit <> 0
          OR r."accountId" = s."unallocatedAccountId"
          OR EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" other
            WHERE other."invoiceId" = i.id AND other."originalReceivableId" <> a."originalReceivableId"
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" a
        JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
        WHERE a."applicationId" = app.id
        GROUP BY r."accountId"
        HAVING SUM(a.amount) IS DISTINCT FROM (
          SELECT SUM(credit) FROM "AccountingEntryLine" l WHERE l."entryId" = e.id AND l."accountId" = r."accountId"
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AccountingEntryLine" l
        WHERE l."entryId" = e.id AND l.credit > 0
          AND NOT EXISTS (
            SELECT 1 FROM "InsuranceSettlementAllocation" a
            JOIN "AccountingEntryLine" r ON r.id = a."originalReceivableId"
            WHERE a."applicationId" = app.id AND r."accountId" = l."accountId"
          )
      )
  ) THEN
    RAISE EXCEPTION 'Insurance settlement credit application must match allocations and journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER insurance_settlement_application_balanced
  AFTER INSERT ON "InsuranceSettlementApplication"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement_application();
CREATE CONSTRAINT TRIGGER insurance_settlement_application_allocation_balanced
  AFTER INSERT ON "InsuranceSettlementAllocation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement_application();

CREATE OR REPLACE FUNCTION verify_insurance_settlement_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE refund_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'InsuranceSettlementRefund' THEN
    refund_id := NEW.id;
  ELSE
    refund_id := NEW."refundId";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceSettlementRefund" r
    JOIN "InsuranceSettlement" s ON s.id = r."settlementId" AND s."hospitalId" = r."hospitalId"
    WHERE r.id = refund_id
      AND r.amount = COALESCE((SELECT SUM(l.amount) FROM "InsuranceSettlementRefundLine" l WHERE l."refundId" = r.id), 0) + r."unallocatedAmount"
      AND r.amount > 0
      AND (r."unallocatedAmount" = 0 OR (
        s."unallocatedAccountId" IS NOT NULL
        AND reserved_unallocated_for_settlement(s.id) <= s."unallocatedAmount"
      ))
      AND (r.status <> 'POSTED' OR (
        EXISTS (SELECT 1 FROM "AccountingEntry" e WHERE e.id = r."postingEntryId"
          AND e."hospitalId" = r."hospitalId"
          AND e."postingKey" = concat('insurance-settlement-refund:', r."hospitalId", ':', r.id))
        AND r.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = r."postingEntryId")
        AND r.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = r."postingEntryId")
        AND NOT EXISTS (
          SELECT 1 FROM "InsuranceSettlementRefundLine" l
          JOIN "InsuranceSettlementAllocation" a ON a.id = l."allocationId"
          JOIN "Invoice" i ON i.id = a."invoiceId"
          WHERE l."refundId" = r.id AND i."claimStatus" IS DISTINCT FROM expected_settlement_claim_status(a.id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM "InsuranceSettlementRefundLine" l
          JOIN "InsuranceSettlementAllocation" a ON a.id = l."allocationId"
          JOIN "AccountingEntryLine" ar ON ar.id = a."originalReceivableId"
          WHERE l."refundId" = r.id
          GROUP BY ar."accountId"
          HAVING SUM(l.amount) IS DISTINCT FROM (
            SELECT SUM(debit) FROM "AccountingEntryLine" e WHERE e."entryId" = r."postingEntryId" AND e."accountId" = ar."accountId"
          )
        )
        AND (r."unallocatedAmount" = 0 OR (
          r."unallocatedAmount" = COALESCE(
            (SELECT SUM(e.debit) FROM "AccountingEntryLine" e
             WHERE e."entryId" = r."postingEntryId" AND e."accountId" = s."unallocatedAccountId" AND e.credit = 0),
            0
          )
        ))
      ))
  ) THEN
    RAISE EXCEPTION 'Settlement refund must match its allocations, unallocated balance, journal and invoice statuses' USING ERRCODE = '23514';
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
      SELECT 1 FROM "InsuranceSettlement" s
      WHERE s."postingEntryId" = NEW."sourceId" AND s."hospitalId" = NEW."hospitalId"
    ) OR EXISTS (
      SELECT 1 FROM "InsuranceSettlementApplication" app
      WHERE app."postingEntryId" = NEW."sourceId" AND app."hospitalId" = NEW."hospitalId"
    ) OR EXISTS (
      SELECT 1 FROM "InsuranceSettlementRefund" r
      WHERE r."postingEntryId" = NEW."sourceId" AND r."hospitalId" = NEW."hospitalId"
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
