ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'GATEWAY_CLEARING_FEE_EXPENSE';
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'GATEWAY_CLEARING_FEE_PAYABLE';

BEGIN;

CREATE TABLE "GatewayClearingFeeEntry" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "claimBatchId" INTEGER NOT NULL,
    "eraTransactionId" INTEGER,
    "b2bInvoiceNumber" TEXT NOT NULL,
    "accrualRequestKey" TEXT NOT NULL,
    "settlementRequestKey" TEXT,
    "billableClaimsCount" INTEGER NOT NULL,
    "adjudicatedAmount" DECIMAL(18,3) NOT NULL,
    "flatFeePerClaim" DECIMAL(18,3) NOT NULL,
    "feeRate" DECIMAL(7,4) NOT NULL,
    "flatFeeTotal" DECIMAL(18,3) NOT NULL,
    "percentageFeeTotal" DECIMAL(18,3) NOT NULL,
    "totalFeeAmount" DECIMAL(18,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRUED',
    "settlementBankReference" TEXT,
    "expenseAccountId" INTEGER NOT NULL,
    "payableAccountId" INTEGER NOT NULL,
    "accrualEntryId" INTEGER NOT NULL,
    "settlementEntryId" INTEGER,
    "accruedById" INTEGER NOT NULL,
    "settledById" INTEGER,
    "accruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "GatewayClearingFeeEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GatewayClearingFeeEntry_status_check" CHECK ("status" IN ('ACCRUED', 'SETTLED')),
    CONSTRAINT "GatewayClearingFeeEntry_amounts_check" CHECK (
        "billableClaimsCount" > 0
        AND "adjudicatedAmount" >= 0
        AND "flatFeePerClaim" >= 0
        AND "feeRate" >= 0
        AND "feeRate" <= 0.2500
        AND "flatFeeTotal" >= 0
        AND "percentageFeeTotal" >= 0
        AND "totalFeeAmount" > 0
        AND "totalFeeAmount" = ("flatFeeTotal" + "percentageFeeTotal")
    ),
    CONSTRAINT "GatewayClearingFeeEntry_settlement_fields_check" CHECK (
        (
            "status" = 'ACCRUED'
            AND "settlementRequestKey" IS NULL
            AND "settlementBankReference" IS NULL
            AND "settlementEntryId" IS NULL
            AND "settledById" IS NULL
            AND "settledAt" IS NULL
        )
        OR (
            "status" = 'SETTLED'
            AND "settlementRequestKey" IS NOT NULL
            AND "settlementBankReference" IS NOT NULL
            AND "settlementEntryId" IS NOT NULL
            AND "settledById" IS NOT NULL
            AND "settledAt" IS NOT NULL
        )
    )
);

CREATE TABLE "BankStatementLine" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "importRequestKey" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "bankReference" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchRequestKey" TEXT,
    "matchedEraId" INTEGER,
    "matchedFeeEntryId" INTEGER,
    "importedById" INTEGER NOT NULL,
    "matchedById" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankStatementLine_direction_check" CHECK ("direction" IN ('CREDIT', 'DEBIT')),
    CONSTRAINT "BankStatementLine_status_check" CHECK ("status" IN ('UNMATCHED', 'MATCHED')),
    CONSTRAINT "BankStatementLine_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "BankStatementLine_match_fields_check" CHECK (
        (
            "status" = 'UNMATCHED'
            AND "matchRequestKey" IS NULL
            AND "matchedEraId" IS NULL
            AND "matchedFeeEntryId" IS NULL
            AND "matchedById" IS NULL
            AND "matchedAt" IS NULL
        )
        OR (
            "status" = 'MATCHED'
            AND "matchRequestKey" IS NOT NULL
            AND "matchedById" IS NOT NULL
            AND "matchedAt" IS NOT NULL
            AND (
                ("matchedEraId" IS NOT NULL AND "matchedFeeEntryId" IS NULL AND "direction" = 'CREDIT')
                OR ("matchedEraId" IS NULL AND "matchedFeeEntryId" IS NOT NULL AND "direction" = 'DEBIT')
            )
        )
    )
);

CREATE UNIQUE INDEX "GatewayClearingFeeEntry_claimBatchId_key" ON "GatewayClearingFeeEntry"("claimBatchId");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_eraTransactionId_key" ON "GatewayClearingFeeEntry"("eraTransactionId");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_b2bInvoiceNumber_key" ON "GatewayClearingFeeEntry"("b2bInvoiceNumber");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_accrualRequestKey_key" ON "GatewayClearingFeeEntry"("accrualRequestKey");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_settlementRequestKey_key" ON "GatewayClearingFeeEntry"("settlementRequestKey");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_accrualEntryId_key" ON "GatewayClearingFeeEntry"("accrualEntryId");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_settlementEntryId_key" ON "GatewayClearingFeeEntry"("settlementEntryId");
CREATE INDEX "GatewayClearingFeeEntry_hospitalId_status_accruedAt_idx" ON "GatewayClearingFeeEntry"("hospitalId", "status", "accruedAt");
CREATE INDEX "GatewayClearingFeeEntry_providerId_idx" ON "GatewayClearingFeeEntry"("providerId");
CREATE UNIQUE INDEX "GatewayClearingFeeEntry_hospitalId_settlementBankReference_key" ON "GatewayClearingFeeEntry"("hospitalId", "settlementBankReference");

