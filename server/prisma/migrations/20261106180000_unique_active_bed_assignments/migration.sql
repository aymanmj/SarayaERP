-- Never silently discard conflicting clinical occupancy history.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT "bedId" FROM "BedAssignment" WHERE "to" IS NULL GROUP BY "bedId" HAVING count(*) > 1)
     OR EXISTS (SELECT "encounterId" FROM "BedAssignment" WHERE "to" IS NULL GROUP BY "encounterId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Conflicting active bed assignments exist. Reconcile them with clinical staff before applying this migration.';
  END IF;
END $$;
CREATE UNIQUE INDEX "BedAssignment_one_active_bed" ON "BedAssignment" ("bedId") WHERE "to" IS NULL;
CREATE UNIQUE INDEX "BedAssignment_one_active_encounter" ON "BedAssignment" ("encounterId") WHERE "to" IS NULL;
COMMIT;
