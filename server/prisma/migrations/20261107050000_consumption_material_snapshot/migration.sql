ALTER TABLE "ServiceMaterialConsumption" ADD COLUMN "materialsSnapshot" JSONB, ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ServiceMaterialConsumption" ADD CONSTRAINT "consumption_snapshot_check"
 CHECK (("snapshotVersion"=0 AND "materialsSnapshot" IS NULL) OR ("snapshotVersion"=1 AND "materialsSnapshot" IS NOT NULL AND jsonb_typeof("materialsSnapshot")='array'));
CREATE FUNCTION protect_consumption_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."snapshotVersion"=1 AND (NEW."materialsSnapshot" IS DISTINCT FROM OLD."materialsSnapshot" OR NEW."snapshotVersion" IS DISTINCT FROM OLD."snapshotVersion") THEN
 RAISE EXCEPTION 'Consumption material snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_consumption_snapshot BEFORE UPDATE ON "ServiceMaterialConsumption" FOR EACH ROW EXECUTE FUNCTION protect_consumption_snapshot();