CREATE UNIQUE INDEX "BankStatementLine_matchRequestKey_key" ON "BankStatementLine"("matchRequestKey");
CREATE UNIQUE INDEX "BankStatementLine_matchedEraId_key" ON "BankStatementLine"("matchedEraId");
CREATE UNIQUE INDEX "BankStatementLine_matchedFeeEntryId_key" ON "BankStatementLine"("matchedFeeEntryId");
CREATE INDEX "BankStatementLine_hospitalId_status_transactionDate_idx" ON "BankStatementLine"("hospitalId", "status", "transactionDate");
CREATE UNIQUE INDEX "BankStatementLine_hospitalId_direction_bankReference_key" ON "BankStatementLine"("hospitalId", "direction", "bankReference");

ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_claimBatchId_fkey" FOREIGN KEY ("claimBatchId") REFERENCES "ClaimBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_eraTransactionId_fkey" FOREIGN KEY ("eraTransactionId") REFERENCES "ERATransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_accrualEntryId_fkey" FOREIGN KEY ("accrualEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_settlementEntryId_fkey" FOREIGN KEY ("settlementEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_accruedById_fkey" FOREIGN KEY ("accruedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GatewayClearingFeeEntry" ADD CONSTRAINT "GatewayClearingFeeEntry_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedEraId_fkey" FOREIGN KEY ("matchedEraId") REFERENCES "ERATransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedFeeEntryId_fkey" FOREIGN KEY ("matchedFeeEntryId") REFERENCES "GatewayClearingFeeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION guard_gateway_clearing_fee_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Gateway clearing fee ledger entries are immutable' USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'ACCRUED' THEN
            RAISE EXCEPTION 'Gateway clearing fee entry must start in ACCRUED status' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM "ClaimBatch" b
            WHERE b.id = NEW."claimBatchId"
              AND b."hospitalId" = NEW."hospitalId"
              AND b."providerId" = NEW."providerId"
              AND b.status = 'CLOSED'
              AND b."clearingChannel" = 'LOCAL_CLEARINGHOUSE'
        ) THEN
            RAISE EXCEPTION 'Gateway clearing fee accrual requires a closed local clearinghouse batch in the same hospital' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'SETTLED' THEN
        RAISE EXCEPTION 'Settled gateway clearing fee entry is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'SETTLED' OR ROW(
        NEW.id, NEW."hospitalId", NEW."providerId", NEW."claimBatchId",
        NEW."eraTransactionId", NEW."b2bInvoiceNumber", NEW."accrualRequestKey",
        NEW."billableClaimsCount", NEW."adjudicatedAmount", NEW."flatFeePerClaim",
        NEW."feeRate", NEW."flatFeeTotal", NEW."percentageFeeTotal", NEW."totalFeeAmount",
        NEW."expenseAccountId", NEW."payableAccountId", NEW."accrualEntryId",
        NEW."accruedById", NEW."accruedAt"
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD."hospitalId", OLD."providerId", OLD."claimBatchId",
        OLD."eraTransactionId", OLD."b2bInvoiceNumber", OLD."accrualRequestKey",
        OLD."billableClaimsCount", OLD."adjudicatedAmount", OLD."flatFeePerClaim",
        OLD."feeRate", OLD."flatFeeTotal", OLD."percentageFeeTotal", OLD."totalFeeAmount",
        OLD."expenseAccountId", OLD."payableAccountId", OLD."accrualEntryId",
        OLD."accruedById", OLD."accruedAt"
    ) THEN
        RAISE EXCEPTION 'Gateway clearing fee accrual columns cannot be altered during settlement' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "AccountingEntry" e
        WHERE e.id = NEW."settlementEntryId" AND e."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Settling gateway clearing fee requires a journal entry in the same hospital' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER gateway_clearing_fee_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "GatewayClearingFeeEntry"
    FOR EACH ROW EXECUTE FUNCTION guard_gateway_clearing_fee_entry();

CREATE FUNCTION guard_bank_statement_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Imported bank statement lines cannot be deleted' USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'UNMATCHED' THEN
            RAISE EXCEPTION 'Bank statement line must be imported as UNMATCHED' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'MATCHED' THEN
        RAISE EXCEPTION 'Matched bank statement line is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'MATCHED' OR ROW(
        NEW.id, NEW."hospitalId", NEW."importRequestKey", NEW."bankName",
        NEW."accountNumber", NEW."bankReference", NEW."transactionDate",
        NEW.direction, NEW.amount, NEW.description, NEW."importedById", NEW."importedAt"
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD."hospitalId", OLD."importRequestKey", OLD."bankName",
        OLD."accountNumber", OLD."bankReference", OLD."transactionDate",
        OLD.direction, OLD.amount, OLD.description, OLD."importedById", OLD."importedAt"
    ) THEN
        RAISE EXCEPTION 'Bank statement line attributes are immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW."matchedEraId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ERATransaction" e
        WHERE e.id = NEW."matchedEraId" AND e."hospitalId" = NEW."hospitalId" AND e.status = 'RECONCILED'
    ) THEN
        RAISE EXCEPTION 'Matched ERA must be reconciled in the same hospital' USING ERRCODE = '23514';
    END IF;

    IF NEW."matchedFeeEntryId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "GatewayClearingFeeEntry" g
        WHERE g.id = NEW."matchedFeeEntryId" AND g."hospitalId" = NEW."hospitalId" AND g.status = 'SETTLED'
    ) THEN
        RAISE EXCEPTION 'Matched gateway fee entry must be settled in the same hospital' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER bank_statement_line_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "BankStatementLine"
    FOR EACH ROW EXECUTE FUNCTION guard_bank_statement_line();

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
      SELECT 1 FROM "GatewayClearingFeeEntry" g
      WHERE g."hospitalId" = NEW."hospitalId"
        AND (g."accrualEntryId" = NEW."sourceId" OR g."settlementEntryId" = NEW."sourceId")
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
