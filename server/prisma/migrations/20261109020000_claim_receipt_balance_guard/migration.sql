-- Financial claim status follows the immutable receipt ledger, including across older status/ERA writers.
CREATE FUNCTION claim_receipt_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE collected DECIMAL(18,3);
BEGIN
 SELECT COALESCE(SUM("amount"),0) INTO collected FROM "ClaimReceipt" WHERE "claimId"=OLD.id AND "hospitalId"=OLD."hospitalId";
 IF collected>0 THEN
  IF NEW."hospitalId"<>OLD."hospitalId" OR NEW."invoiceId"<>OLD."invoiceId" OR NEW."claimedAmount"<>OLD."claimedAmount" OR COALESCE(NEW."paidAmount",0)<>collected OR COALESCE(NEW."adjustmentAmount",0)<>0 OR
   (collected<NEW."claimedAmount" AND NEW.status<>'PARTIALLY_PAID') OR (collected=NEW."claimedAmount" AND NEW.status<>'PAID') OR collected>NEW."claimedAmount" THEN
   RAISE EXCEPTION 'Claim collection balance and status must match its immutable receipt ledger';
  END IF;
 ELSIF COALESCE(NEW."paidAmount",0)<>COALESCE(OLD."paidAmount",0) THEN
  RAISE EXCEPTION 'Claim collections require an atomic receipt and journal workflow';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER claim_receipt_balance_guard BEFORE UPDATE ON "Claim" FOR EACH ROW EXECUTE FUNCTION claim_receipt_balance_guard();
