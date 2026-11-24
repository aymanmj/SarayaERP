-- Migration #78: Biometric Devices, ZKTeco ADMS Push, Raw Punch Log, Attendance Movements, Absence Classification & Holidays

-- 1. Extend User with per-hospital unique biometric badge ID
ALTER TABLE "User"
  ADD COLUMN "biometricId" VARCHAR(64);

CREATE UNIQUE INDEX "User_hospitalId_biometricId_key" ON "User"("hospitalId", "biometricId");

-- 2. Extend AttendanceRecord with workedHours, tempLeaveMinutes, and HR absence classification
ALTER TABLE "AttendanceRecord"
  ADD COLUMN "workedHours" DECIMAL(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN "tempLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "absenceAuthorization" VARCHAR(24),
  ADD COLUMN "absenceClassifiedById" INTEGER,
  ADD COLUMN "absenceNotes" VARCHAR(500);

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_absenceAuth_chk"
  CHECK ("absenceAuthorization" IS NULL OR "absenceAuthorization" IN ('PENDING', 'AUTHORIZED', 'UNAUTHORIZED', 'SICK', 'VACATION')),
  ADD CONSTRAINT "AttendanceRecord_worked_nonneg_chk"
  CHECK ("workedHours" >= 0 AND "tempLeaveMinutes" >= 0);

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_absenceClassifiedById_fkey"
  FOREIGN KEY ("absenceClassifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. BiometricDevice (Multi-Tenant ZKTeco ADMS / Direct-TCP Registry)
CREATE TABLE "BiometricDevice" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "brand" VARCHAR(40) NOT NULL DEFAULT 'ZKTECO',
  "model" VARCHAR(64),
  "serialNumber" VARCHAR(64) NOT NULL,
  "ipAddress" VARCHAR(64) NOT NULL,
  "port" INTEGER NOT NULL DEFAULT 4370,
  "connectionMode" VARCHAR(24) NOT NULL DEFAULT 'ADMS',
  "location" VARCHAR(120),
  "deviceSecretHash" VARCHAR(64),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "lastSeenIp" VARCHAR(64),
  "lastError" VARCHAR(500),
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BiometricDevice_mode_chk" CHECK ("connectionMode" IN ('ADMS', 'DIRECT_TCP')),
  CONSTRAINT "BiometricDevice_port_chk" CHECK ("port" >= 1 AND "port" <= 65535)
);

CREATE UNIQUE INDEX "BiometricDevice_serialNumber_key" ON "BiometricDevice"("serialNumber");
CREATE INDEX "BiometricDevice_hospitalId_isActive_idx" ON "BiometricDevice"("hospitalId", "isActive");

ALTER TABLE "BiometricDevice"
  ADD CONSTRAINT "BiometricDevice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BiometricDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. BiometricPunchLog (Immutable Raw Hardware Punch Audit Log)
CREATE TABLE "BiometricPunchLog" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "deviceId" INTEGER,
  "userId" INTEGER,
  "biometricId" VARCHAR(64) NOT NULL,
  "punchTime" TIMESTAMP(3) NOT NULL,
  "punchType" VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  "verifyMode" VARCHAR(24),
  "source" VARCHAR(24) NOT NULL DEFAULT 'ADMS',
  "rawLine" VARCHAR(500),
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BiometricPunchLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BiometricPunchLog_source_chk" CHECK ("source" IN ('ADMS', 'DIRECT_TCP', 'MANUAL', 'CSV'))
);

CREATE UNIQUE INDEX "BiometricPunchLog_hospitalId_biometricId_punchTime_key" ON "BiometricPunchLog"("hospitalId", "biometricId", "punchTime");
CREATE INDEX "BiometricPunchLog_hospitalId_punchTime_idx" ON "BiometricPunchLog"("hospitalId", "punchTime");
CREATE INDEX "BiometricPunchLog_deviceId_punchTime_idx" ON "BiometricPunchLog"("deviceId", "punchTime");

ALTER TABLE "BiometricPunchLog"
  ADD CONSTRAINT "BiometricPunchLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BiometricPunchLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BiometricPunchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION biometric_punch_log_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BiometricPunchLog % is immutable and cannot be deleted', OLD."id";
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."hospitalId" <> OLD."hospitalId"
       OR NEW."deviceId" IS DISTINCT FROM OLD."deviceId"
       OR NEW."biometricId" <> OLD."biometricId"
       OR NEW."punchTime" <> OLD."punchTime"
       OR NEW."rawLine" IS DISTINCT FROM OLD."rawLine" THEN
      RAISE EXCEPTION 'BiometricPunchLog % raw hardware fields are immutable', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_biometric_punch_log_immutable_guard
  BEFORE UPDATE OR DELETE ON "BiometricPunchLog"
  FOR EACH ROW EXECUTE FUNCTION biometric_punch_log_immutable_guard();

-- 5. AttendanceMovement (Temporary Leave & Return inside shift, 4-Eyes approval)
CREATE TABLE "AttendanceMovement" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "attendanceRecordId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "movementType" VARCHAR(24) NOT NULL,
  "movementTime" TIMESTAMP(3) NOT NULL,
  "approvalStatus" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceMovement_type_chk" CHECK ("movementType" IN ('TEMP_LEAVE', 'RETURN')),
  CONSTRAINT "AttendanceMovement_status_chk" CHECK ("approvalStatus" IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT "AttendanceMovement_4eyes_chk" CHECK ("approvedById" IS NULL OR "approvedById" <> "userId")
);

CREATE INDEX "AttendanceMovement_hospitalId_userId_movementTime_idx" ON "AttendanceMovement"("hospitalId", "userId", "movementTime");
CREATE INDEX "AttendanceMovement_attendanceRecordId_idx" ON "AttendanceMovement"("attendanceRecordId");

ALTER TABLE "AttendanceMovement"
  ADD CONSTRAINT "AttendanceMovement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceMovement_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceMovement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Holiday (Multi-Tenant Official Holiday Calendar)
CREATE TABLE "Holiday" (
  "id" SERIAL NOT NULL,
  "hospitalId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "nameEn" VARCHAR(120),
  "date" TIMESTAMP(3) NOT NULL,
  "isAnnual" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Holiday_hospitalId_date_name_key" ON "Holiday"("hospitalId", "date", "name");
CREATE INDEX "Holiday_hospitalId_isActive_date_idx" ON "Holiday"("hospitalId", "isActive", "date");

ALTER TABLE "Holiday"
  ADD CONSTRAINT "Holiday_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Holiday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
