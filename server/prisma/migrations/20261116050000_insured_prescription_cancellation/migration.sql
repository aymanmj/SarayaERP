ALTER TABLE "InvoiceAdjustment"
  ADD COLUMN "insuranceDelta" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "InvoiceAdjustment_insuranceDelta_full_credit"
    CHECK (
      "insuranceDelta" = 0 OR (
        "insuranceDelta" < 0 AND kind = 'CREDIT' AND delta < 0
        AND "correctedAmount" = 0 AND delta + "insuranceDelta" = -"previousAmount"
      )
    );
