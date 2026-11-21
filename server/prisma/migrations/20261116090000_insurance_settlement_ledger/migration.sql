CREATE TABLE "InsuranceSettlement" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL REFERENCES "Hospital"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "providerId" INTEGER NOT NULL REFERENCES "InsuranceProvider"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "bankReference" TEXT NOT NULL CHECK (length(btrim("bankReference")) BETWEEN 5 AND 200),
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0),
  "postingEntryId" INTEGER NOT NULL REFERENCES "AccountingEntry"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "recordedById" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InsuranceSettlement_postingEntryId_key" ON "InsuranceSettlement"("postingEntryId");
CREATE UNIQUE INDEX "InsuranceSettlement_hospitalId_bankReference_key" ON "InsuranceSettlement"("hospitalId", "bankReference");
CREATE INDEX "InsuranceSettlement_hospitalId_providerId_createdAt_idx" ON "InsuranceSettlement"("hospitalId", "providerId", "createdAt");

CREATE TABLE "InsuranceSettlementAllocation" (
  id SERIAL PRIMARY KEY,
  "settlementId" INTEGER NOT NULL REFERENCES "InsuranceSettlement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceId" INTEGER NOT NULL REFERENCES "Invoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "originalReceivableId" INTEGER NOT NULL REFERENCES "AccountingEntryLine"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount DECIMAL(18,3) NOT NULL CHECK (amount > 0)
);
CREATE UNIQUE INDEX "InsuranceSettlementAllocation_invoiceId_key" ON "InsuranceSettlementAllocation"("invoiceId");
CREATE UNIQUE INDEX "InsuranceSettlementAllocation_originalReceivableId_key" ON "InsuranceSettlementAllocation"("originalReceivableId");
CREATE INDEX "InsuranceSettlementAllocation_settlementId_idx" ON "InsuranceSettlementAllocation"("settlementId");

CREATE FUNCTION protect_insurance_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance settlement history is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER insurance_settlement_immutable BEFORE UPDATE OR DELETE ON "InsuranceSettlement"
  FOR EACH ROW EXECUTE FUNCTION protect_insurance_settlement();
CREATE TRIGGER insurance_settlement_allocation_immutable BEFORE UPDATE OR DELETE ON "InsuranceSettlementAllocation"
  FOR EACH ROW EXECUTE FUNCTION protect_insurance_settlement();

CREATE FUNCTION verify_insurance_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
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
          OR i."insuranceShare" <> a.amount OR i."claimStatus" IS DISTINCT FROM 'PAID'
          OR original."postingKey" IS DISTINCT FROM ('invoice:' || s."hospitalId" || ':' || i.id)
          OR original."hospitalId" <> s."hospitalId" OR r.debit <> a.amount OR r.credit <> 0
        )
      )
  ) THEN
    RAISE EXCEPTION 'Insurance settlement must match its allocations, original receivables and journal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER insurance_settlement_balanced AFTER INSERT ON "InsuranceSettlement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement();
CREATE CONSTRAINT TRIGGER insurance_settlement_allocation_balanced AFTER INSERT ON "InsuranceSettlementAllocation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_insurance_settlement();

CREATE FUNCTION protect_settled_insurance_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (ROW(NEW."insuranceProviderId", NEW."insuranceShare", NEW."claimStatus", NEW."hospitalId", NEW.type)
      IS DISTINCT FROM ROW(OLD."insuranceProviderId", OLD."insuranceShare", OLD."claimStatus", OLD."hospitalId", OLD.type)
      OR (NEW.status = 'CANCELLED' AND OLD.status <> NEW.status))
    AND EXISTS (SELECT 1 FROM "InsuranceSettlementAllocation" a WHERE a."invoiceId" = OLD.id)
  THEN
    RAISE EXCEPTION 'Settled insurance invoice requires a documented correction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settled_insurance_invoice_guard BEFORE UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION protect_settled_insurance_invoice();

CREATE FUNCTION block_settled_insurance_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceModule" = 'JOURNAL_REVERSAL' THEN
    PERFORM id FROM "AccountingEntry" WHERE id = NEW."sourceId" AND "hospitalId" = NEW."hospitalId" FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM "InsuranceSettlementAllocation" a
      JOIN "AccountingEntryLine" l ON l.id = a."originalReceivableId"
      JOIN "InsuranceSettlement" s ON s.id = a."settlementId"
      WHERE (l."entryId" = NEW."sourceId" OR s."postingEntryId" = NEW."sourceId")
        AND s."hospitalId" = NEW."hospitalId"
    ) THEN
      RAISE EXCEPTION 'Settled insurance accounting requires a documented correction' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settled_insurance_reversal_guard BEFORE INSERT ON "AccountingEntry"
  FOR EACH ROW EXECUTE FUNCTION block_settled_insurance_reversal();
