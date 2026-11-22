ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'INSURANCE_BAD_DEBT_EXPENSE';

BEGIN;

CREATE TABLE "InsuranceClaimWriteOff" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceId" INTEGER NOT NULL REFERENCES "Invoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "originalReceivableId" INTEGER NOT NULL REFERENCES "AccountingEntryLine"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('CONTRACTUAL_ALLOWANCE', 'BAD_DEBT')),
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  "outstandingBefore" DECIMAL(18,3) NOT NULL CHECK ("outstandingBefore" >= amount),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'POSTED', 'REJECTED')),
  "requestedById" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewedById" INTEGER REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "reviewNote" TEXT,
  "writeOffAccountId" INTEGER REFERENCES "Account"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "postingEntryId" INTEGER REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT insurance_claim_writeoff_status_fields CHECK (
    (status <> 'POSTED' AND "postingEntryId" IS NULL AND "writeOffAccountId" IS NULL)
    OR (
      status = 'POSTED'
      AND "postingEntryId" IS NOT NULL
      AND "writeOffAccountId" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "reviewedById" <> "requestedById"
    )
  )
);

CREATE UNIQUE INDEX "InsuranceClaimWriteOff_requestKey_key"
  ON "InsuranceClaimWriteOff"("requestKey");
CREATE UNIQUE INDEX "InsuranceClaimWriteOff_postingEntryId_key"
  ON "InsuranceClaimWriteOff"("postingEntryId");
CREATE INDEX "InsuranceClaimWriteOff_invoiceId_status_idx"
  ON "InsuranceClaimWriteOff"("invoiceId", status);
CREATE INDEX "InsuranceClaimWriteOff_hospitalId_status_createdAt_idx"
  ON "InsuranceClaimWriteOff"("hospitalId", status, "createdAt");
CREATE INDEX "InsuranceClaimWriteOff_originalReceivableId_idx"
  ON "InsuranceClaimWriteOff"("originalReceivableId");
CREATE INDEX "InsuranceClaimWriteOff_writeOffAccountId_idx"
  ON "InsuranceClaimWriteOff"("writeOffAccountId");

