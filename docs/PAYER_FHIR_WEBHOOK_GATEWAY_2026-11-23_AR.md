# بوابة التكامل القياسي للجهات الضامنة (`HL7 FHIR R4` + `HMAC-SHA256 Webhooks` + `mTLS` + `Zero-Trust Payer Isolation`) — 2026-11-23

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) و[`SEC03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L144) — المرحلة الثالثة (الدفعة 8: الطبقة الخامسة — الأمن والامتثال والتكامل القياسي) ضمن [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#65` — [`20261123180000_payer_webhook_fhir_gateway`](../server/prisma/migrations/20261123180000_payer_webhook_fhir_gateway/migration.sql)

---

## 1. نموذج البيانات والضوابط الأمنية والترحيل `#65`

1. **جدول `PayerIntegrationProfile` ([`schema.prisma`](../server/prisma/schema.prisma)):**
   - يربط كل شركة تأمين نشطة (`providerId` فريد ضمن `hospitalId`) بملف تكامل قياسي مستقل يحتوي على:
     - `clientId` فريد (`payer_client_<hospitalId>_<providerId>_<hex>`).
     - `apiKeyHash` فريد (بصمة `SHA-256` بطول 64 محرفًا ست عشريًا؛ لا يُخزّن مفتاح `apiKey` الخام في قاعدة البيانات مطلقًا ويُعرض مرة واحدة عند الإنشاء أو التدوير).
     - `webhookSigningSecret` (مفتاح توقيع `HMAC-SHA256` بطول 64 محرفًا ست عشريًا، يُحجب في واجهات الاستعلام ولا يُعرض منه سوى آخر 4 محارف `signingSecretHint`).
     - `webhookUrl` (مقيد ببروتوكول `https://` فقط على مستوى الترحيل والتطبيق) و`mtlsSubjectDn` الاختياري لربط شهادة العميل (`mTLS Subject DN`) و`allowedScopes`.
   - **قيود ومحفزات PostgreSQL (`#65`):**
     - `PayerIntegrationProfile_security_check`: يشترط `"apiKeyHash" ~ '^[0-9a-f]{64}$'` و`length("webhookSigningSecret") >= 32` و`("webhookUrl" IS NULL OR "webhookUrl" ~ '^https://')`.
     - المحفز `payer_integration_profile_guard` (`guard_payer_integration_profile()`): يتحقق من أن `providerId` يتبع نفس `hospitalId` قبل أي إدراج أو تحديث (`SQLSTATE 23514`).

2. **جدول `PayerWebhookEvent` (سجل التبادل القياسي غير القابل للتعديل):**
   - يوثق كل حزمة `OUTBOUND` (`FHIR R4 Bundle`) وكل رد `INBOUND` (`FHIR R4 ClaimResponse`) مع `deliveryId` فريد (`UUID v4`)، وبصمة `payloadSha256`، وتوقيع `hmacSignature` (`sha256=<64-hex>`)، والطابع الزمني `signatureTimestamp`، وحمولة `fhirPayload` (`JSONB`).
   - **قيود ومحفزات PostgreSQL (`#65`):**
     - `PayerWebhookEvent_direction_check` (`'OUTBOUND' | 'INBOUND'`)، و`PayerWebhookEvent_status_check` (`'DISPATCHED' | 'VERIFIED'`)، و`PayerWebhookEvent_hashes_check` (`payloadSha256` و`hmacSignature`).
     - المحفز `payer_webhook_event_immutable_guard` (`guard_payer_webhook_event()`): يمنع `UPDATE` و`DELETE` قطعًا (`Payer FHIR webhook audit log is immutable`)، ويتحقق عند الإدراج من تطابق `hospitalId` و`providerId` بين الحدث وملف التكامل والدفعة (`claimBatchId`) لمنع أي تسرب عابر للجهات الضامنة أو المنشآت على مستوى قاعدة البيانات.

---

## 2. خدمة بوابة التكامل القياسي (`PayerFhirGatewayService`)

1. **إدارة ملفات التكامل وتدوير المفاتيح ([`payer-fhir-gateway.service.ts`](../server/src/rcm/payer-fhir-gateway.service.ts)):**
   - `GET /rcm/claims/payer-gateway/profiles` (`claims:read`) و`POST /rcm/claims/payer-gateway/profiles` (`claims:update` عبر `UpsertPayerIntegrationProfileDto`): إنشاء أو تدوير بيانات اعتماد الجهة الضامنة تحت قفل `pg_advisory_xact_lock(27011, hospitalId)` مع تقييد الحدث `CONFIGURE_PAYER_INTEGRATION_PROFILE`.

2. **تصدير دفعات المطالبات كحزم `HL7 FHIR R4 Bundle` موقّعة بـ `HMAC-SHA256`:**
   - `POST /rcm/claims/batches/:id/fhir-bundle` (`exportBatchAsSignedFhirBundle` عبر `ExportFhirBatchBundleDto`):
     - يتحقق من أن الدفعة في حالة `SUBMITTED` أو `CLOSED` ومن وجود ملف تكامل نشط لشركة التأمين.
     - يبني حزمة `FHIR R4 Bundle` (`type: 'collection'`) تضم موارد `Organization` للمنشأة والجهة الضامنة وموارد `Claim` لكل مطالبة بقيم مالية مضبوطة عبر `Money.toDbString` بعملة `LYD` ومعرّفات المقاصة الوطنية `LY-CLH-<batchId>-<claimId>` ومعرّف `MPI` الاتحادي.
     - يوقّع السلسلة القانونية `${timestampIso}.${deliveryId}.${payloadSha256}` بـ `HMAC-SHA256`، ويحفظ سجل `PayerWebhookEvent` (`OUTBOUND`) مع دعم إعادة المحاولة بنفس `deliveryId` وتقييد الحدث `EXPORT_FHIR_CLAIM_BATCH_BUNDLE`.

3. **استقبال ومعالجة ردود `FHIR R4 ClaimResponse` الموقّعة (`Zero-Trust Inbound Webhook`):**
   - `POST /rcm/claims/payer-gateway/webhooks/claim-response` (`processInboundSignedClaimResponseWebhook` عبر `InboundSignedClaimResponseWebhookDto`):
     - يتحقق زمنيًا من نافذة الطابع الزمني (`±5 دقائق` للحماية من هجمات الإعادة `Replay Attacks`).
     - يتحقق من `apiKey` عبر مقارنة ثابتة الزمن (`timingSafeEqual` على بصمة `SHA-256`)، ومن تطابق شهادة `mTLS` (`mtlsSubjectDn`) عند تفعيلها (`403 Forbidden` عند الاختلاف)، ومن صحة توقيع `HMAC-SHA256` (`401 Unauthorized` عند أي عبث بالحمولة أو الطابع الزمني).
     - **عزل الجهات الضامنة (`No Cross-Payer Leakage`):** يرفض بـ `403 Forbidden` أي محاولة من شركة التأمين (ب) للبت في دفعة تخص شركة التأمين (أ) حتى داخل نفس المنشأة، ويرفض بـ `404 Not Found` أي وصول عابر للمنشآت.
     - يستدعي `BatchSubmissionService.adjudicateBatchInClearinghouse` ذريًا لإصدار قرارات البت وتوليد إشعار `ERA-CLH-<batchId>` وإغلاق الدفعة، ويحفظ حدث `PayerWebhookEvent` (`INBOUND` / `VERIFIED`) مع تقييد `PROCESS_PAYER_FHIR_CLAIM_RESPONSE_WEBHOOK`.

4. **واجهة المستخدم ([`PayerBatchClearingDialog.tsx`](../client/src/pages/PayerBatchClearingDialog.tsx)):**
   - إضافة زر تصدير حزمة `FHIR R4` الموقّعة بـ `HMAC` على بطاقات الدفعات المرسلة والمغلقة عبر `useIdempotentPost` وعرض مختصر التوقيع الرقمي `sha256=...` مع الترجمات في [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 3. أدلة التحقق المنفذة بعد آخر تعديل برمجي

- **مواءمة المخطط (`#65`):** طُبّق الترحيل `#65` على PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **تغطية الأمان (`ABAC` / `Tenant`):** `node generate-audit-report.cjs --check` بنسبة `Total: 100 | ABAC: 100 (100%) | Tenant: 100 (100%) | Effective (non-exempt): 88/88 (100%)`.
- **الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: دون أخطاء أو تحذيرات جديدة (`620` ملفًا، `4389` خطأً تاريخيًا، `580` تحذيرًا).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`761/761` اختبار وحدة** (`0` متخطى، `0` فاشل، `46.922 s`)، متضمّنًا اختبار `PayerFhirGatewayService` في [`claim.service.spec.ts`](../server/src/rcm/claim.service.spec.ts).
- **العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`257/257` اختبارًا** (`0` متخطى)، منها **`16/16`** في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx).
  - `npm run lint`: **`0` أخطاء و`88` تحذيرًا تاريخيًا**.
  - `npm run build`: نجاح (`15.92s`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **[`insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts):** اجتياز **`11/11`** اختبارات (`43.696 s` منفردًا) تغطي إلزامية `https://`، وتصدير حزمة `FHIR R4 Bundle` الموقّعة، ورفض التوقيع المزور (`401`)، ورفض شهادة `mTLS` غير المطابقة (`403`)، ورفض الوصول العابر بين شركات التأمين (`403`)، والعزل بين المنشآت (`404`)، والبت الآلي وتوليد `ERA-CLH-*`، ومنع تعديل أو حذف `PayerWebhookEvent` عبر PostgreSQL، والتدقيق المتسلسل.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch8-20261123/full-e2e.log`):** اجتياز **`32` من أصل `37` مجموعة (`557` من أصل `562` اختبارًا ناجحًا، `0` فاشل)** خلال `768.524 s`، مع تخطّي `5` مجموعات مشروطة بأعلام البيئة (`nursing-load` و4 مجموعات أشعة `CAP13`).

---

## 4. المتبقي المفتوح بعد اكتمال الطبقات الخمس للبوابة الوطنية

1. **الاعتماد التنظيمي والمصرفي والتشغيل الميداني:** المراجعة القانونية والتنظيمية (مصرف ليبيا المركزي وهيئة الإشراف على التأمين والعقود التجارية) قبل تفعيل التحصيل البنكي الآلي للعمولات في الإنتاج، وربط مسح `ClamAV` وتشفير مجلد المرفقات وقت السكون، والقبول الميداني البشري (`UAT01`).
2. **البنود المعلقة مؤقتًا:** تكامل `NPHIES` (`CAP13`) وتطبيق الموبايل (`CAP14`) و`CLN01` وفق قرارات 2026-11-22.
