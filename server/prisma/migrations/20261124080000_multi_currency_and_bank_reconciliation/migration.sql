-- CAP09: Multi-Currency Exchange Rate Ledger (DECIMAL 19,6) & General Bank Reconciliation
-- Migration #71

ALTER TYPE "AccountingSourceModule" ADD VALUE IF NOT EXISTS 'BANK_RECONCILIATION';
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'FX_GAIN_LOSS';
ALTER TYPE "SystemAccountKey" ADD VALUE IF NOT EXISTS 'BANK_CHARGES_EXPENSE';

CREATE TABLE "Currency" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "nameAr" VARCHAR(100) NOT NULL,
    "nameEn" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 3,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Currency_code_iso_chk" CHECK ("code" ~ '^[A-Z]{3}$'),
    CONSTRAINT "Currency_decimal_places_chk" CHECK ("decimalPlaces" BETWEEN 0 AND 4),
    CONSTRAINT "Currency_nonempty_names_chk" CHECK (btrim("nameAr") <> '' AND btrim("nameEn") <> '' AND btrim("symbol") <> '')
);

CREATE UNIQUE INDEX "Currency_hospitalId_code_key" ON "Currency"("hospitalId", "code");
CREATE INDEX "Currency_hospitalId_isActive_idx" ON "Currency"("hospitalId", "isActive");
CREATE UNIQUE INDEX "Currency_one_base_per_hospital_idx" ON "Currency"("hospitalId") WHERE "isBase" = true;

ALTER TABLE "Currency"
    ADD CONSTRAINT "Currency_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Currency_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExchangeRate" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "fromCurrencyId" INTEGER NOT NULL,
    "toCurrencyId" INTEGER NOT NULL,
    "rate" DECIMAL(19,6) NOT NULL,
    "inverseRate" DECIMAL(19,6) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "referenceNote" VARCHAR(250),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExchangeRate_distinct_currencies_chk" CHECK ("fromCurrencyId" <> "toCurrencyId"),
    CONSTRAINT "ExchangeRate_positive_rates_chk" CHECK ("rate" > 0 AND "inverseRate" > 0),
    CONSTRAINT "ExchangeRate_source_chk" CHECK ("source" IN ('CBL_OFFICIAL', 'MANUAL', 'COMMERCIAL_BANK', 'API_FEED')),
    CONSTRAINT "ExchangeRate_verification_chk" CHECK (
        ("isVerified" = false AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)
        OR ("isVerified" = true AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedById" <> "createdById")
    )
);

CREATE UNIQUE INDEX "ExchangeRate_hospitalId_fromCurrencyId_toCurrencyId_effecti_key"
    ON "ExchangeRate"("hospitalId", "fromCurrencyId", "toCurrencyId", "effectiveDate", "source");
CREATE INDEX "ExchangeRate_hospitalId_fromCurrencyId_toCurrencyId_effecti_idx"
    ON "ExchangeRate"("hospitalId", "fromCurrencyId", "toCurrencyId", "effectiveDate");

ALTER TABLE "ExchangeRate"
    ADD CONSTRAINT "ExchangeRate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ExchangeRate_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ExchangeRate_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ExchangeRate_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_exchange_rate()
RETURNS TRIGGER AS $$
DECLARE
    v_from_hosp INTEGER;
    v_to_hosp INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ExchangeRate rows are append-only audit records and cannot be deleted (id=%)', OLD.id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."hospitalId" <> NEW."hospitalId"
           OR OLD."fromCurrencyId" <> NEW."fromCurrencyId"
           OR OLD."toCurrencyId" <> NEW."toCurrencyId"
           OR OLD."rate" <> NEW."rate"
           OR OLD."inverseRate" <> NEW."inverseRate"
           OR OLD."effectiveDate" <> NEW."effectiveDate"
           OR OLD."source" <> NEW."source"
           OR OLD."createdById" <> NEW."createdById" THEN
            RAISE EXCEPTION 'ExchangeRate financial fields are immutable after creation (id=%)', OLD.id;
        END IF;

        IF OLD."isVerified" = true THEN
            RAISE EXCEPTION 'Verified ExchangeRate cannot be modified (id=%)', OLD.id;
        END IF;
    END IF;

    SELECT "hospitalId" INTO v_from_hosp FROM "Currency" WHERE "id" = NEW."fromCurrencyId";
    SELECT "hospitalId" INTO v_to_hosp FROM "Currency" WHERE "id" = NEW."toCurrencyId";

    IF v_from_hosp IS DISTINCT FROM NEW."hospitalId" OR v_to_hosp IS DISTINCT FROM NEW."hospitalId" THEN
        RAISE EXCEPTION 'ExchangeRate currencies must belong to the same hospital';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exchange_rate_guard
BEFORE INSERT OR UPDATE OR DELETE ON "ExchangeRate"
FOR EACH ROW EXECUTE FUNCTION guard_exchange_rate();

