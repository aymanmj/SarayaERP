-- Migration: add_quality_cdss_mpi_governance
-- Generated manually from schema.prisma changes
-- Apply with: npx prisma migrate deploy (on production server)

-- ================================================
-- Enums
-- ================================================

CREATE TYPE "IncidentType" AS ENUM (
  'PATIENT_FALL',
  'MEDICATION_ERROR',
  'PROCEDURE_COMPLICATION',
  'NEAR_MISS',
  'HEALTHCARE_ASSOCIATED_INFECTION',
  'DIAGNOSTIC_ERROR',
  'EQUIPMENT_FAILURE',
  'BLOOD_TRANSFUSION_REACTION',
  'PRESSURE_INJURY',
  'OTHER'
);

CREATE TYPE "IncidentSeverity" AS ENUM (
  'NEAR_MISS',
  'MINOR',
  'MODERATE',
  'MAJOR',
  'SENTINEL'
);

CREATE TYPE "IncidentStatus" AS ENUM (
  'REPORTED',
  'UNDER_REVIEW',
  'INVESTIGATED',
  'CAPA_OPEN',
  'CAPA_VERIFIED',
  'CLOSED'
);

CREATE TYPE "RootCauseCategory" AS ENUM (
  'HUMAN_FACTOR',
  'SYSTEM_PROCESS',
  'ENVIRONMENT',
  'EQUIPMENT',
  'COMMUNICATION',
  'KNOWLEDGE_TRAINING',
  'MEDICATION_RELATED'
);

CREATE TYPE "CapaActionType" AS ENUM (
  'CORRECTIVE',
  'PREVENTIVE'
);

CREATE TYPE "CapaStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'OVERDUE'
);

CREATE TYPE "RenalRiskClass" AS ENUM (
  'HIGH',
  'MODERATE',
  'LOW'
);

CREATE TYPE "HepaticRiskClass" AS ENUM (
  'HIGH',
  'MODERATE',
  'LOW'
);

CREATE TYPE "MpiConsentType" AS ENUM (
  'FULL',
  'LIMITED',
  'EMERGENCY_ONLY'
);

CREATE TYPE "MpiConsentStatus" AS ENUM (
  'PENDING_OTP',
  'ACTIVE',
  'REVOKED',
  'EXPIRED'
);

-- ================================================
-- Quality & Patient Safety — ClinicalIncident
-- ================================================

CREATE TABLE "ClinicalIncident" (
  "id"                SERIAL          PRIMARY KEY,
  "hospitalId"        INTEGER         NOT NULL,
  "incidentNumber"    TEXT            NOT NULL UNIQUE,
  "incidentDate"      TIMESTAMP(3)    NOT NULL,
  "reportedById"      INTEGER         NOT NULL,
  "incidentType"      "IncidentType"  NOT NULL,
  "severity"          "IncidentSeverity" NOT NULL,
  "description"       TEXT            NOT NULL,
  "descriptionAr"     TEXT,
  "location"          TEXT,
  "patientId"         INTEGER,
  "isAnonymous"       BOOLEAN         NOT NULL DEFAULT false,
  "immediateAction"   TEXT,
  "status"            "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
  "reviewDueDate"     TIMESTAMP(3),
  "reviewedById"      INTEGER,
  "reviewedAt"        TIMESTAMP(3),
  "rootCause"         "RootCauseCategory",
  "rootCauseDetails"  TEXT,
  "investigationNotes" TEXT,
  "closedById"        INTEGER,
  "closedAt"          TIMESTAMP(3),
  "closureJustification" TEXT,
  "reportedAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClinicalIncident_hospitalId_fkey"  FOREIGN KEY ("hospitalId")    REFERENCES "Hospital"("id") ON DELETE RESTRICT,
  CONSTRAINT "ClinicalIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id")     ON DELETE RESTRICT,
  CONSTRAINT "ClinicalIncident_patientId_fkey"   FOREIGN KEY ("patientId")     REFERENCES "Patient"("id") ON DELETE SET NULL
);

CREATE INDEX "ClinicalIncident_hospitalId_status_idx"  ON "ClinicalIncident"("hospitalId", "status");
CREATE INDEX "ClinicalIncident_severity_idx"           ON "ClinicalIncident"("severity");
CREATE INDEX "ClinicalIncident_incidentDate_idx"       ON "ClinicalIncident"("incidentDate");

-- ================================================
-- CAPA Actions
-- ================================================

CREATE TABLE "CapaAction" (
  "id"             SERIAL          PRIMARY KEY,
  "incidentId"     INTEGER         NOT NULL,
  "hospitalId"     INTEGER         NOT NULL,
  "actionType"     "CapaActionType" NOT NULL,
  "description"    TEXT            NOT NULL,
  "descriptionAr"  TEXT,
  "assignedToId"   INTEGER         NOT NULL,
  "dueDate"        TIMESTAMP(3)    NOT NULL,
  "status"         "CapaStatus"    NOT NULL DEFAULT 'OPEN',
  "completedAt"    TIMESTAMP(3),
  "completionNotes" TEXT,
  "verifiedById"   INTEGER,
  "verifiedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CapaAction_incidentId_fkey"   FOREIGN KEY ("incidentId")   REFERENCES "ClinicalIncident"("id") ON DELETE RESTRICT,
  CONSTRAINT "CapaAction_hospitalId_fkey"   FOREIGN KEY ("hospitalId")   REFERENCES "Hospital"("id")         ON DELETE RESTRICT,
  CONSTRAINT "CapaAction_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id")             ON DELETE RESTRICT
);

