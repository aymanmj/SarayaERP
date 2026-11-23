# دفتر رسوم وعمولة المشغّل الوطني (`Gateway Clearing Fee Ledger`) والفوترة B2B واستيراد ومطابقة كشف الحساب البنكي — 2026-11-23

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — المرحلة الثالثة (الدفعة 7: المرحلة د — المقاصة المصرفية واقتصاد المشغّل الوطني) ضمن [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#64` — [`20261123160000_gateway_fee_ledger_bank_reconciliation`](../server/prisma/migrations/20261123160000_gateway_fee_ledger_bank_reconciliation/migration.sql)

---

## 1. نموذج البيانات والربط المحاسبي والترحيل `#64`

1. **مفاتيح الحسابات النظامية ودليل الحسابات ([`schema.prisma`](../server/prisma/schema.prisma) و[`accounting.service.ts`](../server/src/accounting/accounting.service.ts)):**
   - إضافة مفتاحي `SystemAccountKey`:
     - `GATEWAY_CLEARING_FEE_EXPENSE` (`511000` — مصروف رسوم وعمولات مقاصة البوابة الوطنية — السرايا للتقنية، من نوع `EXPENSE` تحت `510000`).
     - `GATEWAY_CLEARING_FEE_PAYABLE` (`200700` — ذمم ومستحقات رسوم المشغّل الوطني — شركة السرايا للتقنية، من نوع `LIABILITY` تحت `200000`).
   - ربط المفتاحين تلقائيًا في `ACCOUNT_CODES` و`SAMPLE_COA` و`ensureSampleChartOfAccounts`، وإضافة بادئتي `gateway-clearing-fee:` و`gateway-clearing-fee-settlement:` إلى قائمة القيود المحمية من العكس اليدوي في `reverseEntry`.

2. **جدول `GatewayClearingFeeEntry` (دفتر رسوم المشغّل الوطني وفواتير B2B):**
   - يربط كل دفعة مقاصة مغلقة (`claimBatchId` فريد بحالة `CLOSED` وقناة `LOCAL_CLEARINGHOUSE`) وإشعار `eraTransactionId` بفاتورة B2B فريدة (`b2bInvoiceNumber` بصيغة `SARAYA-B2B-<hospitalId>-<batchId>`).
   - يخزن عناصر الاحتساب بدقة `DECIMAL(18,3)` (و`DECIMAL(7,4)` للنسبة): `billableClaimsCount`، و`adjudicatedAmount`، و`flatFeePerClaim`، و`feeRate`، و`flatFeeTotal`، و`percentageFeeTotal`، و`totalFeeAmount`، مع قيد استحقاق `accrualEntryId` (`AccountingEntry`) وقيد سداد `settlementEntryId` ومرجع السداد البنكي `settlementBankReference`.
   - **قيود ومحفزات الترحيل `#64`:**
     - `GatewayClearingFeeEntry_status_check`: يحصر الحالة في `('ACCRUED', 'SETTLED')`.
     - `GatewayClearingFeeEntry_amounts_check`: يتحقق على مستوى PostgreSQL من أن `"billableClaimsCount" > 0` و`"feeRate" BETWEEN 0 AND 0.2500` و`"totalFeeAmount" > 0` وأن `"totalFeeAmount" = ("flatFeeTotal" + "percentageFeeTotal")` بدقة تامة.
     - `GatewayClearingFeeEntry_settlement_fields_check`: يضمن تكامل حقول السداد (`settlementRequestKey`، `settlementBankReference`، `settlementEntryId`، `settledById`، `settledAt`) عند الانتقال إلى `SETTLED` وخلوّها عند `ACCRUED`.
     - المحفز `gateway_clearing_fee_guard` (`guard_gateway_clearing_fee_entry()`): يمنع الحذف (`DELETE`)، ويمنع أي تعديل بعد `SETTLED`، ويمنع المساس بأعمدة الاستحقاق عند السداد، ويتحقق من أن الدفعة مغلقة ضمن نفس المنشأة عبر `LOCAL_CLEARINGHOUSE`.

3. **جدول `BankStatementLine` (كشف الحساب البنكي والمطابقة الآلية):**
   - يخزن الحركات البنكية المستوردة (`bankName`، `accountNumber`، `bankReference`، `transactionDate`، `direction` بقيمتي `CREDIT` أو `DEBIT`، `amount`، `status` بقيمتي `UNMATCHED` أو `MATCHED`) مع فهرس فريد مركب `(hospitalId, direction, bankReference)` لمنع تكرار استيراد الحركة نفسها.
   - **قيود ومحفزات الترحيل `#64`:**
     - `BankStatementLine_direction_check` و`BankStatementLine_status_check` و`BankStatementLine_amount_check` (`amount > 0`).
     - `BankStatementLine_match_fields_check`: يلزم عند `MATCHED` أن ترتبط حركة `CREDIT` حصريًا بـ `matchedEraId`، وحركة `DEBIT` حصريًا بـ `matchedFeeEntryId`.
     - المحفز `bank_statement_line_guard` (`guard_bank_statement_line()`): يمنع الحذف أو التعديل بعد `MATCHED`، ويتحقق من أن سجل `ERATransaction` المرتبط قد أصبح `RECONCILED` أو أن سجل `GatewayClearingFeeEntry` المرتبط قد أصبح `SETTLED` في نفس المنشأة.
     - تحديث الدالة `block_settled_insurance_reversal()` لمنع إدراج أي قيد `JOURNAL_REVERSAL` على قيود استحقاق أو سداد رسوم المشغّل الوطني (`SQLSTATE 23514`).

---

## 2. الخدمات الخلفية والواجهات البرمجية (`GatewayClearingLedgerService`)

1. **احتساب واستحقاق وسداد رسوم المشغّل ([`gateway-clearing-ledger.service.ts`](../server/src/rcm/gateway-clearing-ledger.service.ts)):**
   - `accrueBatchClearingFee` (`POST /rcm/claims/batches/:id/gateway-fee`):
     - تشترط `requestId` بصيغة `UUID v4` وتأكيدًا صريحًا (`confirmed: true`) التزامًا بضوابط القسم 5 من خطة البوابة الوطنية.
     - تحسب الرسوم الثابتة (`Money.multiply(flatFeePerClaim, totalClaims)`) والرسوم النسبية (`Money.multiply(approvedAmount, feeRate)`) والإجمالي (`Money.addDecimal`) بتقريب `ROUND_HALF_EVEN`، وتنشئ قيد استحقاق مزدوجًا (**مدين `511000` / دائن `200700`**) وفاتورة `SARAYA-B2B-*` مع دعم إعادة المحاولة المتطابقة (`201`) ورفض التعارض (`409`) وتقييد الحدث `ACCRUE_GATEWAY_CLEARING_FEE`.
   - `settleGatewayClearingFee` (`POST /rcm/claims/gateway-fees/:id/settle`):
     - تقفل السجل بـ `FOR UPDATE` وتنشئ قيد سداد مزدوجًا (**مدين `200700` / دائن `101100` `BANK_MAIN`**) وتُحدث الحالة إلى `SETTLED` مع تقييد الحدث `SETTLE_GATEWAY_CLEARING_FEE`.

2. **استيراد ومطابقة كشف الحساب البنكي:**
   - `importBankStatementLines` (`POST /rcm/claims/bank-statements/import`): تستورد حتى `200` حركة بنكية في الطلب الواحد مع التحقق من عدم تكرار المرجع، وإعادة نفس النتيجة عند تكرار الطلب، وتقييد الحدث `IMPORT_BANK_STATEMENT_LINES`.
   - `reconcileBankStatementLine` (`POST /rcm/claims/bank-statements/:id/reconcile`):
     - عند مطابقة حركة `CREDIT` مع `ERA`: تتحقق من تطابق المبلغ (`Money.eq(line.amount, era.totalPaid)`)، وتستدعي `EraProcessingService.postEraFinancialSettlement` ذريًا داخل نفس المعاملة لترحيل إيصالات المطالبات وقيودها وإغلاق `ERA`، ثم تربط الحركة بـ `matchedEraId`.
     - عند مطابقة حركة `DEBIT` مع `GATEWAY_FEE`: تتحقق من تطابق المبلغ (`Money.eq(line.amount, feeEntry.totalFeeAmount)`)، وتنفذ `settleGatewayClearingFee` ذريًا داخل نفس المعاملة لإقفال ذمة المشغّل مقابل المصرف، ثم تربط الحركة بـ `matchedFeeEntryId` وتوثق الحدث `RECONCILE_BANK_STATEMENT_LINE`.

3. **واجهة المستخدم ([`PayerBatchClearingDialog.tsx`](../client/src/pages/PayerBatchClearingDialog.tsx)):**
   - عرض نموذج احتساب واستحقاق فاتورة `B2B` على الدفعات المغلقة، وعرض بيانات الفاتورة (`SARAYA-B2B-*`) ونموذج سدادها البنكي، بالإضافة إلى لوحة استيراد حركات كشف الحساب البنكي ومطابقتها الفورية عبر `useIdempotentPost` و`Money.decimal(...)`.

---

## 3. أدلة التحقق المنفذة بعد آخر تعديل برمجي

- **مواءمة المخطط (`#64`):** طُبّق الترحيل `#64` على PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **تغطية الأمان (`ABAC` / `Tenant`):** `node generate-audit-report.cjs --check` بنسبة `Total: 100 | ABAC: 100 (100%) | Tenant: 100 (100%) | Effective (non-exempt): 88/88 (100%)`.
- **الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: دون أخطاء أو تحذيرات جديدة (`619` ملفًا، `4389` خطأً تاريخيًا، `580` تحذيرًا).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`760/760` اختبار وحدة** (`0` متخطى، `0` فاشل، `46.7 s`)، متضمّنًا اختبار `GatewayClearingLedgerService` في [`claim.service.spec.ts`](../server/src/rcm/claim.service.spec.ts).
- **العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`256/256` اختبارًا** (`0` متخطى، `28.86s`)، منها **`15/15`** في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx).
  - `npm run lint`: **`0` أخطاء و`88` تحذيرًا تاريخيًا**.
  - `npm run build`: نجاح (`12.35s`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **[`insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts):** اجتياز **`10/10`** اختبارات (`33.886 s` منفردًا) تغطي دورة استحقاق فاتورة `SARAYA-B2B-*` وقيدها (`511000` مدين / `200700` دائن)، واستيراد كشف الحساب البنكي (`CREDIT` و`DEBIT`)، والمطابقة الذرية مع `ERA-CLH-*` وفاتورة العمولة (`200700` مدين / `101100` دائن)، وعزل المستأجرين (`404`)، وحماية المحفزات ومنع عكس القيود، وسلسلة `AuditLog`.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch7-20261123/full-e2e.log`):** اجتياز **`32` من أصل `37` مجموعة (`556` من أصل `561` اختبارًا ناجحًا، `0` فاشل)** خلال `724.522 s`، مع تخطّي `5` مجموعات مشروطة بأعلام البيئة (`nursing-load` و4 مجموعات أشعة `CAP13`).

---

## 4. المتبقي المفتوح بعد اكتمال المراحل (أ، ب، ج، د) من البوابة الوطنية

1. **الطبقة الخامسة من البوابة الوطنية (تكامل الأنظمة الخارجية لشركات التأمين):** بوابة `FHIR R4` و`REST Webhooks` الموقّعة بـ `HMAC` لشركات التأمين ذات الأنظمة الخارجية المستقلة، والاعتماد التنظيمي والمصرفي لعقود تحصيل عمولات المقاصة قبل التشغيل الإنتاجي الفعلي.
2. **أمان المرفقات والتشغيل الفعلي:** ربط فحص `ClamAV` وتشفير مجلد التخزين وقت السكون وسياسة النسخ الاحتياطي والاحتفاظ (من الدفعة 5).
3. **البنود المعلقة مؤقتًا:** تكامل `NPHIES` (`CAP13`) وتطبيق الموبايل (`CAP14`) و`CLN01` وفق قرارات 2026-11-22.
4. **القبول الميداني البشري (`UAT01`)** وبقية بنود السجل الموحد المفتوحة (`DEP01`، `QA01`، `ARCH02`).