CREATE TABLE "BankAccount" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "currencyId" INTEGER NOT NULL,
    "bankName" VARCHAR(150) NOT NULL,
    "branchName" VARCHAR(150),
    "accountNumber" VARCHAR(64) NOT NULL,
    "iban" VARCHAR(64),
    "swiftCode" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankAccount_nonempty_chk" CHECK (btrim("bankName") <> '' AND btrim("accountNumber") <> '')
);

CREATE UNIQUE INDEX "BankAccount_accountId_key" ON "BankAccount"("accountId");
CREATE UNIQUE INDEX "BankAccount_hospitalId_accountNumber_key" ON "BankAccount"("hospitalId", "accountNumber");
CREATE INDEX "BankAccount_hospitalId_isActive_idx" ON "BankAccount"("hospitalId", "isActive");
CREATE INDEX "BankAccount_currencyId_idx" ON "BankAccount"("currencyId");

ALTER TABLE "BankAccount"
    ADD CONSTRAINT "BankAccount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankAccount_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_bank_account()
RETURNS TRIGGER AS $$
DECLARE
    v_acc_hosp INTEGER;
    v_acc_type "AccountType";
    v_curr_hosp INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BankAccount records cannot be deleted; deactivate instead (id=%)', OLD.id;
    END IF;

    SELECT "hospitalId", "type" INTO v_acc_hosp, v_acc_type FROM "Account" WHERE "id" = NEW."accountId";
    IF v_acc_hosp IS DISTINCT FROM NEW."hospitalId" THEN
        RAISE EXCEPTION 'BankAccount GL Account must belong to the same hospital';
    END IF;
    IF v_acc_type IS DISTINCT FROM 'ASSET'::"AccountType" THEN
        RAISE EXCEPTION 'BankAccount must link to an ASSET GL Account';
    END IF;

    SELECT "hospitalId" INTO v_curr_hosp FROM "Currency" WHERE "id" = NEW."currencyId";
    IF v_curr_hosp IS DISTINCT FROM NEW."hospitalId" THEN
        RAISE EXCEPTION 'BankAccount Currency must belong to the same hospital';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_account_guard
BEFORE INSERT OR UPDATE OR DELETE ON "BankAccount"
FOR EACH ROW EXECUTE FUNCTION guard_bank_account();

CREATE TABLE "BankReconciliationSession" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "statementNumber" VARCHAR(80) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalanceBank" DECIMAL(18,3) NOT NULL,
    "closingBalanceBank" DECIMAL(18,3) NOT NULL,
    "bookBalanceAsOfEnd" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reconciledBalance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "differenceAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparedById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliationSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankReconciliationSession_period_chk" CHECK ("periodEnd" >= "periodStart"),
    CONSTRAINT "BankReconciliationSession_statement_chk" CHECK (btrim("statementNumber") <> ''),
    CONSTRAINT "BankReconciliationSession_status_chk" CHECK ("status" IN ('DRAFT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED')),
    CONSTRAINT "BankReconciliationSession_close_integrity_chk" CHECK (
        "status" <> 'CLOSED'
        OR ("differenceAmount" = 0 AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedById" <> "preparedById")
    )
);

CREATE UNIQUE INDEX "BankReconciliationSession_hospitalId_bankAccountId_statemen_key"
    ON "BankReconciliationSession"("hospitalId", "bankAccountId", "statementNumber");
CREATE INDEX "BankReconciliationSession_hospitalId_bankAccountId_periodEn_idx"
    ON "BankReconciliationSession"("hospitalId", "bankAccountId", "periodEnd");
CREATE INDEX "BankReconciliationSession_hospitalId_status_idx"
    ON "BankReconciliationSession"("hospitalId", "status");

ALTER TABLE "BankReconciliationSession"
    ADD CONSTRAINT "BankReconciliationSession_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankReconciliationSession_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankReconciliationSession_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BankReconciliationSession_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_bank_reconciliation_session()
RETURNS TRIGGER AS $$
DECLARE
    v_bank_hosp INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'BankReconciliationSession records cannot be deleted (id=%)', OLD.id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."status" = 'CLOSED' THEN
            RAISE EXCEPTION 'Closed BankReconciliationSession is immutable (id=%)', OLD.id;
        END IF;
        IF OLD."hospitalId" <> NEW."hospitalId" OR OLD."bankAccountId" <> NEW."bankAccountId" THEN
            RAISE EXCEPTION 'BankReconciliationSession hospitalId and bankAccountId are immutable';
        END IF;
    END IF;

    SELECT "hospitalId" INTO v_bank_hosp FROM "BankAccount" WHERE "id" = NEW."bankAccountId";
    IF v_bank_hosp IS DISTINCT FROM NEW."hospitalId" THEN
        RAISE EXCEPTION 'BankReconciliationSession BankAccount must belong to the same hospital';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_reconciliation_session_guard
BEFORE INSERT OR UPDATE OR DELETE ON "BankReconciliationSession"
FOR EACH ROW EXECUTE FUNCTION guard_bank_reconciliation_session();