CREATE INDEX "CapaAction_incidentId_idx"       ON "CapaAction"("incidentId");
CREATE INDEX "CapaAction_assignedToId_status_idx" ON "CapaAction"("assignedToId", "status");
CREATE INDEX "CapaAction_dueDate_status_idx"   ON "CapaAction"("dueDate", "status");

-- ================================================
-- CDSS — Renal Dose Requirements (KDIGO / FDA)
-- ================================================

CREATE TABLE "RenalDoseRequirement" (
  "id"             SERIAL          PRIMARY KEY,
  "atcPrefix"      TEXT,
  "drugGeneric"    TEXT,
  "renalClass"     "RenalRiskClass" NOT NULL,
  "minSafeEgfr"    DOUBLE PRECISION NOT NULL,
  "action"         TEXT            NOT NULL,
  "actionAr"       TEXT,
  "evidenceSource" TEXT            NOT NULL,
  "notes"          TEXT,
  "isActive"       BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RenalDoseRequirement_atcPrefix_idx"   ON "RenalDoseRequirement"("atcPrefix");
CREATE INDEX "RenalDoseRequirement_drugGeneric_idx"  ON "RenalDoseRequirement"("drugGeneric");

-- ================================================
-- CDSS — Hepatic Dose Requirements
-- ================================================

CREATE TABLE "HepaticDoseRequirement" (
  "id"              SERIAL          PRIMARY KEY,
  "atcPrefix"       TEXT,
  "drugGeneric"     TEXT,
  "hepaticClass"    "HepaticRiskClass" NOT NULL,
  "childPughClass"  TEXT            NOT NULL,
  "action"          TEXT            NOT NULL,
  "actionAr"        TEXT,
  "evidenceSource"  TEXT            NOT NULL,
  "notes"           TEXT,
  "isActive"        BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "HepaticDoseRequirement_atcPrefix_idx"  ON "HepaticDoseRequirement"("atcPrefix");
CREATE INDEX "HepaticDoseRequirement_drugGeneric_idx" ON "HepaticDoseRequirement"("drugGeneric");

-- ================================================
-- MPI — Consent Record
-- ================================================

CREATE TABLE "MpiConsentRecord" (
  "id"              SERIAL              PRIMARY KEY,
  "globalPatientId" INTEGER             NOT NULL,
  "hospitalId"      INTEGER             NOT NULL,
  "consentType"     "MpiConsentType"    NOT NULL DEFAULT 'FULL',
  "status"          "MpiConsentStatus"  NOT NULL DEFAULT 'ACTIVE',
  "consentedAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3),
  "revokedAt"       TIMESTAMP(3),
  "revokedReason"   TEXT,
  "revokedById"     INTEGER,
  "consentMethod"   TEXT                NOT NULL,
  "consentDetails"  TEXT,
  "witnessedById"   INTEGER,
  "otpVerified"     BOOLEAN             NOT NULL DEFAULT false,
  "otpVerifiedAt"   TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MpiConsentRecord_globalPatientId_fkey" FOREIGN KEY ("globalPatientId") REFERENCES "GlobalPatient"("id") ON DELETE RESTRICT
);

CREATE INDEX "MpiConsentRecord_globalPatientId_status_idx" ON "MpiConsentRecord"("globalPatientId", "status");
CREATE INDEX "MpiConsentRecord_hospitalId_idx"              ON "MpiConsentRecord"("hospitalId");
CREATE INDEX "MpiConsentRecord_status_consentedAt_idx"      ON "MpiConsentRecord"("status", "consentedAt");

-- ================================================
-- MPI — Data Retention Policy
-- ================================================

CREATE TABLE "DataRetentionPolicy" (
  "id"                          SERIAL      PRIMARY KEY,
  "hospitalId"                  INTEGER     NOT NULL UNIQUE,
  "activePatientRetentionYrs"   INTEGER     NOT NULL DEFAULT 10,
  "inactivePatientRetentionYrs" INTEGER     NOT NULL DEFAULT 7,
  "globalMpiRetentionYrs"       INTEGER     NOT NULL DEFAULT 25,
  "auditLogRetentionYrs"        INTEGER     NOT NULL DEFAULT 10,
  "lastReviewDate"              TIMESTAMP(3) NOT NULL,
  "nextReviewDate"              TIMESTAMP(3) NOT NULL,
  "approvedById"                INTEGER     NOT NULL,
  "notes"                       TEXT,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DataRetentionPolicy_hospitalId_idx" ON "DataRetentionPolicy"("hospitalId");
