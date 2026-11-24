# توثيق الدفعة 23 (`CAP11`): تصنيفات الصرف (شهري/ساعات/ورديات)، الشرائح الضريبية، السلف، الاستقطاعات، العمل الإضافي، وتصفية نهاية الخدمة

- **التاريخ:** 2026-11-24
- **النطاق المعتمد:** `CAP11` (المرحلة الخامسة — الدفعة 23، المرحلة الأولى من الدمج الهندسي الانتقائي لمحرك الموارد البشرية والرواتب المستخلص من `D:\SarayaManager` داخل بنية السرايا الطبي متعددة المنشآت).
- **الترحيل المضاف:** الترحيل `#77` (`server/prisma/migrations/20261124220000_hr_loans_deductions_overtime_eos_cap11/migration.sql`).

## 1. ملخص ما تم بناؤه وضبطه

### أ) تصنيفات الصرف والشرائح الضريبية التصاعدية (مستخلص من `SarayaManager` ومُرقّى لـ Multi-Tenant + `Money`)
- توسيع `User` بحقول دورة التوظيف وتصنيف الصرف: `hireDate`, `terminationDate`, `employmentStatus`, `payBasis` (`MONTHLY` شهري / `HOURLY` بالساعات / `FIXED_SHIFT` مقطوعية ورديات 6-12-24 ساعة)، وأسعار `hourlyRate` و`fixedShift6hRate`/`12h`/`24h` بدقة `DECIMAL(19,4)`، وإعفاءات `isTaxExempt` و`isSocialInsuranceExempt`.
- إنشاء جدول `TaxBracket` متعدد المنشآت (`hospitalId`) لحساب ضريبة الدخل التصاعدية عبر `calculateProgressiveTax` بدقة `Money` (`ROUND_HALF_EVEN`) بعد خصم الغياب والضمان الاجتماعي.
- توسعة `PayrollSlip` بحقول التدقيق التفصيلية: `payBasis`, `workedHours`, `workedShiftsCount`, `taxDeduction`, `advanceDeduction`, `recurringDeduction`, `unpaidLeaveDeduction`, `overtimePay`, `loanInstallmentsJson`.

### ب) السلف والقروض (`EmployeeAdvance`) والاستقطاعات/البدلات (`EmployeeDeduction`) والعمل الإضافي (`OvertimeRequest`)
- **`EmployeeAdvance`:** طلب السلفة وحساب القسط الشهري بـ `Money`، اعتماد برقابة **4 عيون** (`approvedById <> userId` على مستوى PostgreSQL والخدمة)، ترحيل قيد الصرف الاختياري (`DR EMPLOYEE_ADVANCES 120500 / CR CASH_MAIN or BANK_MAIN`)، ومحفّز `employee_advance_guard` يمنع الحذف والتلاعب بعد الاعتماد/التسوية.
- **`EmployeeDeduction`:** بنود بدلات واستقطاعات دورية أو لمرة واحدة (ضمان اجتماعي، تأمين صحي، ضريبة، نقابة، جزاء إداري، علاوة تخصص/استدعاء/طبيعة عمل) مع وسم البنود لمرة واحدة بـ `appliedInPayrollRunId` لمنع الازدواج.
- **`OvertimeRequest`:** معاملات اليوم (`NORMAL` 1.5x / `WEEKEND` 2.0x / `HOLIDAY` 2.5x)، اعتماد بـ 4 عيون، منع الإضافة لفترة رواتب معتمدة، ومحفّز `overtime_request_guard`.

### ج) الربط الذري مع دورة الرواتب (`PayrollService`)
- `generatePayroll` يحسب الأجور تلقائيًا حسب تصنيف كل موظف (`MONTHLY` / `HOURLY` من ساعات الحضور الفعلية / `FIXED_SHIFT` من مدة الوردية 6-12-24 ساعة) + الإجازات بدون راتب (`LeaveType.UNPAID`) + الاستقطاعات والبدلات النشطة + طلبات العمل الإضافي المعتمدة + ضريبة الشرائح التصاعدية + أقساط السلف النشطة (مع حفظ لقطة `loanInstallmentsJson`).
- `approvePayroll` يرفض أي قسيمة بصافي سالب، ويقفل السلف بـ `FOR UPDATE` ويتحقق من عدم تغيّر الرصيد ثم يخصم الأقساط ويحوّل السلف المسددة بالكامل إلى `SETTLED`، ويرحّل قيدًا محاسبيًا متوازنًا متعدد الأسطر (`DR SALARIES_EXPENSE` / `CR SALARIES_PAYABLE` + `CR EMPLOYEE_ADVANCES` + `CR EMPLOYEE_DEDUCTIONS_PAYABLE`) مع بقاء التوافق الكامل مع القيد ثنائي السطر عند عدم وجود سلف أو استقطاعات.

