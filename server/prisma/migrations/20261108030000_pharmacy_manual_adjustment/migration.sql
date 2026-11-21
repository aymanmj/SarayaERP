BEGIN;
ALTER TABLE "StockTransaction" ADD COLUMN "manualRequestKey" TEXT, ADD COLUMN "manualFingerprint" TEXT;
CREATE UNIQUE INDEX "StockTransaction_manualRequestKey_key" ON "StockTransaction"("manualRequestKey");
ALTER TABLE "StockTransaction" ADD CONSTRAINT "stock_manual_adjustment_identity" CHECK (
 ("manualRequestKey" IS NULL AND "manualFingerprint" IS NULL) OR
 ("manualRequestKey" IS NOT NULL AND "manualFingerprint" IS NOT NULL AND "manualFingerprint" ~ '^[a-f0-9]{64}$' AND "referenceType" = 'PHARMACY_ADJUSTMENT' AND "type" = 'ADJUST' AND "quantity" <> 0 AND "quantity" = "baseQuantity" AND "unitCost" >= 0 AND "notes" IS NOT NULL AND length(btrim("notes")) BETWEEN 10 AND 500)
);
INSERT INTO "Permission" ("code","description") VALUES ('pharmacy:stock:adjust','تسوية مخزون الصيدلية بتكلفته المعتمدة') ON CONFLICT ("code") DO NOTHING;
COMMIT;
