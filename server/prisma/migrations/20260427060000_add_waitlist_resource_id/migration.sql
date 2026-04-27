ALTER TABLE "Waitlist"
ADD COLUMN "resourceId" INTEGER;

CREATE INDEX "Waitlist_resourceId_status_idx"
ON "Waitlist"("resourceId", "status");

ALTER TABLE "Waitlist"
ADD CONSTRAINT "Waitlist_resourceId_fkey"
FOREIGN KEY ("resourceId") REFERENCES "Resource"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