CREATE FUNCTION posted_insurance_writeoff_for_invoice(invoice_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT COALESCE(SUM(w.amount), 0)
  FROM "InsuranceClaimWriteOff" w
  WHERE w."invoiceId" = invoice_id AND w.status = 'POSTED';
$$;

CREATE FUNCTION reserved_insurance_writeoff_for_invoice(invoice_id INTEGER) RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT COALESCE(SUM(w.amount), 0)
  FROM "InsuranceClaimWriteOff" w
  WHERE w."invoiceId" = invoice_id AND w.status IN ('PENDING', 'POSTED');
$$;

CREATE FUNCTION expected_insurance_claim_status(invoice_id INTEGER) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE
    WHEN settled.total = 0 AND EXISTS (
      SELECT 1 FROM "InsuranceClaimWithdrawal" w
      WHERE w."invoiceId" = i.id AND w."hospitalId" = i."hospitalId" AND w."claimId" IS NULL
    ) THEN 'WITHDRAWN'
    WHEN settled.total = effective_tracked_insurance_share(i.id) THEN 'PAID'
    WHEN settled.total > 0 THEN 'PARTIALLY_PAID'
    ELSE 'SUBMITTED'
  END
  FROM "Invoice" i
  CROSS JOIN LATERAL (
    SELECT net_insurance_settlement_for_invoice(i.id) + posted_insurance_writeoff_for_invoice(i.id) AS total
  ) settled
  WHERE i.id = invoice_id;
$$;

CREATE OR REPLACE FUNCTION expected_settlement_claim_status(allocation_id INTEGER) RETURNS TEXT LANGUAGE sql AS $$
  SELECT expected_insurance_claim_status(a."invoiceId")
  FROM "InsuranceSettlementAllocation" a
  WHERE a.id = allocation_id;
$$;

CREATE FUNCTION guard_insurance_claim_writeoff() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv_hospital_id INTEGER;
  inv_provider_id INTEGER;
  inv_share NUMERIC;
  inv_status TEXT;
  inv_type TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Insurance claim write-off history is immutable' USING ERRCODE = '23514';
  END IF;

  SELECT i."hospitalId", i."insuranceProviderId", i."insuranceShare", i.status, i.type
    INTO inv_hospital_id, inv_provider_id, inv_share, inv_status, inv_type
  FROM "Invoice" i
  WHERE i.id = NEW."invoiceId" AND i."hospitalId" = NEW."hospitalId"
  FOR UPDATE;

  IF NOT FOUND OR inv_provider_id IS NULL OR inv_type <> 'INVOICE' OR inv_status IN ('CANCELLED', 'DRAFT') THEN
    RAISE EXCEPTION 'Invalid invoice scope for insurance claim write-off' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."requestedById" AND "hospitalId" = NEW."hospitalId"
  ) OR (NEW."reviewedById" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = NEW."reviewedById" AND "hospitalId" = NEW."hospitalId"
  )) OR (NEW."reviewedById" IS NOT NULL AND NEW."reviewedById" = NEW."requestedById") THEN
    RAISE EXCEPTION 'Invalid reviewer or scope for insurance claim write-off' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Insurance claim write-off requires a pending request' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "InsuranceClaimWithdrawal" w
      WHERE w."invoiceId" = NEW."invoiceId" AND w."hospitalId" = NEW."hospitalId"
    ) THEN
      RAISE EXCEPTION 'Cannot write off a withdrawn insurance claim' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "AccountingEntryLine" r
      JOIN "AccountingEntry" e ON e.id = r."entryId"
      WHERE r.id = NEW."originalReceivableId"
        AND e."hospitalId" = NEW."hospitalId"
        AND e."postingKey" = ('invoice:' || NEW."hospitalId" || ':' || NEW."invoiceId")
        AND r.debit = inv_share
        AND r.credit = 0
    ) THEN
      RAISE EXCEPTION 'Invalid original insurance receivable for write-off' USING ERRCODE = '23514';
    END IF;
    IF net_insurance_settlement_for_invoice(NEW."invoiceId")
      + reserved_insurance_writeoff_for_invoice(NEW."invoiceId")
      + NEW.amount > effective_tracked_insurance_share(NEW."invoiceId") THEN
      RAISE EXCEPTION 'Insurance claim write-off exceeds available receivable balance' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.status <> 'PENDING'
    OR NEW.status NOT IN ('POSTED', 'REJECTED')
    OR ROW(
      NEW.id, NEW."hospitalId", NEW."invoiceId", NEW."originalReceivableId",
      NEW."requestKey", NEW.category, NEW.amount, NEW."outstandingBefore",
      NEW.reason, NEW."requestedById", NEW."createdAt"
    ) IS DISTINCT FROM ROW(
      OLD.id, OLD."hospitalId", OLD."invoiceId", OLD."originalReceivableId",
      OLD."requestKey", OLD.category, OLD.amount, OLD."outstandingBefore",
      OLD.reason, OLD."requestedById", OLD."createdAt"
    )
  ) THEN
    RAISE EXCEPTION 'Insurance claim write-off history is immutable' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER insurance_claim_writeoff_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceClaimWriteOff"
  FOR EACH ROW EXECUTE FUNCTION guard_insurance_claim_writeoff();