CREATE TABLE "TreasuryBankStatementItem" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "reference" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "foreignCurrencyId" INTEGER,
    "foreignAmount" DECIMAL(18,3),
    "exchangeRateUsed" DECIMAL(19,6),
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedEntryLineId" INTEGER,
    "adjustmentEntryId" INTEGER,
    "matchedById" INTEGER,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryBankStatementItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TreasuryBankStatementItem_amount_pos_chk" CHECK ("amount" > 0),
    CONSTRAINT "TreasuryBankStatementItem_ref_nonempty_chk" CHECK (btrim("reference") <> ''),
    CONSTRAINT "TreasuryBankStatementItem_direction_chk" CHECK ("direction" IN ('CREDIT', 'DEBIT')),
    CONSTRAINT "TreasuryBankStatementItem_status_chk" CHECK ("matchStatus" IN ('UNMATCHED', 'MATCHED_GL', 'ADJUSTED_GL', 'EXCLUDED')),
    CONSTRAINT "TreasuryBankStatementItem_fx_chk" CHECK (
        ("foreignCurrencyId" IS NULL AND "foreignAmount" IS NULL AND "exchangeRateUsed" IS NULL)
        OR ("foreignCurrencyId" IS NOT NULL AND "foreignAmount" > 0 AND "exchangeRateUsed" > 0)
    )
);

CREATE UNIQUE INDEX "TreasuryBankStatementItem_matchedEntryLineId_key" ON "TreasuryBankStatementItem"("matchedEntryLineId");
CREATE UNIQUE INDEX "TreasuryBankStatementItem_adjustmentEntryId_key" ON "TreasuryBankStatementItem"("adjustmentEntryId");
CREATE UNIQUE INDEX "TreasuryBankStatementItem_hospitalId_bankAccountId_directio_key"
    ON "TreasuryBankStatementItem"("hospitalId", "bankAccountId", "direction", "reference", "transactionDate", "amount");
CREATE INDEX "TreasuryBankStatementItem_sessionId_matchStatus_idx"
    ON "TreasuryBankStatementItem"("sessionId", "matchStatus");
CREATE INDEX "TreasuryBankStatementItem_hospitalId_bankAccountId_transact_idx"
    ON "TreasuryBankStatementItem"("hospitalId", "bankAccountId", "transactionDate");

ALTER TABLE "TreasuryBankStatementItem"
    ADD CONSTRAINT "TreasuryBankStatementItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BankReconciliationSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_foreignCurrencyId_fkey" FOREIGN KEY ("foreignCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_matchedEntryLineId_fkey" FOREIGN KEY ("matchedEntryLineId") REFERENCES "AccountingEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_adjustmentEntryId_fkey" FOREIGN KEY ("adjustmentEntryId") REFERENCES "AccountingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TreasuryBankStatementItem_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_treasury_statement_item()
RETURNS TRIGGER AS $$
DECLARE
    v_sess_status TEXT;
    v_sess_hosp INTEGER;
    v_sess_bank INTEGER;
    v_bank_gl_account INTEGER;
    v_line_account INTEGER;
    v_line_hosp INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT "status" INTO v_sess_status FROM "BankReconciliationSession" WHERE "id" = OLD."sessionId";
        IF v_sess_status = 'CLOSED' OR OLD."matchStatus" <> 'UNMATCHED' THEN
            RAISE EXCEPTION 'Cannot delete matched/adjusted statement item or item in CLOSED session (id=%)', OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    SELECT "status", "hospitalId", "bankAccountId"
      INTO v_sess_status, v_sess_hosp, v_sess_bank
      FROM "BankReconciliationSession"
     WHERE "id" = NEW."sessionId";

    IF v_sess_status = 'CLOSED' THEN
        RAISE EXCEPTION 'Cannot insert or modify TreasuryBankStatementItem in a CLOSED reconciliation session';
    END IF;

    IF v_sess_hosp IS DISTINCT FROM NEW."hospitalId" OR v_sess_bank IS DISTINCT FROM NEW."bankAccountId" THEN
        RAISE EXCEPTION 'TreasuryBankStatementItem hospitalId/bankAccountId must match parent BankReconciliationSession';
    END IF;

    IF NEW."matchedEntryLineId" IS NOT NULL THEN
        SELECT "accountId" INTO v_bank_gl_account FROM "BankAccount" WHERE "id" = NEW."bankAccountId";
        SELECT l."accountId", e."hospitalId"
          INTO v_line_account, v_line_hosp
          FROM "AccountingEntryLine" l
          JOIN "AccountingEntry" e ON e."id" = l."entryId"
         WHERE l."id" = NEW."matchedEntryLineId";

        IF v_line_hosp IS DISTINCT FROM NEW."hospitalId" OR v_line_account IS DISTINCT FROM v_bank_gl_account THEN
            RAISE EXCEPTION 'Matched GL entry line must belong to the same hospital and BankAccount GL account';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER treasury_statement_item_guard
BEFORE INSERT OR UPDATE OR DELETE ON "TreasuryBankStatementItem"
FOR EACH ROW EXECUTE FUNCTION guard_treasury_statement_item();
