BEGIN;

ALTER TABLE "ERATransaction"
  ADD COLUMN "postingRequestKey" TEXT;
CREATE UNIQUE INDEX "ERATransaction_postingRequestKey_key"
  ON "ERATransaction"("postingRequestKey");
CREATE INDEX "ERATransaction_hospitalId_bankReference_idx"
  ON "ERATransaction"("hospitalId", "bankReference");

ALTER TABLE "ERALineItem"
  ADD COLUMN "receiptId" INTEGER REFERENCES "ClaimReceipt"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ERALineItem_receiptId_key"
  ON "ERALineItem"("receiptId");

CREATE FUNCTION guard_era_transaction_reconciled() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'RECONCILED' THEN
      RAISE EXCEPTION 'Reconciled ERA transaction is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Reconciled ERA transaction is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'RECONCILED' AND NEW."totalPaid" > 0 AND (
    NEW."postingRequestKey" IS NULL
    OR NEW."bankReference" IS NULL
    OR LENGTH(TRIM(NEW."bankReference")) < 5
    OR NEW."reconciledById" IS NULL
  ) THEN
    RAISE EXCEPTION 'Paid ERA reconciliation requires verified bank reference, request key and actor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER era_transaction_reconciled_guard
  BEFORE UPDATE OR DELETE ON "ERATransaction"
  FOR EACH ROW EXECUTE FUNCTION guard_era_transaction_reconciled();

CREATE FUNCTION guard_era_line_item_reconciled() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ERATransaction" e
    WHERE e.id = OLD."eraId" AND e.status = 'RECONCILED'
  ) THEN
    RAISE EXCEPTION 'Line items of a reconciled ERA are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER era_line_item_reconciled_guard
  BEFORE UPDATE OR DELETE ON "ERALineItem"
  FOR EACH ROW EXECUTE FUNCTION guard_era_line_item_reconciled();

COMMIT;
