BEGIN;
CREATE TABLE "StaffSession" (
  id UUID PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "activeBranchId" INTEGER NOT NULL,
  "authVersion" INTEGER NOT NULL,
  "branchVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("branchVersion" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX staff_session_active_user_idx ON "StaffSession" ("userId","revokedAt","expiresAt");
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" UUID REFERENCES "StaffSession"(id) ON DELETE CASCADE ON UPDATE CASCADE;
UPDATE "RefreshToken" SET revoked = true, "replacedByToken" = NULL WHERE "sessionId" IS NULL;
ALTER TABLE "RefreshToken" ADD CONSTRAINT staff_refresh_requires_session CHECK (revoked OR "sessionId" IS NOT NULL);
CREATE UNIQUE INDEX staff_refresh_one_active_per_device_idx ON "RefreshToken" ("sessionId") WHERE NOT revoked;
CREATE INDEX staff_refresh_session_idx ON "RefreshToken" ("sessionId");
COMMIT;
