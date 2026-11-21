ALTER TABLE "InvoiceAdjustment"
  DROP CONSTRAINT "InvoiceAdjustment_valid_amounts",
  ADD CONSTRAINT "InvoiceAdjustment_valid_amounts"
    CHECK (
      "previousAmount" >= 0 AND "correctedAmount" >= 0
      AND delta + "insuranceDelta" = "correctedAmount" - "previousAmount"
      AND (
        (kind = 'CREDIT' AND delta + "insuranceDelta" < 0)
        OR (kind = 'DEBIT' AND delta + "insuranceDelta" > 0)
      )
    );
