BEGIN;

CREATE TABLE "PayerIntegrationProfile" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "webhookSigningSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "mtlsSubjectDn" TEXT,
    "allowedScopes" TEXT NOT NULL DEFAULT 'Claim.read ClaimResponse.write PreAuth.write',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayerIntegrationProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayerIntegrationProfile_security_check" CHECK (
        "apiKeyHash" ~ '^[0-9a-f]{64}$'
        AND length("webhookSigningSecret") >= 32
        AND ("webhookUrl" IS NULL OR "webhookUrl" ~ '^https://')
    )
);

CREATE TABLE "PayerWebhookEvent" (
    "id" SERIAL NOT NULL,
    "hospitalId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "profileId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "hmacSignature" TEXT NOT NULL,
    "signatureTimestamp" TIMESTAMP(3) NOT NULL,
    "fhirResourceType" TEXT NOT NULL,
    "claimBatchId" INTEGER,
    "preAuthId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "fhirPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerWebhookEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayerWebhookEvent_direction_check" CHECK ("direction" IN ('OUTBOUND', 'INBOUND')),
    CONSTRAINT "PayerWebhookEvent_status_check" CHECK ("status" IN ('DISPATCHED', 'VERIFIED')),
    CONSTRAINT "PayerWebhookEvent_hashes_check" CHECK (
        "payloadSha256" ~ '^[0-9a-f]{64}$'
        AND "hmacSignature" ~ '^sha256=[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX "PayerIntegrationProfile_providerId_key" ON "PayerIntegrationProfile"("providerId");
CREATE UNIQUE INDEX "PayerIntegrationProfile_clientId_key" ON "PayerIntegrationProfile"("clientId");
CREATE UNIQUE INDEX "PayerIntegrationProfile_apiKeyHash_key" ON "PayerIntegrationProfile"("apiKeyHash");
CREATE INDEX "PayerIntegrationProfile_hospitalId_isActive_idx" ON "PayerIntegrationProfile"("hospitalId", "isActive");

CREATE UNIQUE INDEX "PayerWebhookEvent_deliveryId_key" ON "PayerWebhookEvent"("deliveryId");
CREATE INDEX "PayerWebhookEvent_hospitalId_providerId_createdAt_idx" ON "PayerWebhookEvent"("hospitalId", "providerId", "createdAt");
CREATE INDEX "PayerWebhookEvent_profileId_createdAt_idx" ON "PayerWebhookEvent"("profileId", "createdAt");

ALTER TABLE "PayerIntegrationProfile" ADD CONSTRAINT "PayerIntegrationProfile_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayerIntegrationProfile" ADD CONSTRAINT "PayerIntegrationProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayerIntegrationProfile" ADD CONSTRAINT "PayerIntegrationProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayerWebhookEvent" ADD CONSTRAINT "PayerWebhookEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayerWebhookEvent" ADD CONSTRAINT "PayerWebhookEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayerWebhookEvent" ADD CONSTRAINT "PayerWebhookEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PayerIntegrationProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION guard_payer_integration_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "InsuranceProvider" p
        WHERE p.id = NEW."providerId" AND p."hospitalId" = NEW."hospitalId"
    ) THEN
        RAISE EXCEPTION 'Payer integration profile provider must belong to the same hospital' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER payer_integration_profile_guard
    BEFORE INSERT OR UPDATE ON "PayerIntegrationProfile"
    FOR EACH ROW EXECUTE FUNCTION guard_payer_integration_profile();

CREATE FUNCTION guard_payer_webhook_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Payer FHIR webhook audit log is immutable' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "PayerIntegrationProfile" p
        WHERE p.id = NEW."profileId"
          AND p."hospitalId" = NEW."hospitalId"
          AND p."providerId" = NEW."providerId"
    ) THEN
        RAISE EXCEPTION 'Payer webhook event must match integration profile hospital and provider scope' USING ERRCODE = '23514';
    END IF;

    IF NEW."claimBatchId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "ClaimBatch" b
        WHERE b.id = NEW."claimBatchId"
          AND b."hospitalId" = NEW."hospitalId"
          AND b."providerId" = NEW."providerId"
    ) THEN
        RAISE EXCEPTION 'Cross-payer or cross-hospital claim batch access denied in webhook event' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER payer_webhook_event_immutable_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "PayerWebhookEvent"
    FOR EACH ROW EXECUTE FUNCTION guard_payer_webhook_event();

COMMIT;
