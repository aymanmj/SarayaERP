-- Existing admissions retain the previously implemented completed-24h policy.
CREATE TYPE "RoomDayPolicy" AS ENUM ('COMPLETED_24H', 'STARTED_24H', 'CALENDAR_NIGHTS');
ALTER TABLE "admissions"
  ADD COLUMN "roomBillingPolicy" "RoomDayPolicy" NOT NULL DEFAULT 'COMPLETED_24H',
  ADD COLUMN "roomBillingTimeZone" TEXT NOT NULL DEFAULT 'Africa/Tripoli';

INSERT INTO "SystemSetting" ("hospitalId", "key", "value", "type", "group", "description", "updatedAt")
SELECT "id", 'billing.roomDayPolicy', 'COMPLETED_24H', 'STRING', 'BILLING',
  'طريقة احتساب أيام الإقامة للحالات الجديدة؛ لا تغير طريقة حساب الدخول القائم.', CURRENT_TIMESTAMP
FROM "Hospital" ON CONFLICT ("hospitalId", "key") DO NOTHING;
INSERT INTO "SystemSetting" ("hospitalId", "key", "value", "type", "group", "description", "updatedAt")
SELECT "id", 'billing.roomTimeZone', 'Africa/Tripoli', 'STRING', 'BILLING',
  'التوقيت المحلي المستخدم في احتساب ليالي المبيت للحالات الجديدة، مثل Africa/Tripoli.', CURRENT_TIMESTAMP
FROM "Hospital" ON CONFLICT ("hospitalId", "key") DO NOTHING;
