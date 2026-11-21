INSERT INTO "Permission" ("code", "description")
VALUES ('pharmacy:prescriptions:replace', 'إصدار وصفة بديلة بعد إلغاء الوصفة الأصلية')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT "Role".id, "Permission".id
FROM "Role"
CROSS JOIN "Permission"
WHERE "Role".name = 'DOCTOR' AND "Permission".code = 'pharmacy:prescriptions:replace'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