CREATE FUNCTION verify_insurance_claim_writeoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "InsuranceClaimWriteOff" w
    JOIN "Invoice" i ON i.id = w."invoiceId" AND i."hospitalId" = w."hospitalId"
    JOIN "AccountingEntryLine" r ON r.id = w."originalReceivableId"
    JOIN "AccountingEntry" original ON original.id = r."entryId" AND original."hospitalId" = w."hospitalId"
    WHERE w.id = NEW.id
      AND i."insuranceProviderId" IS NOT NULL
      AND original."postingKey" = ('invoice:' || w."hospitalId" || ':' || i.id)
      AND r.debit = i."insuranceShare"
      AND r.credit = 0
      AND net_insurance_settlement_for_invoice(i.id)
        + reserved_insurance_writeoff_for_invoice(i.id) <= effective_tracked_insurance_share(i.id)
      AND NOT EXISTS (
        SELECT 1 FROM "InsuranceSettlementAllocation" other
        WHERE other."invoiceId" = i.id AND other."originalReceivableId" <> w."originalReceivableId"
      )
      AND (w.status <> 'POSTED' OR (
        i."claimStatus" = expected_insurance_claim_status(i.id)
        AND EXISTS (
          SELECT 1 FROM "AccountingEntry" e
          WHERE e.id = w."postingEntryId"
            AND e."hospitalId" = w."hospitalId"
            AND e."postingKey" = concat('insurance-claim-writeoff:', w."hospitalId", ':', w.id)
        )
        AND EXISTS (
          SELECT 1 FROM "Account" wa
          WHERE wa.id = w."writeOffAccountId"
            AND wa."hospitalId" = w."hospitalId"
            AND wa.id <> r."accountId"
            AND (
              (w.category = 'CONTRACTUAL_ALLOWANCE' AND wa.type = 'CONTRA_REVENUE')
              OR (w.category = 'BAD_DEBT' AND wa.type = 'EXPENSE')
            )
        )
        AND w.amount = (SELECT SUM(l.debit) FROM "AccountingEntryLine" l WHERE l."entryId" = w."postingEntryId")
        AND w.amount = (SELECT SUM(l.credit) FROM "AccountingEntryLine" l WHERE l."entryId" = w."postingEntryId")
        AND w.amount = COALESCE((
          SELECT SUM(l.debit) FROM "AccountingEntryLine" l
          WHERE l."entryId" = w."postingEntryId" AND l."accountId" = w."writeOffAccountId" AND l.credit = 0
        ), 0)
        AND w.amount = COALESCE((
          SELECT SUM(l.credit) FROM "AccountingEntryLine" l
          WHERE l."entryId" = w."postingEntryId" AND l."accountId" = r."accountId" AND l.debit = 0
        ), 0)
      ))
  ) THEN
    RAISE EXCEPTION 'Insurance claim write-off must match receivable balance, ledger account and invoice status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER insurance_claim_writeoff_balanced
  AFTER INSERT OR UPDATE ON "InsuranceClaimWriteOff"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_claim_writeoff();

CREATE OR REPLACE FUNCTION protect_settled_insurance_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    EXISTS (SELECT 1 FROM "InsuranceSettlementAllocation" WHERE "invoiceId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "InsuranceClaimWriteOff" WHERE "invoiceId" = OLD.id AND status = 'POSTED')
  ) AND (
    ROW(NEW."insuranceProviderId", NEW."insuranceShare", NEW."hospitalId", NEW.type)
      IS DISTINCT FROM ROW(OLD."insuranceProviderId", OLD."insuranceShare", OLD."hospitalId", OLD.type)
    OR (NEW.status = 'CANCELLED' AND OLD.status <> NEW.status)
    OR (NEW."claimStatus" IS DISTINCT FROM OLD."claimStatus"
      AND NEW."claimStatus" IS DISTINCT FROM expected_insurance_claim_status(OLD.id))
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
          OR net_insurance_settlement_for_invoice(i.id) + posted_insurance_writeoff_for_invoice(i.id)
            <> effective_tracked_insurance_share(i.id) - a."outstandingBefore" + a.amount
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWriteOff" w WHERE w."invoiceId" = i.id AND w.status = 'PENDING')
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

CREATE OR REPLACE FUNCTION verify_insurance_settlement_application() RETURNS trigger LANGUAGE plpgsql AS $$
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
    JOIN "InsuranceProvider" p ON p.id = s."providerId" AND p."hospitalId" = app."hospitalId"
    JOIN "User" u ON u.id = app."recordedById" AND u."hospitalId" = app."hospitalId"
    JOIN "AccountingEntry" e ON e.id = app."postingEntryId" AND e."hospitalId" = app."hospitalId"
    JOIN "Account" ua ON ua.id = s."unallocatedAccountId" AND ua."hospitalId" = app."hospitalId" AND ua.type = 'LIABILITY'
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
          OR net_insurance_settlement_for_invoice(i.id) + posted_insurance_writeoff_for_invoice(i.id)
            <> effective_tracked_insurance_share(i.id) - a."outstandingBefore" + a.amount
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWithdrawal" w WHERE w."invoiceId" = i.id)
          OR EXISTS (SELECT 1 FROM "InsuranceClaimWriteOff" w WHERE w."invoiceId" = i.id AND w.status = 'PENDING')
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
      SELECT 1 FROM "InsuranceClaimWriteOff" w
      JOIN "AccountingEntryLine" l ON l.id = w."originalReceivableId"
      WHERE w.status = 'POSTED' AND w."hospitalId" = NEW."hospitalId"
        AND (w."postingEntryId" = NEW."sourceId" OR l."entryId" = NEW."sourceId")
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
