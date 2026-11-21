BEGIN;
ALTER TABLE "GoodsReceipt" ADD COLUMN "requestKey" TEXT, ADD COLUMN "requestFingerprint" TEXT, ADD COLUMN "receiptVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "GoodsReceipt_requestKey_key" ON "GoodsReceipt"("requestKey");
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "grn_request_identity" CHECK (
 ("receiptVersion"=0 AND "requestKey" IS NULL AND "requestFingerprint" IS NULL) OR
 ("receiptVersion"=1 AND "requestKey" IS NOT NULL AND "requestFingerprint" IS NOT NULL AND "requestFingerprint" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "GoodsReceiptItem" ADD COLUMN "purchaseOrderItemId" INTEGER REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "unitPrice" DECIMAL(18,3), ADD COLUMN "unitCost" DECIMAL(18,3), ADD COLUMN "totalCost" DECIMAL(18,3);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "grn_item_cost_snapshot" CHECK (
 ("purchaseOrderItemId" IS NULL AND "unitPrice" IS NULL AND "unitCost" IS NULL AND "totalCost" IS NULL) OR
 ("purchaseOrderItemId" IS NOT NULL AND "unitPrice" IS NOT NULL AND "unitCost" IS NOT NULL AND "totalCost" IS NOT NULL AND "quantity">0 AND "baseQuantity">0 AND "unitPrice">=0 AND "unitCost">=0 AND "totalCost">=0)
);
CREATE FUNCTION protect_receipt_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "GoodsReceipt" WHERE id=OLD."goodsReceiptId" AND "receiptVersion"=1) THEN
  RAISE EXCEPTION 'Posted receipt items are immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_receipt_item_snapshot BEFORE UPDATE OR DELETE ON "GoodsReceiptItem" FOR EACH ROW EXECUTE FUNCTION protect_receipt_item_snapshot();
CREATE FUNCTION protect_receipt_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."receiptVersion"=1 THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Posted receipt cannot be deleted'; END IF;
  IF NEW."hospitalId" IS DISTINCT FROM OLD."hospitalId" OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId" OR
   NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId" OR NEW."receivedById" IS DISTINCT FROM OLD."receivedById" OR
   NEW."receivedDate" IS DISTINCT FROM OLD."receivedDate" OR NEW.status IS DISTINCT FROM OLD.status OR
   NEW."requestKey" IS DISTINCT FROM OLD."requestKey" OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint" OR NEW."receiptVersion" IS DISTINCT FROM OLD."receiptVersion" OR
   (OLD."purchaseInvoiceId" IS NOT NULL AND NEW."purchaseInvoiceId" IS DISTINCT FROM OLD."purchaseInvoiceId") OR
   (OLD."accountingEntryId" IS NOT NULL AND NEW."accountingEntryId" IS DISTINCT FROM OLD."accountingEntryId") OR
   (OLD."grnNumber" IS NOT NULL AND NEW."grnNumber" IS DISTINCT FROM OLD."grnNumber")
  THEN RAISE EXCEPTION 'Posted receipt snapshot cannot change'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_receipt_header BEFORE UPDATE OR DELETE ON "GoodsReceipt" FOR EACH ROW EXECUTE FUNCTION protect_receipt_header();
CREATE FUNCTION protect_received_order_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "GoodsReceiptItem" i JOIN "GoodsReceipt" g ON g.id=i."goodsReceiptId" WHERE i."purchaseOrderItemId"=OLD.id AND g."receiptVersion"=1) THEN
  RAISE EXCEPTION 'Received order terms require an amendment workflow';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_received_order_terms BEFORE UPDATE OF "unitPrice","quantity","baseQuantity","uomId","productId","purchaseOrderId" ON "PurchaseOrderItem" FOR EACH ROW EXECUTE FUNCTION protect_received_order_terms();
COMMIT;
