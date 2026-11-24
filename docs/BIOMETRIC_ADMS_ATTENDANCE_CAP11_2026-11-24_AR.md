# توثيق الدفعة 24 (`CAP11` — الجزء الثاني): أجهزة البصمة (`ZKTeco ADMS`)، سجل البصمات الخام، الحركات المؤقتة، تصنيف الغياب، والعطلات الرسمية

- **التاريخ:** 2026-11-24
- **النطاق المعتمد:** المرحلة الثانية من خطة الدمج الهندسي الانتقائي لمحرك الموارد البشرية والحضور المستخلص من `D:\SarayaManager` داخل بنية السرايا الطبي متعددة المنشآت (`CAP11` / `HR01` / `SEC03` / `OPS03`).
- **الترحيل المضاف:** الترحيل `#78` (`server/prisma/migrations/20261124230000_biometric_devices_adms_movements_holidays_cap11/migration.sql`).

## 1. ملخص ما تم بناؤه وضبطه

### أ) سجل أجهزة البصمة وبروتوكول السحابة المحصّن `ZKTeco ADMS` (`BiometricDevice` + `AdmsDeviceGuard`)
- توسيع `User` برقم بصمة فريد ضمن كل منشأة `biometricId` (`@@unique([hospitalId, biometricId])`).
- إنشاء جدول `BiometricDevice` متعدد المنشآت (`hospitalId`) مع رقم تسلسلي فريد عالميًا (`serialNumber`) لربط حزم الأجهزة القادمة على `/iclock/cdata` بالمنشأة الصحيحة بدقة، وحقل `deviceSecretHash` (تجزئة `SHA-256` اختيارية لكل جهاز)، وقيد رفض عناوين IP العامة (السماح فقط بالشبكات الخاصة `192.168.x.x` / `10.x.x.x` / `172.16–31.x.x` / `Tailscale CGNAT` / `Loopback`).
- بناء الحارس المخصص **`AdmsDeviceGuard`** لحماية مساري العتاد (`GET /iclock/cdata` المصافحة، و`POST /iclock/cdata` دفع سجلات `ATTLOG`):
  1. التحقق من مصدر الشبكة المحلية (`isTrustedPrivateIp`).
  2. إلزام تسجيل الجهاز ونشاطه عبر `serialNumber`.
  3. مطابقة عنوان IP المسجّل (ما لم يُفعَّل `ADMS_ALLOW_IP_CHANGE=true`).
  4. التحقق الزمني الثابت (`crypto.timingSafeEqual`) من سر الجهاز إن كان مفعّلًا.
  5. ربط الطلب مباشرةً بـ `device.hospitalId` لعزل كامل بين المنشآت.
- تهيئة `server/src/main.ts` لاستثناء `iclock/cdata` من بادئة `/api` وتمكين قراءة `text/plain` حتى `2MB` لأجهزة ZKTeco الفعلية.

### ب) سجل البصمات الخام غير القابل للتعديل (`BiometricPunchLog`)
- إنشاء جدول ملحق فقط (`BiometricPunchLog`) بقيد تفرد `(hospitalId, biometricId, punchTime)` لمنع التكرار عند إعادة إرسال الجهاز لنفس الدفعة (`Idempotency`).
- محفّز PostgreSQL (`biometric_punch_log_immutable_guard`) يمنع `DELETE` أو تعديل الحقول الخام (`hospitalId`/`deviceId`/`biometricId`/`punchTime`/`rawLine`).
- حفظ البصمات غير المربوطة بموظف (`userId = null`) ليتمكن قسم الموارد البشرية من رصدها وربطها لاحقًا دون فقدان بيانات.

### ج) الحركات المؤقتة (`AttendanceMovement`)، تصنيف الغياب، والعطلات الرسمية (`Holiday`)
- توسيع `AttendanceRecord` بحقول `workedHours`, `tempLeaveMinutes`, `absenceAuthorization` (`PENDING`/`AUTHORIZED`/`UNAUTHORIZED`/`SICK`/`VACATION`), `absenceClassifiedById`, `absenceNotes`.
- إنشاء `AttendanceMovement` لتوثيق المغادرات المؤقتة (`TEMP_LEAVE`) والعودة (`RETURN`) مع **رقابة 4 عيون** (`approvedById <> userId`) وإعادة احتساب `tempLeaveMinutes` وصافي `workedHours` آليًا.
- إنشاء جدول `Holiday` متعدد المنشآت (`hospitalId`) مع دعم العطلات السنوية المتكررة (`isAnnual`).
- ترقية `AttendanceService.processPunch` (تحديث `workedHours` تلقائيًا عند تسجيل الخروج) و`getEmployeeMonthlyStats` (استبعاد العطلات الرسمية والغياب المصنّف `AUTHORIZED`/`SICK`/`VACATION` من أيام الغياب المخصومة).

### د) الواجهة الأمامية
- إنشاء `BiometricDevicesModal.tsx` بـ 3 تبويبات (أجهزة البصمة ADMS وحالة النبضة، سجل البصمات الخام، العطلات الرسمية) ودمجها في `AttendancePage.tsx` مع اختباري واجهة في `BiometricDevicesModal.test.tsx`.

## 2. أدلة التحقق المنفذة (2026-11-24)

| البوابة / الفحص | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر (`migrate reset --force`) | **نجاح (78/78)** | شاملة `#78` ومحفّز `biometric_punch_log_immutable_guard`. |
| تطابق المخطط (`prisma migrate diff --exit-code`) | **نجاح (`No difference detected.`)** | تطابق 100% بين `schema.prisma` وقاعدة الاختبار. |
| الفحوص الساكنة (`check-i18n`, `verify-tenant-isolation`, `audit:check`) | **نجاح** | `109/109` متحكمًا (`97/97` فعّالًا = `100%` ABAC & Tenant)، مفاتيح i18n متوازنة (`7401` + `40`). |
| الخادم (`lint:ci`, `typecheck`, `nest build`) | **نجاح** | `0` أخطاء ESLint جديدة (خط الأساس ثابت `4267`)، `tsc --noEmit` و`nest build` دون أخطاء. |
| اختبارات وحدة الخادم (`Jest --runInBand`) | **نجاح (105/105 حزمة — 812/812 اختبار)** | شاملة `src/attendance/biometric-adms.util.spec.ts` و`attendance.service.spec.ts`. |
| العميل (`eslint`, `Vitest --run`, `tsc -b && vite build`) | **نجاح (55/55 ملفًا — 281/281 اختبارًا)** | شاملة `src/components/hr/BiometricDevicesModal.test.tsx` وبناء PWA نظيف. |
| اختبارات التكامل E2E (`connection_limit=5`) | **نجاح (3/3 حزم)** | `biometric-adms-attendance-cap11.e2e-spec.ts` + `hr-loans-eos-payroll-cap11.e2e-spec.ts` + `hr-payroll-integrity.e2e-spec.ts`. |

## 3. ما يبقى خارج نطاق الإغلاق الآلي
- اختبار الربط المباشر مع جهاز بصمة ZKTeco فعلي داخل شبكة المستشفى المحلية (`UAT01`) ومراجعة ضبط المنطقة الزمنية لكل فرع.