### د) تصفية ومكافأة نهاية الخدمة (`EmployeeSettlement` — EOS)
- محرك حساب نقي بـ `Money` (`calculateEndOfService` وفق قانون العمل الليبي/الإقليمي المعتمد في `SarayaManager`): مدة الخدمة، راتب الشهر الأخير، بدل رصيد الإجازات السنوية غير المستهلك، مكافأة نهاية الخدمة بشرائحها (0.5 شهر/سنة لأول 5 سنوات ثم شهر/سنة لما بعدها مع مضاعفات الاستقالة والفصل التأديبي)، واستقطاع كامل متبقي السلف النشطة.
- بوابة **إخلاء طرف من 4 جهات** (`Department` / `IT` / `Finance` / `HR`) مفروضة على مستوى الخدمة وقاعدة البيانات (`CHECK`).
- رقابة **4 عيون** (`approvedById <> userId AND approvedById <> createdById`)، وبصمة `SHA-256` مع مسار تحقق `GET /hr/financial/settlements/:id/verify`، ومحفّز `employee_settlement_guard` لمنع التعديل والحذف بعد الاعتماد/الصرف.
- عند الاعتماد والتنفيذ: تسوية السلف النشطة إلى `0.000` (`SETTLED`)، تعطيل حساب الموظف وتحديث `employmentStatus` وإبطال جميع جلسات `StaffSession` النشطة، وترحيل قيد الاستحقاق (`DR EOS_EXPENSE 500150` / `CR EMPLOYEE_ADVANCES`, `CR EMPLOYEE_DEDUCTIONS_PAYABLE`, `CR SALARIES_PAYABLE`)، ثم صرف الصافي (`APPROVED -> PAID`) بقيد سداد مستقل.

### هـ) الواجهة والأمن
- إنشاء `HrFinancialModal.tsx` بـ 4 تبويبات (تصنيف الصرف والضرائب، السلف والقروض، الاستقطاعات والبدلات، تصفية نهاية الخدمة) ودمجها في `PayrollPage.tsx` مع اختباري واجهة في `HrFinancialModal.test.tsx`.
- إضافة الحسابات النظامية الجديدة في `seed.ts`: `EMPLOYEE_ADVANCES` (`120500`)، `EMPLOYEE_DEDUCTIONS_PAYABLE` (`200350`)، `EOS_EXPENSE` (`500150`).

## 2. أدلة التحقق المنفذة (2026-11-24)

| البوابة / الفحص | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر (`migrate reset --force`) | **نجاح (77/77)** | شاملة `#77` مع كافة قيود `CHECK` والمحفّزات الثلاثة. |
| تطابق المخطط (`prisma migrate diff --exit-code`) | **نجاح (`No difference detected.`)** | صفر انحراف بين `schema.prisma` والقاعدة المعزولة. |
| الفحوص الساكنة (`check-i18n`, `verify-tenant-isolation`, `audit:check`) | **نجاح** | `108/108` متحكمًا (`96/96` فعّالًا = `100%` ABAC & Tenant)، مفاتيح i18n متوازنة (`7401` + `40`). |
| الخادم (`lint:ci`, `typecheck`, `nest build`) | **نجاح** | `0` أخطاء ESLint جديدة (خط الأساس ثابت `4267`)، `tsc --noEmit` و`nest build` دون أخطاء. |
| اختبارات وحدة الخادم (`Jest --runInBand`) | **نجاح (104/104 حزمة — 808/808 اختبار)** | شاملة `src/hr/hr-financial.service.spec.ts` (5 اختبارات تغطي السلف، نهاية الخدمة، الشرائح الضريبية، الساعات، ومقطوعية الورديات). |
| العميل (`eslint`, `Vitest --run`, `tsc -b && vite build`) | **نجاح (54/54 ملفًا — 279/279 اختبارًا)** | شاملة `src/components/hr/HrFinancialModal.test.tsx` وبناء PWA نظيف. |
| اختبارات التكامل E2E (`connection_limit=5`) | **نجاح (3/3 حزم)** | `hr-loans-eos-payroll-cap11.e2e-spec.ts` + `hr-payroll-integrity.e2e-spec.ts` + `staff-credentialing-cap12.e2e-spec.ts`. |

## 3. الخطوات التالية في الخطة المعتمدة
- **الدفعة 24 (الترحيل `#78`):** أجهزة البصمة (`BiometricDevice`) وبروتوكول `ZKTeco ADMS Push (/iclock/cdata)` وسجل البصمات الخام (`BiometricPunchLog`) والحركات المؤقتة (`AttendanceMovement`) وتصنيف الغياب والعطلات الرسمية (`Holiday`).
- **الدفعة 25:** المزايا المحاسبية الإدارية التكميلية من `SarayaManager` (`Tafqeet`، قائمة التدفقات النقدية، الموازنات التقديرية) + `CAP08` (الحزم الجراحية وDRG).
- يبقى القبول البشري والميداني مع الموارد البشرية والمالية (`UAT01`) مفتوحًا.
