# سلامة الموارد البشرية، أرصدة الإجازات، عزل الجداول والبصمات، ومحاسبة الرواتب (`HR01` / `FLOW04` / `SEC03` / `OPS03`) — 2026-11-08

## 1. النطاق والمشكلة الأصلية
أظهر التدقيق التفصيلي لوحدات الموارد البشرية ([`HrService`](file:///d:/SarayaERP/server/src/hr/hr.service.ts))، والحضور والانصراف ([`AttendanceService`](file:///d:/SarayaERP/server/src/attendance/attendance.service.ts) و[`AttendanceController`](file:///d:/SarayaERP/server/src/attendance/attendance.controller.ts))، والرواتب ([`PayrollService`](file:///d:/SarayaERP/server/src/payroll/payroll.service.ts) و[`PayrollPage.tsx`](file:///d:/SarayaERP/client/src/pages/PayrollPage.tsx)) الثغرات التالية:
1. **ثغرة عزل المنشأة والتحقق من التواريخ في جداول الدوام والبصمات (`SEC03` / `HR01`)**:
   - كانت `assignRoster` و`updateRosterEntry` تسمحان بإسناد موظف أو وردية عمل (`workShiftId`) من منشأة أخرى دون التحقق من ملكيتهما لـ`hospitalId`، كما كانت `assignRoster` تقبل نطاقات تاريخية معكوسة (`toDate < fromDate`) أو غير محدودة، وكانت `updateRosterEntry` تعيد ضبط `isOffDay` إلى `false` عند تحديث `workShiftId` وحده.
   - لم تكن مسارات `POST /attendance/punch` و`POST /attendance/bulk-import` و`POST /attendance/upload` تمرر `req.user.hospitalId` إلى `AttendanceService`، مما كان يسمح بتسجيل بصمة لموظف يتبع منشأة أخرى.
2. **ثغرة التواريخ المعكوسة والاعتماد المزدوج لرصيد الإجازات السنوية (`HR01` / `OPS03`)**:
   - كانت `requestLeave` تحسب عدد الأيام عبر `Math.abs(endDate.getTime() - startDate.getTime())`، فتقبل التواريخ المعكوسة (`endDate < startDate`)، ولا تمنع تداخل الإجازات المعلقة/المعتمدة لنفس الموظف، ولا تحجز أيام الإجازات السنوية المعلقة (`PENDING`) عند فحص `annualLeaveBalance`.
   - كانت `approveLeave` تفتقر إلى قفل `LeaveRequest FOR UPDATE` و`User FOR UPDATE`، ولا تشترط كون حالة الطلب `PENDING` قبل الاعتماد، مما كان يسمح بطلبين متزامنين (أو إعادة استدعاء المسار) بخصم `annualLeaveBalance` مرتين لنفس الإجازة، ودون تسجيل تدقيق متسلسل (`appendChainedAuditInTransaction`).
3. **ثغرة دقة `Money` وعمولات الجراحة والتزامن في توليد واعتماد وحذف الرواتب (`HR01` / `FLOW04` / `OPS03`)**:
   - كانت `generatePayroll` تقرأ إحصائيات الحضور خارج المعاملة (`tx`)، وتحسب المعدل اليومي والساعي والدقيقي بأرقام عشرية وسيطة (`Number`) بدل الاحتفاظ بدقة `Decimal` (`Money.divide`) حتى حد التقريب، وتجمع الإجماليات العامة عبر `Money.add` الرقمي بدل `Money.sumPosted`، وتقتصر في عمولات الأطباء على `ServiceType.CONSULTATION` مع تجاهل عمولات الطاقم الجراحي (`SurgeryTeam.commissionAmount` للحالات المكتملة `COMPLETED`).
   - كانت `approvePayroll` تفتقر إلى قفل `pg_advisory_xact_lock` وقفل `PayrollRun FOR UPDATE`، وتستخدم `Number(run.totalNet)` بدل `Money.toDbString(run.totalNet)`، ولا تربط القيد بـ`postingKey` محمي ضد العكس اليدوي، ولا تسجل تدقيقًا متسلسلًا ذريًا (`APPROVE_PAYROLL_RUN`).
   - كانت شاشة [`PayrollPage.tsx`](file:///d:/SarayaERP/client/src/pages/PayrollPage.tsx) تعرض `slip.otherAllowance` فقط تحت عمود `علاوات/عمولات` وتغفل `housingAllowance` و`transportAllowance`، مما يجعل مجموع السطر الظاهر في الجدول لا يطابق `netSalary`.

---

## 2. الإصلاحات المنفذة
### أ. إحكام الورديات وجداول الدوام والإجازات ([`hr.service.ts`](file:///d:/SarayaERP/server/src/hr/hr.service.ts))
- التحقق من صيغة أوقات الوردية (`HH:mm`) وفترة السماحية (`0..240` دقيقة) في `createWorkShift`.
- فرض التحقق من ملكية `userId` و`workShiftId` للمنشأة (`hospitalId`) وصحة النطاق التاريخي (`end >= start` وبحد أقصى `366` يومًا) في `assignRoster`، والحفاظ على `entry.isOffDay` عند عدم إرسالها في `updateRosterEntry`.
- إحكام `requestLeave` داخل معاملة ذرية تقفل صف الموظف (`User FOR UPDATE`)، وترفض التواريخ المعكوسة أو المتداخلة مع طلبات `PENDING`/`APPROVED`، وتحسب الرصيد المتاح للإجازات السنوية بعد خصم الطلبات المعلقة (`PENDING`).
- إحكام `approveLeave` داخل معاملة ذرية تقفل `LeaveRequest FOR UPDATE` و`User FOR UPDATE`، وتشترط `leave.status === LeaveStatus.PENDING`، وتعيد التحقق من `annualLeaveBalance >= leave.daysCount` وعدم التداخل قبل الخصم، وتسجل تدقيقًا متسلسلًا (`APPROVE_LEAVE_REQUEST` / `REJECT_LEAVE_REQUEST`).

### ب. عزل البصمات وربط الإحصائيات بالمعاملة ([`attendance.controller.ts`](file:///d:/SarayaERP/server/src/attendance/attendance.controller.ts) و[`attendance.service.ts`](file:///d:/SarayaERP/server/src/attendance/attendance.service.ts))
- تمرير `req.user?.hospitalId` في مسارات `punch` و`bulk-import` و`upload` والتحقق من انتماء الموظف للمنشأة قبل تسجيل البصمة.
- دعم تمرير المعاملة الاختيارية `tx?: Prisma.TransactionClient` إلى `getEmployeeMonthlyStats` لضمان قراءة الحضور والجداول والإجازات المعتمدة داخل معاملة الرواتب.

### ج. إحكام توليد واعتماد وحذف الرواتب عبر `Money` ([`payroll.service.ts`](file:///d:/SarayaERP/server/src/payroll/payroll.service.ts)، [`accounting.service.ts`](file:///d:/SarayaERP/server/src/accounting/accounting.service.ts)، و[`PayrollPage.tsx`](file:///d:/SarayaERP/client/src/pages/PayrollPage.tsx))
- فرض القفل الاستشاري `pg_advisory_xact_lock(27006, hospitalId)` في `generatePayroll` و`approvePayroll` و`deletePayroll`.
- حساب المعدلات اليومية والساعية والدقيقية والاستقطاعات والعمل الإضافي وعمولات الأطباء (حسب نوع الخدمة مع fallback) وعمولات الطاقم الجراحي (`SurgeryTeam.commissionAmount` للحالات المكتملة دون ازدواجية مع رسوم `ChargeSource.SURGERY`) عبر `Money` و`Money.sumPosted` و`Money.toDbString`، مع تسجيل تدقيق متسلسل `GENERATE_PAYROLL_RUN`.
- قفل `PayrollRun FOR UPDATE` في `approvePayroll`، والتحقق من مطابقة مجموع صافي القسائم لإجمالي الكشف وكونه موجبًا، وفحص الفترة المالية عبر `financialPeriod(tx, hospitalId, payrollDate)`، والتحقق من نوعي حسابي `SALARIES_EXPENSE` (`EXPENSE`) و`SALARIES_PAYABLE` (`LIABILITY`)، وإنشاء القيد المحاسبي بـ`postingKey: payroll-run:${hospitalId}:${run.id}` المحمي ضد العكس اليدوي في `AccountingService.reverseEntry`، وتسجيل تدقيق متسلسل `APPROVE_PAYROLL_RUN`.
- إرجاع `totalAllowances` المجمعة بدقة `Money.sumPosted` لكل قسيمة في `PayrollService.findOne` وعرضها بـ3 خانات عشرية في [`PayrollPage.tsx`](file:///d:/SarayaERP/client/src/pages/PayrollPage.tsx).

---

## 3. التحقق والأدلة
- كُتبت مجموعة اختبارات التكامل [`server/test/e2e/hr-payroll-integrity.e2e-spec.ts`](file:///d:/SarayaERP/server/test/e2e/hr-payroll-integrity.e2e-spec.ts) واجتازت بنجاح كامل (`3 passed, 3 total` في `10.627 s`، السجل [`scratch/hr-payroll-20261108/e2e-focused.log`](file:///d:/SarayaERP/scratch/hr-payroll-20261108/e2e-focused.log)) على بيئة PostgreSQL (`15432`) وRedis (`16379`) المعزولة لتغطية:
  1. رفض أوقات الورديات والتواريخ المعكوسة، وعزل المنشأة في الجداول والبصمات، ومنع تداخل الإجازات أو تجاوز الرصيد المتاح مع المعلق، ومنع الخصم المزدوج عند الاعتماد المتزامن مع إثبات سجل التدقيق (`973 ms`).
  2. حساب كشف الرواتب بدقة `Money` (`HALF_EVEN` / 3 خانات عشرية) مع استبعاد الإجازة السنوية المعتمدة من الغياب، وحساب خصم الغياب والتأخير وإضافة العمل الإضافي وعمولات الاستشارات والعمليات الجراحية دون ازدواجية، وإعادة توليد المسودة بأمان (`1005 ms`).
  3. التراجع الذري الكامل عند فشل سجل التدقيق أثناء اعتماد الرواتب، وتسلسل طلبات الاعتماد المتزامنة، وتوليد قيد محاسبي متوازن (`SALARIES_EXPENSE` / `SALARIES_PAYABLE`)، ومنع حذف أو إعادة توليد أو عكس الكشف المعتمد يدويًا (`889 ms`).

---

## 4. المتبقي خارج النطاق
- السلف والقروض والاستقطاعات الدورية ومكافأة نهاية الخدمة (`CAP11`) وتراخيص الكادر الطبي (`CAP12`).
- بقية مسارات توحيد `Money` في التأمين والتقارير المالية وواجهات العرض (`FLOW04`).
