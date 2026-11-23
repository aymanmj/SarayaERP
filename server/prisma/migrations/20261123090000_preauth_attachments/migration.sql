BEGIN;

CREATE TABLE "PreAuthorizationAttachment" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "preAuthId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "retiredById" INTEGER,
    "retireReason" TEXT,

    CONSTRAINT "PreAuthorizationAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PreAuthorizationAttachment_category_check" CHECK (
        "category" IN ('MEDICAL_REPORT', 'LAB_RESULT', 'IMAGING', 'PRESCRIPTION', 'REFERRAL', 'ID_DOCUMENT', 'OTHER')
    ),
    CONSTRAINT "PreAuthorizationAttachment_contentType_check" CHECK (
        "contentType" IN ('application/pdf', 'image/jpeg', 'image/png')
    ),
    CONSTRAINT "PreAuthorizationAttachment_sizeBytes_check" CHECK (
        "sizeBytes" > 0 AND "sizeBytes" <= 10485760
    ),
    CONSTRAINT "PreAuthorizationAttachment_sha256_check" CHECK (
        "sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "PreAuthorizationAttachment_storageKey_check" CHECK (
        "storageKey" !~ '\.\.'
    ),
    CONSTRAINT "PreAuthorizationAttachment_retirement_check" CHECK (
        ("retiredAt" IS NULL AND "retiredById" IS NULL AND "retireReason" IS NULL)
        OR ("retiredAt" IS NOT NULL AND "retiredById" IS NOT NULL AND LENGTH(TRIM("retireReason")) >= 5)
    )
);

CREATE UNIQUE INDEX "PreAuthorizationAttachment_storageKey_key"
    ON "PreAuthorizationAttachment"("storageKey");

CREATE INDEX "PreAuthorizationAttachment_hospitalId_preAuthId_idx"
    ON "PreAuthorizationAttachment"("hospitalId", "preAuthId");

CREATE UNIQUE INDEX "PreAuthorizationAttachment_active_sha256"
    ON "PreAuthorizationAttachment"("preAuthId", "sha256")
    WHERE "retiredAt" IS NULL;

ALTER TABLE "PreAuthorizationAttachment"
    ADD CONSTRAINT "PreAuthorizationAttachment_hospitalId_fkey"
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreAuthorizationAttachment"
    ADD CONSTRAINT "PreAuthorizationAttachment_preAuthId_fkey"
    FOREIGN KEY ("preAuthId") REFERENCES "PreAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreAuthorizationAttachment"
    ADD CONSTRAINT "PreAuthorizationAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PreAuthorizationAttachment"
    ADD CONSTRAINT "PreAuthorizationAttachment_retiredById_fkey"
    FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION guard_preauth_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_hospital_id INTEGER;
    parent_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Pre-authorization attachments cannot be hard deleted' USING ERRCODE = '23514';
    END IF;

    SELECT "hospitalId", "status"
    INTO parent_hospital_id, parent_status
    FROM "PreAuthorization"
    WHERE "id" = NEW."preAuthId";

    IF TG_OP = 'INSERT' THEN
        IF parent_hospital_id IS NULL OR parent_hospital_id <> NEW."hospitalId" OR parent_status <> 'PENDING' THEN
            RAISE EXCEPTION 'Pre-authorization attachment requires PENDING pre-authorization in same hospital' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."retiredAt" IS NOT NULL THEN
        RAISE EXCEPTION 'Retired pre-authorization attachment is immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."hospitalId" IS DISTINCT FROM OLD."hospitalId"
        OR NEW."preAuthId" IS DISTINCT FROM OLD."preAuthId"
        OR NEW."category" IS DISTINCT FROM OLD."category"
        OR NEW."title" IS DISTINCT FROM OLD."title"
        OR NEW."originalFileName" IS DISTINCT FROM OLD."originalFileName"
        OR NEW."contentType" IS DISTINCT FROM OLD."contentType"
        OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
        OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
        OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
        OR NEW."uploadedById" IS DISTINCT FROM OLD."uploadedById"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Pre-authorization attachment metadata and hash are immutable' USING ERRCODE = '23514';
    END IF;

    IF NEW."retiredAt" IS NULL THEN
        RAISE EXCEPTION 'Only retirement transition is permitted on pre-authorization attachments' USING ERRCODE = '23514';
    END IF;

    IF parent_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Cannot retire attachment after pre-authorization decision' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER preauth_attachment_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "PreAuthorizationAttachment"
    FOR EACH ROW EXECUTE FUNCTION guard_preauth_attachment();

COMMIT;
