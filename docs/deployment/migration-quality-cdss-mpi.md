# أوامر تشغيل الـ Migration والـ Seed على السيرفر

## المتطلبات
- اتصال بسيرفر الإنتاج (Docker)
- متغير `DATABASE_URL` محدد في البيئة

---

## 1. تطبيق migration (يُنشئ الجداول الجديدة)

```bash
# داخل container الـ server
docker exec -it saraya-server sh

# تطبيق جميع الـ migrations المعلّقة
npx prisma migrate deploy

# توليد Prisma Client الجديد
npx prisma generate
```

---

## 2. تشغيل Seed — قواعد الجرعات الكلوية

```bash
# 28 قاعدة دوائية وفق KDIGO 2023 / FDA / ADA
npx ts-node src/scripts/seed-renal-dose-rules.ts
```

---

## 3. إعادة تشغيل الـ backend

```bash
# إعادة تشغيل بعد generate
docker restart saraya-server
# أو
pm2 restart saraya-server
```

---

## 4. جداول جديدة تُنشأ بهذا الـ migration

| الجدول | الوصف |
|-------|-------|
| `ClinicalIncident` | الحوادث السريرية والـ Near Miss |
| `CapaAction` | إجراءات CAPA المرتبطة بالحوادث |
| `RenalDoseRequirement` | قواعد تعديل الجرعات الكلوية (KDIGO) |
| `HepaticDoseRequirement` | قواعد تعديل الجرعات الكبدية |
| `MpiConsentRecord` | سجل موافقة مشاركة البيانات الوطنية |
| `DataRetentionPolicy` | سياسات الاحتفاظ بالبيانات |

---

## 5. Enums جديدة

- `IncidentType`, `IncidentSeverity`, `IncidentStatus`
- `RootCauseCategory`, `CapaActionType`, `CapaStatus`
- `RenalRiskClass`, `HepaticRiskClass`
- `MpiConsentType`, `MpiConsentStatus` (يشمل `PENDING_OTP`)
