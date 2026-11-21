BEGIN;
ALTER TABLE "RefreshToken" ADD COLUMN "activeBranchId" INTEGER, ADD COLUMN "authVersion" INTEGER;

-- A legacy refresh token has no evidence of its selected branch.
UPDATE "RefreshToken" r SET "activeBranchId" = u."hospitalId", "authVersion" = u."authVersion",
  revoked = true, "replacedByToken" = NULL
FROM "User" u WHERE u.id = r."userId";

ALTER TABLE "RefreshToken" ALTER COLUMN "activeBranchId" SET NOT NULL, ALTER COLUMN "authVersion" SET NOT NULL;
CREATE INDEX staff_refresh_branch_revocation_idx ON "RefreshToken" ("userId", "activeBranchId", revoked);
COMMIT;
