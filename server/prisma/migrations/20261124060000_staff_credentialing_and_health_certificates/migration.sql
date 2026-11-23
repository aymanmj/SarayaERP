-- CAP12: Medical & Allied Health Staff Credentialing (Practice Permits & Disease-Free Health Certificates)
BEGIN;

CREATE TABLE "StaffCredential" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "staffCategory" TEXT NOT NULL DEFAULT 'MEDICAL',
    "credentialType" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "licenseNumber" VARCHAR(120) NOT NULL,
    "issuingAuthority" VARCHAR(200) NOT NULL,
    "specialty" VARCHAR(150),
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "suspendedById" INTEGER,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" VARCHAR(500),
    "documentRef" VARCHAR(255),
    "notes" VARCHAR(500),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffCredential_category_chk" CHECK (
        "staffCategory" IN ('MEDICAL', 'ALLIED_HEALTH', 'ADMINISTRATIVE_SUPPORT')
    ),
    CONSTRAINT "StaffCredential_type_chk" CHECK (
        "credentialType" IN (
            'PRACTICE_LICENSE',
            'HEALTH_CERTIFICATE',
            'MEDICAL_COUNCIL_CERT',
            'SPECIALTY_BOARD_CERT',
            'BLS_ACLS_CERT',
            'RADIATION_SAFETY_PERMIT',
            'OTHER'
        )
    ),
    CONSTRAINT "StaffCredential_status_chk" CHECK (
        "status" IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'SUPERSEDED')
    ),
    CONSTRAINT "StaffCredential_dates_chk" CHECK (
        "expiryDate" > "issueDate" AND "alertDaysBefore" >= 0 AND "alertDaysBefore" <= 365
    ),
    CONSTRAINT "StaffCredential_verify_chk" CHECK (
        "status" <> 'ACTIVE' OR ("verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL)
    ),
    CONSTRAINT "StaffCredential_suspend_chk" CHECK (
        "status" NOT IN ('SUSPENDED', 'REVOKED')
        OR ("suspendedById" IS NOT NULL AND "suspendedAt" IS NOT NULL AND "suspensionReason" IS NOT NULL)
    )
);

CREATE INDEX "StaffCredential_hospitalId_userId_credentialType_idx"
    ON "StaffCredential"("hospitalId", "userId", "credentialType");
CREATE INDEX "StaffCredential_hospitalId_status_expiryDate_idx"
    ON "StaffCredential"("hospitalId", "status", "expiryDate");

ALTER TABLE "StaffCredential"
    ADD CONSTRAINT "StaffCredential_hospitalId_fkey"
        FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StaffCredential_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StaffCredential_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StaffCredential_verifiedById_fkey"
        FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "StaffCredential_suspendedById_fkey"
        FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_staff_credential()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Staff credentialing records are compliance evidence and cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."id" = NEW."userId"
          AND (
              u."hospitalId" = NEW."hospitalId"
              OR EXISTS (
                  SELECT 1 FROM "UserHospitalAccess" uha
                  WHERE uha."userId" = u."id"
                    AND uha."hospitalId" = NEW."hospitalId"
              )
          )
    ) THEN
        RAISE EXCEPTION 'Staff member does not belong to or have active access to this hospital'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."status" = 'REVOKED' THEN
            RAISE EXCEPTION 'Revoked staff credential is permanently closed and cannot be modified'
                USING ERRCODE = '23514';
        END IF;

        IF NEW."hospitalId" IS DISTINCT FROM OLD."hospitalId"
           OR NEW."userId" IS DISTINCT FROM OLD."userId"
           OR NEW."credentialType" IS DISTINCT FROM OLD."credentialType" THEN
            RAISE EXCEPTION 'Staff credential ownership and type cannot be altered'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER staff_credential_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "StaffCredential"
    FOR EACH ROW EXECUTE FUNCTION guard_staff_credential();

COMMIT;
