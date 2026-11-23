-- CAP07: Clinical Notes Electronic Signature, Cryptographic Content Hash & PostgreSQL Immutability Lock
BEGIN;

ALTER TABLE "ClinicalNote"
    ADD COLUMN "addendumReason" VARCHAR(255),
    ADD COLUMN "signatureHash" VARCHAR(64),
    ADD COLUMN "coSignatureHash" VARCHAR(64);

CREATE INDEX "ClinicalNote_parentNoteId_idx" ON "ClinicalNote"("parentNoteId");

ALTER TABLE "ClinicalNote"
    ADD CONSTRAINT "ClinicalNote_sign_fields_chk" CHECK (
        ("signedAt" IS NULL AND "signedById" IS NULL AND "signatureHash" IS NULL)
        OR (
            "signedAt" IS NOT NULL
            AND "signedById" IS NOT NULL
            AND "signatureHash" ~ '^[0-9a-f]{64}$'
        )
    ),
    ADD CONSTRAINT "ClinicalNote_cosign_fields_chk" CHECK (
        ("coSignedAt" IS NULL AND "coSignedById" IS NULL AND "coSignatureHash" IS NULL)
        OR (
            "coSignedAt" IS NOT NULL
            AND "coSignedById" IS NOT NULL
            AND "signedAt" IS NOT NULL
            AND "signedById" IS NOT NULL
            AND "coSignedById" <> "signedById"
            AND "coSignatureHash" ~ '^[0-9a-f]{64}$'
        )
    ),
    ADD CONSTRAINT "ClinicalNote_addendum_hierarchy_chk" CHECK (
        ("isAddendum" = false AND "parentNoteId" IS NULL)
        OR ("isAddendum" = true AND "parentNoteId" IS NOT NULL AND "parentNoteId" <> "id")
    );

CREATE OR REPLACE FUNCTION guard_clinical_note_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_record RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."signedAt" IS NOT NULL THEN
            RAISE EXCEPTION 'Signed clinical notes are immutable and cannot be deleted'
                USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
            SELECT 1 FROM "ClinicalNote" c WHERE c."parentNoteId" = OLD."id"
        ) THEN
            RAISE EXCEPTION 'Clinical notes with linked addenda cannot be deleted'
                USING ERRCODE = '23514';
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW."isAddendum" = true THEN
            SELECT "id", "encounterId", "signedAt", "isAddendum"
              INTO parent_record
              FROM "ClinicalNote"
             WHERE "id" = NEW."parentNoteId";

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Addendum parent clinical note does not exist'
                    USING ERRCODE = '23514';
            END IF;

            IF parent_record."encounterId" <> NEW."encounterId" THEN
                RAISE EXCEPTION 'Addendum must belong to the same encounter as its parent note'
                    USING ERRCODE = '23514';
            END IF;

            IF parent_record."signedAt" IS NULL THEN
                RAISE EXCEPTION 'Addendum can only be attached to a signed clinical note'
                    USING ERRCODE = '23514';
            END IF;

            IF parent_record."isAddendum" = true THEN
                RAISE EXCEPTION 'Nested addenda on an addendum are not permitted; attach to the primary signed note'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Immutable structural fields across all lifecycle states
        IF NEW."id" IS DISTINCT FROM OLD."id"
           OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId"
           OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
           OR NEW."isAddendum" IS DISTINCT FROM OLD."isAddendum"
           OR NEW."parentNoteId" IS DISTINCT FROM OLD."parentNoteId" THEN
            RAISE EXCEPTION 'Clinical note identity, encounter, author, and hierarchy cannot be modified'
                USING ERRCODE = '23514';
        END IF;

        -- Once signed, clinical content and primary signature are permanently locked
        IF OLD."signedAt" IS NOT NULL THEN
            IF NEW."type" IS DISTINCT FROM OLD."type"
               OR NEW."content" IS DISTINCT FROM OLD."content"
               OR NEW."subjective" IS DISTINCT FROM OLD."subjective"
               OR NEW."objective" IS DISTINCT FROM OLD."objective"
               OR NEW."assessment" IS DISTINCT FROM OLD."assessment"
               OR NEW."plan" IS DISTINCT FROM OLD."plan"
               OR NEW."shiftId" IS DISTINCT FROM OLD."shiftId"
               OR NEW."addendumReason" IS DISTINCT FROM OLD."addendumReason"
               OR NEW."signedById" IS DISTINCT FROM OLD."signedById"
               OR NEW."signedAt" IS DISTINCT FROM OLD."signedAt"
               OR NEW."signatureHash" IS DISTINCT FROM OLD."signatureHash" THEN
                RAISE EXCEPTION 'Signed clinical notes are immutable; create a signed addendum instead'
                    USING ERRCODE = '23514';
            END IF;

            -- Once co-signed, co-signature is permanently locked too
            IF OLD."coSignedAt" IS NOT NULL THEN
                IF NEW."coSignedById" IS DISTINCT FROM OLD."coSignedById"
                   OR NEW."coSignedAt" IS DISTINCT FROM OLD."coSignedAt"
                   OR NEW."coSignatureHash" IS DISTINCT FROM OLD."coSignatureHash" THEN
                    RAISE EXCEPTION 'Co-signed clinical notes are permanently locked and cannot be re-cosigned'
                        USING ERRCODE = '23514';
                END IF;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER clinical_note_immutability_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalNote"
    FOR EACH ROW EXECUTE FUNCTION guard_clinical_note_immutability();

COMMIT;
