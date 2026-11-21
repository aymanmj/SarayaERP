BEGIN;
CREATE TYPE "RecallContactAudience" AS ENUM ('PATIENT', 'DEPARTMENT');
CREATE TYPE "RecallContactOutcome" AS ENUM ('ATTEMPTED', 'NOTIFIED', 'RESOLVED');
CREATE TYPE "RecallContactChannel" AS ENUM ('PHONE', 'IN_PERSON', 'SECURE_MESSAGE', 'INTERNAL_HANDOFF');
CREATE TABLE "InventoryRecallContact" (
  id SERIAL PRIMARY KEY,
  "hospitalId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "batchNumber" TEXT NOT NULL,
  "movementId" INTEGER NOT NULL REFERENCES "StockTransaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  audience "RecallContactAudience" NOT NULL,
  "targetId" INTEGER NOT NULL CHECK ("targetId" > 0),
  outcome "RecallContactOutcome" NOT NULL,
  channel "RecallContactChannel" NOT NULL,
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 5 AND 1000),
  "recordedById" INTEGER NOT NULL,
  "requestId" UUID NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_recall_contact_recall_fkey
    FOREIGN KEY ("hospitalId", "productId", "batchNumber")
    REFERENCES "InventoryBatchRestriction" ("hospitalId", "productId", "batchNumber") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT inventory_recall_patient_channel CHECK (audience <> 'PATIENT' OR channel <> 'INTERNAL_HANDOFF')
);
CREATE UNIQUE INDEX "InventoryRecallContact_hospitalId_requestId_key" ON "InventoryRecallContact" ("hospitalId", "requestId");
CREATE INDEX inventory_recall_contact_target_idx ON "InventoryRecallContact" ("hospitalId", "productId", "batchNumber", audience, "targetId", id);

CREATE FUNCTION guard_recall_contact_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_outcome "RecallContactOutcome";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Recall contact history is append-only' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "InventoryBatchRestriction" r
    WHERE r."hospitalId" = NEW."hospitalId" AND r."productId" = NEW."productId"
      AND r."batchNumber" = NEW."batchNumber" AND r.status = 'RECALLED' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM "StockTransaction" m WHERE m.id = NEW."movementId" AND m."hospitalId" = NEW."hospitalId"
      AND m."productId" = NEW."productId" AND btrim(m."batchNumber") = NEW."batchNumber"
      AND (m.type = 'OUT' OR m."referenceType" = 'MATERIAL_RECEIVE')
  ) THEN
    RAISE EXCEPTION 'Recall contact must reference a movement of the recalled batch' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = NEW."recordedById" AND u."isActive" AND NOT u."isDeleted"
      AND (u."hospitalId" = NEW."hospitalId" OR EXISTS (
        SELECT 1 FROM "UserHospitalAccess" a WHERE a."userId" = u.id AND a."hospitalId" = NEW."hospitalId"
      ))
  ) OR (
    NEW.audience = 'PATIENT' AND NOT EXISTS (SELECT 1 FROM "Patient" p WHERE p.id = NEW."targetId" AND p."hospitalId" = NEW."hospitalId")
  ) OR (
    NEW.audience = 'DEPARTMENT' AND NOT EXISTS (SELECT 1 FROM "Department" d WHERE d.id = NEW."targetId" AND d."hospitalId" = NEW."hospitalId")
  ) THEN
    RAISE EXCEPTION 'Recall contact actor and recipient must belong to the facility' USING ERRCODE = '23514';
  END IF;
  SELECT c.outcome INTO previous_outcome FROM "InventoryRecallContact" c
    WHERE c."hospitalId" = NEW."hospitalId" AND c."productId" = NEW."productId"
      AND c."batchNumber" = NEW."batchNumber" AND c.audience = NEW.audience AND c."targetId" = NEW."targetId"
    ORDER BY c.id DESC LIMIT 1;
  IF previous_outcome = 'RESOLVED' OR
    (previous_outcome = 'NOTIFIED' AND NEW.outcome <> 'RESOLVED') OR
    (NEW.outcome = 'RESOLVED' AND previous_outcome IS DISTINCT FROM 'NOTIFIED')
  THEN
    RAISE EXCEPTION 'Invalid recall contact outcome transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_recall_contact_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InventoryRecallContact"
  FOR EACH ROW EXECUTE FUNCTION guard_recall_contact_history();
COMMIT;
