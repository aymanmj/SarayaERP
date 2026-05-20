# مراجعة معمقة لنظام السرايا الطبي

تاريخ المراجعة الأصلية: 2026-05-13
آخر تحديث لهذه النسخة: 2026-05-20
نطاق المراجعة: ملفات وأكواد المستودع الحالي في `E:\SarayaERP`، مع مقارنة سوقية مرجعية بالأنظمة العالمية والإقليمية.

## 1. الخلاصة التنفيذية العادلة

النتيجة الأهم بعد المراجعة المعمقة والتحديثات الأخيرة: **نظام السرايا الطبي ليس مجرد نظام إدارة عيادات أو HIS تقليدي، بل منصة طبية/إدارية Enterprise ناضجة تقنيا بدرجة واضحة، مع بقاء النضج التجاري والتشغيلي بحاجة إلى إثباتات خارج الكود**. الكود يحتوي فعليا على طبقات لا تظهر عادة في الأنظمة الصغيرة: حوكمة المحتوى السريري، Revenue Cycle Management، NPHIES، FHIR R4، بوابة مريض، CDSS، AI Coding Assistance، عزل مستأجرين، MPI/Federation للسجل الموحد، consent revocation، تدقيق بسلسلة hash، تشفير، Vault، مراقبة، نسخ احتياطي، وإدارة تشغيلية واسعة.

التصنيف الأقرب:

- **وظيفيا:** HIS/ERP طبي متكامل يغطي المستشفى والمركز الطبي والعيادات، مع امتدادات RCM وتكاملات.
- **تقنيا:** منصة NestJS/React/Prisma/PostgreSQL/Redis قابلة للتوسع، وليست prototype في الخادم أو الويب. التحسينات الأخيرة عالجت نقاطا مؤثرة مثل ABAC/Permissions coverage، Redis-backed counters، FHIR consent blacklist، وتحسينات NPHIES/JWT.
- **تجاريا:** منتج قوي يحتاج إلى إثباتات سوقية وتشغيلية خارج الكود: مواقع تشغيل فعلية، شهادات امتثال، NPHIES certification/production evidence، SIEM فعلي، اختبارات اختراق، ومرجعيات عملاء.
- **الموبايل:** كما ذكرت، تطبيق الموبايل ما يزال Prototype ولم يدخل مرحلة الإنتاج، وهذا واضح من كثرة `any`، TODO crash reporting، وبنية offline/sync الأولية.
- **Developer ecosystem:** بدأ فعليا عبر FHIR/SMART OAuth وregistered apps وSubscriptions ودليل تكامل عملي وواجهة Integration، لكنه لم يصل بعد إلى Marketplace كامل بواجهة إدارة تطبيقات خارجية ودليل مطورين عام.

بالتالي، الحكم العادل هو: **السرايا أقوى بكثير من نظام محلي عادي، لكنه لا يقارن بعد بعمق Epic أو Oracle Health كمنظومة عالمية عاملة على آلاف المؤسسات، إلا إذا قورنت النسخة الحالية كمنتج قابل للتسويق في أسواق عربية/إقليمية محددة.**

## 2. منهجية المراجعة

تمت مراجعة:

- هيكل المستودع: `server`, `client`, `mobile`, `docs`, `production`, `monitoring`, `scripts`, `docker`.
- مخطط قاعدة البيانات: `server/prisma/schema.prisma`.
- وحدات الخادم: `server/src`.
- واجهة الويب: `client/src`.
- تطبيق الموبايل: `mobile`.
- وثائق التشغيل والحوكمة: `docs`, `production`, `monitoring`.
- نتائج الاختبارات والبناء.
- مصادر سوقية حديثة للأنظمة العالمية والإقليمية.

## 3. مؤشرات كمية من الكود

| المؤشر | النتيجة |
|---|---:|
| ملفات الخادم داخل `server/src` | 454 |
| ملفات الواجهة داخل `client/src` | 253 |
| ملفات الموبايل | 49 |
| اختبارات الخادم | 64 ملفا |
| نماذج Prisma | 193 model |
| Enums في Prisma | 116 enum |
| Controllers في الخادم | 89 |
| Services في الخادم | 106 |
| اختبارات الخادم التي نجحت | 64/64 suites |
| عدد اختبارات الخادم | 558 passed, 4 skipped |
| بناء الواجهة | نجح |
| Lint الواجهة | نجح مع 65 تحذيرا |
| ABAC/Permissions coverage حسب التقرير | 89/89 controllers |
| Effective ABAC coverage حسب التقرير | 77/77 بعد استثناء auth/health/FHIR ونحوها |

هذه الأرقام مهمة لأنها تؤكد أن النظام كبير فعلا، وأن جودة الكود الأمامي تحسنت بوضوح بعد إزالة أخطاء lint وتحويل الباقي إلى تحذيرات محدودة، كما أن تغطية الصلاحيات والعزل أصبحت موثقة في `audit_coverage_report.md`.

## 4. ما هو موجود فعلا في نظام السرايا

### 4.1 المجال السريري

موجود فعلا:

- المرضى، MPI، الزيارات، encounters، التنويم، الطوارئ، التحويلات، الخروج.
- الأوامر الطبية، المختبر، الأشعة، الصيدلية، الوصفات، صرف الدواء، العلامات الحيوية.
- التمريض، ICU، العمليات، النساء والولادة، الخصوبة، التاريخ الطبي، الملاحظات السريرية، discharge summary.
- CDSS وتنبيهات سريرية.
- AI Coding Assistance لاقتراح ICD-10 وCPT وE&M من الملاحظات السريرية ثم اعتمادها من الطبيب وحفظها في التشخيص والفوترة.
- بوابة مريض تشمل المواعيد، المعلومات الطبية، الفواتير، الرسائل، طلب إعادة صرف.
- FHIR R4 patient-scoped export و CapabilityStatement وموارد Patient/Observation/Condition/MedicationRequest وغيرها.

التقييم: **قوي جدا وظيفيا**، خصوصا مقارنة بأنظمة عربية كثيرة تركز على التسجيل والفوترة ولا تصل إلى عمق سريري مماثل.

### 4.1.1 AI Coding Assistance

هذه الميزة موجودة فعلا في الكود وليست مجرد فكرة.

الأدلة:

- `server/src/clinical/ai-coding/ai-coding.module.ts` مضاف في `AppModule`.
- `server/src/clinical/ai-coding/ai-coding.controller.ts` يوفر:
  - `POST /clinical/ai-coding/suggest` لاقتراح الأكواد.
  - `POST /clinical/ai-coding/apply` لاعتماد الأكواد المختارة.
- `server/src/clinical/ai-coding/ai-coding.service.ts` يستخدم Gemini عبر `GEMINI_API_KEY` من Vault أو البيئة، ويطلب إخراج JSON منظم.
- يقترح ICD-10 diagnoses وCPT procedures مع confidence وreasoning.
- مسار `applySuggestedCodes` لا يحفظ كل ما يقترحه النموذج تلقائيا، بل يحفظ فقط `selectedDiagnoses` و`selectedProcedures` القادمة من الواجهة بعد اختيار المستخدم.
- الخادم يرفض الاعتماد إذا لم يتم اختيار كود واحد على الأقل، ويتأكد أن الزيارة مفتوحة وتتبع نفس `hospitalId`.
- عند الاعتماد، يحفظ ICD-10 في `EncounterDiagnosis`، وينشئ أو يربط `TerminologyConcept` و`DiagnosisCode`.
- يحول CPT إلى `EncounterCharge` مع محاولة جلب السعر من Price Lists، ما يربط التوثيق السريري بالفوترة.
- في الواجهة، `client/src/pages/EncounterDetailsPage.tsx` يحتوي نافذة مراجعة واعتماد الأكواد المقترحة: اختيار/إلغاء اختيار التشخيصات والإجراءات، تحديد primary/secondary diagnosis، ثم الضغط على زر `اعتماد المختار`.

التقييم: **ميزة تجارية قوية جدا** لأنها تربط الطبيب، الترميز، المطالبات، والفوترة.  
الملاحظة العادلة: مبدأ `human-in-the-loop` موجود فعلا؛ الترميز لا يعتمد من الذكاء الاصطناعي وحده، بل بعد مراجعة واختيار واعتماد من المستخدم السريري داخل شاشة الزيارة. الفجوة المتبقية ليست "منع الاعتماد الآلي"، بل تقوية الضبط المؤسسي: audit واضح لكل اقتراح واعتماد، تسجيل هوية الطبيب/المراجع ودوره، فرض أن الاعتماد يتم من الطبيب المعالج أو مستخدم مصرح بوضوح حسب سياسة المؤسسة، قياس دقة مستمر، وربط قواعد payer/NPHIES قبل إرسال المطالبات.

### 4.1.2 منصة السجل الوطني / الشبكة الصحية الوطنية

يوجد في الكود أساس معماري واضح يسمح للسرايا أن يعمل كمنصة شبكة وطنية أو سجل موحد للمرضى إذا تبنته وزارة أو مؤسسة صحية كبيرة.

الأدلة:

- `Organization` في Prisma يدعم hierarchy عبر `parentId` و`children`، وأنواع مثل `NETWORK` و`MEDICAL_CITY`.
- `Hospital` مرتبط بـ `organizationId`، ما يسمح بمؤسسة أم تضم عدة مستشفيات وفروع.
- `Patient` يحتوي `globalPatientId` ويرتبط بـ `GlobalPatient`.
- `GlobalPatient` يمثل Master Patient Index ويدعم hashed identifiers مثل `nationalIdHash`, `identityNumberHash`, `phoneHash`, `emailHash`.
- `server/src/patients/mpi.service.ts` ينفذ cross-facility patient search عبر MPI.
- إعدادات المؤسسة تتحكم في التفعيل:
  - `mpi.enableFederation`
  - `mpi.requirePatientOTP`
  - `mpi.shareDataConsent`
- `MpiService` يرفض البحث إذا كانت federation غير مفعلة تنظيميا.
- عند تفعيل OTP، يعيد حالة `REQUIRES_OTP` بدل كشف البيانات مباشرة.
- `triggerConsentOtp` يرسل OTP للمريض عبر outbound queue، مع حفظ الغرض والجهة الطالبة.
- `verifyConsentOtp` يصدر temporary consent token لمدة ساعة للوصول إلى FHIR patient scope.
- `revokeConsent` يبطل OTPs والموافقات السابقة، ويسجل `MPI_CONSENT_REVOKED` في audit log.
- عند الإلغاء، يتم وضع blacklist في Redis على مستوى المريض أو المؤسسة، ويقوم `FhirAuthService.validateToken` بفحص هذه القائمة عند استخدام `mpi_consent` token.
- `MpiConsentRecord` في Prisma يضيف سجل موافقات فعلي بحالات مثل `ACTIVE` و`REVOKED` وحقول `revokedAt`, `revokedReason`, `otpVerifiedAt`.
- `server/src/patients/patients.service.ts` ينشئ سجل موافقة MPI عند إنشاء المريض، إما `PENDING_OTP` أو `ACTIVE` حسب إعدادات المؤسسة.
- `server/src/settings/settings.controller.ts` و`client/src/pages/OrganizationSettingsPage.tsx` يضيفان واجهة إدارية لتفعيل federation واشتراط OTP، مع عرض إحصاءات الربط على مستوى الشبكة.
- `MpiController` يوفر:
  - `GET /mpi/search`
  - `POST /mpi/consent/trigger`
  - `POST /mpi/consent/verify`
  - `DELETE /mpi/consent/revoke/:patientId`
  - `GET /mpi/consent/audit/:patientId`
- الواجهة تحتوي إشارات MPI في `PatientsPage` و`EncounterDetailsPage`.

التقييم: **هذه ليست مجرد ميزة مستشفى واحد؛ هذه طبقة HIE/MPI يمكن أن تصبح أساس سجل وطني موحد**.  
الملاحظة العادلة: الموجود حاليا هو foundation قوي ومعه consent registry ومسار revocation/audit فعليان. بعد التحديث الأخير أصبح FHIR auth يتحقق من blacklist في Redis عند استخدام `mpi_consent` token، مع fallback إلى قاعدة البيانات عند تعطل Redis. ما يزال التشغيل الوطني يحتاج IHE profile mapping، audit مخصص لكل طلب تبادل، patient matching tuning، APIs موثقة للمؤسسات الخارجية، وإثباتات أداء وأمن على مستوى وطني.

### 4.1.3 الجودة وسلامة المرضى: Incident / Near Miss / CAPA

بعد التحديثات الأخيرة أصبحت هذه النقطة موجودة في الكود وليست مجرد backlog.

الأدلة:

- `server/src/quality/quality.module.ts` مضاف في `AppModule`.
- `server/src/quality/quality.controller.ts` يوفر مسارات dashboard، الحوادث، near miss، إغلاق الحوادث، CAPA، والتحقق من CAPA.
- `server/src/quality/quality.service.ts` يدير ترقيم الحوادث عبر Redis/Lua مع fallback لقاعدة البيانات، تواريخ المراجعة حسب severity، منع إغلاق الحادث قبل اكتمال CAPA، وإحصاءات dashboard.
- `QualityService` يصدر أحداث `quality.incident_reported` و`quality.capa_added`.
- `server/src/notifications/notifications.listener.ts` يستقبل أحداث الجودة ويرسل إشعارات للأدوار المعنية.
- `server/prisma/schema.prisma` يحتوي `ClinicalIncident` و`CapaAction` مع enums للحالة والشدة والنوع وroot cause.
- `client/src/pages/QualityAndSafetyPage.tsx` يوفر واجهة dashboard، تسجيل حادث، قائمة الحوادث، ومهام CAPA.

التقييم: **هذه إضافة مهمة ترفع نضج السرايا في مجال Clinical Governance وسلامة المرضى**.  
الملاحظات المتبقية: تمت إضافة `PermissionsGuard` وصلاحيات `quality:view` و`quality:manage` لمسارات الجودة الأساسية، كما أصبح توليد رقم الحادث مدعوما بعداد Redis/Lua مع fallback لقاعدة البيانات، وأضيفت إشعارات الجودة. المتبقي هنا هو اختبار ضغط فعلي لهذا المسار، وحسم صلاحيات `my-capa-tasks` وبلاغ الحادث لأنهما تحت guard عام دون `@Permissions` صريحة، وربط CAPA مباشرة بدورة حياة order sets/pathways وCDSS عندما يكون السبب السريري أو الإجرائي متكررا.

### 4.2 حوكمة المحتوى السريري

هذه نقطة كانت تستحق تصحيحا واضحا: **حوكمة Order Sets و Clinical Pathways موجودة فعلا في الكود**.

الأدلة:

- `OrderSet` و `ClinicalPathway` في `server/prisma/schema.prisma` يحتويان على versioning و lifecycle: draft, review, approve, publish, retire.
- `OrderSetReviewEvent` و `ClinicalPathwayReviewEvent` يسجلان أحداث المراجعة.
- `PathwayEnrollment`, `PathwayVariance`, `CareTask` تدعم متابعة المسار السريري والاختلافات.
- `server/src/order-sets/order-sets.service.ts` يمنع تعديل النسخة المنشورة مباشرة، وينشئ draft version جديدة.
- `server/src/clinical-pathways/clinical-pathways.service.ts` يفرض نشر Order Sets المرتبطة قبل نشر Pathway، ويدير enrollment وvariance وcare tasks.
- صفحات الواجهة: `OrderSetsPage.tsx` و `ClinicalPathwaysPage.tsx`.

التقييم: **ميزة Enterprise حقيقية**.  
الملاحظة: وثائق `docs/clinical-governance` تحسنت وتذكر الآن حالة إنجاز عدة epics، لكن ما زال يلزم تدقيقها دوريا حتى لا تتعارض مع أسماء النماذج والمسارات الفعلية في الكود عند العرض التجاري.

### 4.3 الإدارة المالية و RCM

موجود فعلا:

- Billing, invoices, payments, cashier, accounting, vouchers, financial years.
- Insurance وprice lists وcontracted pricing.
- RCM module: claims, claim batches, scrubbing, status history, denial, appeal, payments, dashboard.
- تكامل NPHIES للـ eligibility والclaims والpreauth.

الأدلة:

- نماذج `Claim`, `ClaimBatch`, `ClaimScrubResult`, `ClaimHistory` في Prisma.
- `server/src/rcm/claim.service.ts`.
- `server/src/rcm/scrubber/claim-scrubber.service.ts`.
- `server/src/integration/nphies/*`.
- اختبارات `server/src/rcm/claim.service.spec.ts`.
- اختبارات `server/src/integration/nphies/nphies-claim.service.spec.ts` تغطي عزل المستأجرين في الإرسال والاستعلام والموافقة المسبقة.

التقييم: **قوي على مستوى المنتج المحلي والإقليمي**.  
الفجوة: يحتاج إلى إثباتات تشغيل فعلية مع payers/NPHIES، ومراجعة محاسبية للتكامل النهائي بين ERA/claims/accounting حسب كل سوق.

### 4.4 NPHIES

ميزة NPHIES موجودة فعلا وليست مجرد شعار.

موجود في الكود:

- OAuth2 client credentials.
- دعم mTLS عند توفر الشهادات.
- Eligibility check.
- Claims submission.
- Preauthorization submission.
- بناء FHIR Bundles وMessageHeader وCoverage وPatient.
- Outbound queue عند انقطاع الاتصال.
- Connectivity monitor.
- حماية `NphiesController` بـ `PermissionsGuard` وصلاحيات claims/NPHIES.
- فحوصات tenant isolation داخل `NphiesClaimService` قبل الإرسال والاستعلام.

التقييم: **تكامل تقني جدي**.  
المطلوب قبل البيع في السعودية: إثبات sandbox/production certification، سجلات نجاح فعلية، mapping كامل للأكواد، test packs، وإجراءات تشغيلية للتعامل مع rejection/resubmission.

### 4.5 الأمن والامتثال والتشغيل

موجود فعلا:

- JWT access/refresh tokens مع rotation وreuse detection.
- Vault للسرية والمفاتيح.
- Startup security validator يمنع قيم JWT/Encryption الافتراضية في production.
- AES-256-GCM لتشفير بيانات حساسة.
- Helmet/CORS/ValidationPipe/throttling.
- Audit interceptor وAuditLog.
- Audit hash chain مع verify/repair.
- Compliance report لـ ISO 27001 وSOC2 وHIPAA readiness controls.
- SIEM logger.
- Tenant isolation في Prisma extension مع حقن/تحقق `hospitalId` ومنع cross-tenant access.
- Clinical ABAC وbreak-glass audit.
- تقرير `audit_coverage_report.md` يوثق 89/89 controllers كـ ABAC guarded وtenant isolated، مع effective coverage 77/77 بعد الاستثناءات.
- Backup service وbackup worker وrestore scripts.
- Monitoring: Prometheus, Grafana, Alertmanager, OpenTelemetry.
- Docker production stack وNginx/Kong configs.

التقييم: **فوق المتوسط بوضوح** لمنصة عربية محلية.  
الفجوة: readiness في الكود لا يساوي certification. يلزم external audit، penetration test، runbooks موقعة، retention policies، SIEM فعلي، واختبارات restore موثقة. كما أن تقرير التغطية يجب أن يبقى قابلا للتدقيق آليا في CI وليس ملفا ساكنا فقط.

### 4.5.1 Marketplace / Developer Portal

بدأ تطوير هذه النقطة فعلا، والأصح وصفها حاليا بأنها **Developer enablement / Integration platform قيد النضج** وليست فجوة كاملة.

الأدلة:

- `server/src/integration/fhir/fhir.auth.service.ts` يوفر SMART on FHIR Authorization Service.
- يدعم registered apps عبر `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET`, و`FHIR_REGISTERED_APPS`.
- يدعم grant types:
  - `client_credentials`
  - `authorization_code`
- يدعم scopes مثل:
  - `patient/*.read`
  - `patient/*.write`
  - `system/*.read`
  - `system/Subscription.write`
- `server/src/integration/fhir/fhir.controller.ts` يوفر:
  - `GET /api/fhir/.well-known/smart-configuration`
  - `GET /api/fhir/oauth/authorize`
  - `POST /api/fhir/oauth/token`
  - موارد FHIR متعددة محمية بـ scopes.
  - `GET/POST /api/fhir/Subscription`.
- `server/src/integration/fhir/fhir.service.ts` يدعم FHIR Subscriptions و`rest-hook` webhook endpoints، ويخزن الاشتراكات في `fhirSubscription`.
- `docs/FHIR_دليل_التكامل_العملي.md` يعمل كدليل مطور عملي، ويشرح token flow، scopes، registered apps، قراءة/كتابة FHIR، Subscription، وأمثلة webhook receiver.
- `client/src/pages/IntegrationPage.tsx` يوفر واجهة لإدارة أجهزة LIS/PACS والـ code mappings وسجلات التكامل.

التقييم: **موجود جزئيا وبداية صحيحة جدا**.  
ما ينقص ليصبح Marketplace/Developer Portal احترافيا:

- جدول/نموذج `RegisteredFhirApp` في قاعدة البيانات بدل الاعتماد على env.
- واجهة إدارة تطبيقات للمطورين: إنشاء app، client secret rotation، scopes approval، redirect URI، status.
- developer portal مرئي: docs، API explorer، webhooks، examples، SDK downloads.
- application review workflow وaudit لكل app.
- rate limits وquotas لكل تطبيق.
- test sandbox وdeveloper keys منفصلة عن production.

### 4.6 الواجهة الأمامية

موجود:

- واجهة React/Vite واسعة تغطي أغلب وحدات النظام.
- PWA.
- صفحات تشغيلية كثيرة للمرضى، المواعيد، encounter details، المختبر، الأشعة، الصيدلية، المالية، RCM، NPHIES، compliance، backup، settings، وغيرها.
- build ناجح.

نقاط الضعف:

- لا توجد أخطاء lint حاليا، لكن بقيت 65 تحذيرا.
- استخدام `any` ما زال موجودا في مواضع متعددة، لكنه لم يعد يكسر lint بسبب تحويله إلى warning.
- بعض النصوص العربية في ملفات معينة تظهر كـ encoding/mojibake.
- bundle كبير، خصوصا DICOM loader وindex chunk.
- الحاجة إلى UX audit لمسارات المستخدمين الحرجة: التسجيل، الفوترة، claims، المختبر، الأشعة، التنويم.

التقييم: **وظيفيا واسعة وقابلة للبناء حاليا، لكنها تحتاج polishing هندسي وتجاري قبل demo أمام مستشفيات كبيرة**. وضع الواجهة تحسن بوضوح بعد انتقال lint من فشل كبير إلى نجاح مع تحذيرات.

### 4.7 تطبيق الموبايل

الحكم العادل مطابق لما ذكرته: **Prototype**.

موجود:

- Expo/React Native.
- login, rounds, patient details, pharmacy worklist, dispensing, profile.
- hooks للعلامات الحيوية، المختبر، الأشعة، الأدوية، clinical notes.
- Storage/Sync services.

غير ناضج للإنتاج:

- TODO crash reporting.
- typing ضعيف وكثرة `any`.
- offline conflict resolution غير مكتمل.
- security hardening وتخزين الأسرار يحتاجان مراجعة إنتاجية.
- لا توجد دلائل كافية على E2E mobile release pipeline أو app store readiness.

## 5. نقاط القوة الرئيسية

1. **اتساع وظيفي كبير** يغطي HIS + ERP + RCM + patient portal + clinical modules.
2. **حوكمة سريرية ناضجة نسبيا** من خلال order sets/pathways/versioning/review/variance.
3. **تكامل NPHIES تقني جدي** ومهم جدا للسوق السعودي.
4. **FHIR R4 وpatient-scoped export** يعطي النظام بوابة مهمة للتكامل.
5. **AI Coding Assistance** يربط الملاحظة السريرية بالترميز والفوترة.
6. **MPI/Federation وConsent OTP** تؤهل السرايا ليكون منصة شبكة صحية وطنية عند اكتمال الحوكمة.
7. **أمن وتشغيل أعلى من المعتاد**: Vault, audit hash chain, tenant isolation, backup, monitoring.
8. **وحدة Quality / Incident / Near Miss / CAPA** أصبحت موجودة كمسار تشغيلي في الخادم والواجهة، ومعها صلاحيات جودة أساسية، إشعارات، وترقيم حوادث أكثر أمانا عبر Redis.
9. **ABAC/Tenant isolation موثق** عبر `audit_coverage_report.md` وPrisma extension.
10. **اختبارات خادم جيدة نسبيا**: 558 اختبارا ناجحا.
11. **بنية قابلة للتوسع** باستخدام NestJS/Prisma/PostgreSQL/Redis/Bull/OpenTelemetry.
12. **ملكية كاملة للكود** تمنح مرونة أعلى من الأنظمة المغلقة.

## 6. نقاط الضعف والمخاطر

1. **النضج التجاري غير مثبت من الكود وحده**: لا توجد في المستودع أدلة كافية على عدد العملاء، uptime حقيقي، شهادات، أو تشغيل production واسع.
2. **Lint الواجهة تحسن جذريا**: لم تعد هناك أخطاء lint، لكن بقيت 65 تحذيرا أغلبها `any` وتعطيلات eslint غير مستخدمة.
3. **الموبايل prototype** ولا يجب بيعه كمنتج إنتاجي مكتمل بعد.
4. **الوثائق تحسنت لكنها تحتاج ضبطا مستمرا**: لم تعد الفجوات القديمة كلها صحيحة، لكن يجب منع عودة التعارض بين docs والكود.
5. **الامتثال readiness وليس certification**: ISO/SOC2/HIPAA readiness controls موجودة، لكن الاعتماد الخارجي غير مثبت.
6. **NPHIES يحتاج إثبات خارجي**: وجود الكود ممتاز، لكن السوق السعودي سيطلب certification وsuccessful transactions.
7. **CDSS يحتاج knowledge base سريرية أعمق**: بعض المنطق يبدو محليا/ثابتا ويحتاج قواعد دوائية/إرشادية معتمدة.
8. **AI Coding يحتاج حوكمة تدقيق أقوى**: مسار الاعتماد البشري موجود ولا يعتمد الترميز تلقائيا من النموذج، لكن يلزم audit أعمق للاقتراح والاعتماد، وفرض أوضح لهوية الطبيب المعالج/المراجع المصرح، وقياس دقة دوري.
9. **MPI الوطني يحتاج حوكمة وطنية**: الأساس البرمجي وسجل الموافقات ومسار الإلغاء وإنفاذ blacklist موجودة، لكن التشغيل الوطني يحتاج اتفاقيات تبادل، سياسات retention، ومطابقة مرضى أكثر صرامة.
10. **Quality/CAPA يحتاج ربطا أعمق**: الوحدة أصبحت موجودة وصلاحياتها وترقيمها وإشعاراتها تحسنت، لكنها تحتاج اختبار ضغط، وتدفق CAPA مغلق مع Clinical Content Lifecycle عند تكرار السبب الجذري.
11. **قابلية المقارنة مع Epic/Oracle محدودة** بسبب غياب شبكة عملاء، Marketplace مكتمل، ecosystem، certifications، وبيانات تشغيل فعلية.

## 7. موقع السرايا مقارنة بالأنظمة العالمية

### Epic

Epic يتفوق عالميا في:

- انتشار واسع جدا في أنظمة صحية كبرى.
- سجل مريض طولي وشبكة ضخمة.
- MyChart وCosmos وCare Everywhere وMarketplace ونضج تنفيذي عميق.
- وفق مصادر سوقية مثل KLAS/CNBC في 2025، Epic واصل زيادة حصته في سوق EHR الحاد في الولايات المتحدة، بينما خسر Oracle Health منشآت وأسرة في الفترة نفسها.

مقارنة السرايا:

- السرايا يمتلك جزءا من العمق الوظيفي، لكنه لا يمتلك بعد ecosystem أو network effect أو اعتماد واسع.
- أقرب نقاط القوة أمام Epic هي المرونة المحلية، العربية، NPHIES، AI Coding، MPI/Federation للسجل الموحد، والتكلفة الأقل.
- لا يصح حاليا القول إن السرايا منافس مباشر لـ Epic عالميا؛ الأصح أنه **بديل إقليمي محتمل لشريحة مستشفيات ومراكز تحتاج نظاما مرنا ومحليا**.

### Oracle Health

Oracle Health يتفوق في:

- Millennium/Oracle Health ecosystem.
- Interoperability network وQHIN/TEFCA في الولايات المتحدة.
- Developer program وFHIR APIs وmarketplace.
- استثمارات ضخمة في cloud/AI/identity/interoperability.

مقارنة السرايا:

- السرايا لديه FHIR/NPHIES وRCM، وهذا مهم جدا.
- وجود MPI/Federation وconsent OTP يعطيه زاوية استراتيجية كمنصة تبادل بيانات داخل وزارة أو شبكة مستشفيات، وهي زاوية لا تملكها الأنظمة المحلية الصغيرة غالبا.
- السرايا بدأ فعلا في developer enablement عبر SMART on FHIR وregistered apps وSubscriptions ودليل تكامل عملي.
- ما يزال يحتاج تحويل ذلك إلى Marketplace/Developer Portal كامل، مع إدارة تطبيقات من قاعدة البيانات وواجهة مطورين وحوكمة scopes.
- كما يحتاج conformance testing، وشراكات تكامل أوسع.
- فرصة السرايا أمام Oracle هي السرعة والتخصيص المحلي، لكن Oracle أقوى في enterprise procurement والثقة المؤسسية.

### SAP Healthcare

SAP لم يعد منافسا HIS سريريا تقليديا بنفس معنى Epic، لكنه قوي في:

- ERP, finance, procurement, HR, supply chain.
- Business Technology Platform وAI وdata cloud.
- شراكات حديثة لبناء منصات صحية sovereign/interoperable مثل SAP/Fresenius وAvelios.

مقارنة السرايا:

- السرايا يجمع HIS + ERP في منتج واحد، وهذا مناسب للمستشفيات المتوسطة.
- SAP أقوى في العمليات المالية والمؤسسية العميقة على مستوى المجموعة الصحية الكبيرة.
- فرصة السرايا: تقديم حل موحد أرخص وأسرع للمستشفيات والمراكز التي لا تستطيع تحمل SAP + HIS منفصل.

## 8. مقارنة مع أنظمة عربية وإقليمية

### iCenna

iCenna يعلن HIS + PACS + ERP + HR + NPHIES certification + CBAHI/ZATCA/SDAIA readiness. هذا يجعله منافسا مباشرا في السعودية.

مقارنة السرايا:

- السرايا قريب وظيفيا وربما أعمق في بعض طبقات الحوكمة السريرية والأمن البرمجي.
- iCenna يتفوق تجاريا إذا كان لديه شهادات NPHIES/ISO/عملاء مثبتون.
- السرايا يحتاج تحويل الأدلة التقنية إلى مواد ثقة تجارية: certificates, case studies, compliance packs.

### AndroHealth

AndroHealth يعلن cloud HIS وNPHIES certification وMoH/CHI compliance، ويستهدف السعودية والمراكز الطبية.

مقارنة السرايا:

- السرايا يبدو أوسع كـ ERP/HIS enterprise من مجرد cloud HIS.
- AndroHealth قد يتفوق في بساطة البيع، cloud onboarding، والاعتمادات المحلية.
- فرصة السرايا هي استهداف المستشفيات المتوسطة/الكبيرة وليس فقط المراكز.

### Hakeem Jordan

Hakeem برنامج وطني للسجل الصحي الإلكتروني في الأردن، مع بوابة My Hakeem للوصول إلى نتائج المختبر والأشعة والمواعيد والأدوية والحساسيات.

مقارنة السرايا:

- Hakeem أقوى في الانتشار الوطني والثقة الحكومية.
- السرايا أقوى كمنتج قابل للتخصيص لمؤسسة خاصة أو مجموعة مستشفيات.
- لا تقارن قيمة Hakeem كبرنامج وطني بقيمة منتج تجاري مستقل إلا بحذر.

## 9. القيمة السوقية التقديرية

هذه ليست valuation مالية رسمية، لأن المستودع لا يحتوي على معلومات العملاء، الإيرادات، العقود، CAC، churn، ARR، أو شهادات الاعتماد. لذلك التقييم أدناه **تقدير سيناريوهات**. بعد التحديثات الأخيرة، من غير العادل إبقاء قيمة الأصل التقني كما كانت قبل إغلاق فجوات مثل ABAC/Tenant isolation، NPHIES tenant checks، Quality/CAPA notifications، Redis-backed incident numbering، MPI consent revocation/blacklist، وتحسن lint. هذه التحسينات لا تصنع ARR وحدها، لكنها ترفع جاهزية المنتج وتقلل خصم المخاطر التقنية.

### 9.1 قيمة الكود كأصل تقني دون عملاء مثبتين

تقدير محافظ بعد التحديثات: **1.2 إلى 3.5 مليون دولار**.

مبررات:

- حجم الكود كبير وواسع.
- توجد وحدات Enterprise حقيقية.
- توجد ميزات ذات قيمة سوقية عالية مثل AI Coding وMPI/Federation وNPHIES.
- AI Coding يعتمد على مراجعة واعتماد بشري داخل شاشة الزيارة، وهذا يرفع قابلية الدفاع عنه طبيا وتأمينيا مقارنة باعتماد آلي غير مضبوط.
- ABAC/Tenant isolation أصبح موثقا على مستوى controllers، مع تحسينات واضحة في NPHIES وMPI/Consent وQuality/CAPA.
- الاختبارات الخلفية جيدة: 558 اختبارا ناجحا.
- لكن غياب إثبات العملاء والشهادات يقلل القيمة الاستثمارية.

### 9.2 قيمة المنتج مع عميل أو عميلين production ودون ARR كبير

تقدير محتمل بعد إغلاق الفجوات التقنية الأخيرة: **3 إلى 8 ملايين دولار**.

الشروط:

- تشغيل فعلي في مستشفى/مركز.
- NPHIES مثبت في بيئة sandbox/production.
- تشغيل AI Coding بموافقة الطبيب المعالج أو مراجع سريري مصرح، مع سجل تدقيق واضح.
- إثبات تشغيل MPI/Consent revocation وQuality/CAPA تحت ضغط واقعي.
- SLA وbackup/restore drill موثق.
- demo تجاري مستقر.

### 9.3 قيمة الشركة/المنتج مع ARR متكرر

إذا وصل النظام إلى ARR سنوي واضح، يمكن تقدير القيمة بمضاعفات B2B SaaS/vertical software التقريبية، مثلا **4x إلى 8x ARR** في الحالة العادية، وقد ترتفع إلى **8x إلى 12x ARR** فقط عند وجود نمو قوي، احتفاظ عال، NPHIES/امتثال مثبت، وتشغيل إنتاجي في أكثر من مؤسسة. مصادر 2026 الخاصة ببرمجيات SaaS تشير عموما إلى نطاقات خاصة حول 4x إلى 6x ARR للشركات الخاصة، بينما قد تتسع مضاعفات vertical/healthcare software العامة إلى نطاق أعلى حسب الجودة والنمو.

أمثلة:

- ARR = 500 ألف دولار: قيمة تقريبية 2 إلى 4 ملايين دولار.
- ARR = 1 مليون دولار: قيمة تقريبية 4 إلى 8 ملايين دولار.
- ARR = 2 مليون دولار مع نمو جيد: قيمة تقريبية 8 إلى 16 مليون دولار.
- ARR = 2 مليون دولار مع نمو قوي واحتفاظ عال وتشغيل صحي مثبت: قيمة تقريبية 16 إلى 24 مليون دولار.

### 9.4 قيمة البيع/الترخيص للمستشفى الواحد

تقدير تسعيري ممكن حسب الحجم والسوق:

- مركز طبي صغير/متوسط: 15 ألف إلى 60 ألف دولار setup/license، أو 1,500 إلى 6,000 دولار شهريا SaaS.
- مستشفى متوسط: 80 ألف إلى 250 ألف دولار setup/license، أو 6,000 إلى 20,000 دولار شهريا.
- مجموعة مستشفيات أو مستشفى كبير مع NPHIES/RCM/تخصيصات: 250 ألف إلى 750 ألف دولار أو أكثر، بشرط وجود فريق تنفيذ ودعم واتفاقيات SLA.

السعر الأعلى لا يعتمد على الكود فقط، بل على الاعتماد، التنفيذ، الدعم، التدريب، وضمانات التشغيل.

## 10. ما الذي يجب إضافته أو تقويته

### أولوية عالية خلال 30 يوما

1. تحويل `audit_coverage_report.md` إلى فحص CI آلي يفشل عند إضافة controller غير محمي.
2. تجهيز ملف NPHIES evidence pack: endpoints, mappings, test logs, certification status, known gaps.
3. تجهيز ملف MPI/National HIE evidence pack يشرح GlobalPatient، consent OTP، revocation/blacklist، FHIR token، وحدود المشاركة بين المؤسسات.
4. تجهيز ملف AI Coding safety pack يوضح أن الاعتماد يتم بعد مراجعة الطبيب/المراجع المصرح، مع حدود النموذج، audit، وقياس الدقة.
5. إصلاح encoding العربي في الملفات المتضررة التي تظهر mojibake.
6. تخفيض تحذيرات lint المتبقية من 65 إلى أقل من 20، خصوصا `any` وتعطيلات eslint غير المستخدمة.
7. إنشاء وثيقة Product Capability Matrix من الكود لا من التسويق.
8. توثيق DR drill عملي بتاريخ ونتائج RTO/RPO.

### أولوية 90 يوما

1. إجراء load/concurrency test لمسارات Quality incident numbering وMPI consent blacklist وFHIR export.
2. استكمال صلاحيات `my-capa-tasks` وبلاغ الحوادث بسياسة واضحة: من يستطيع الإبلاغ، ومن يرى مهامه فقط.
3. NPHIES sandbox certification أو إثبات رسمي قابل للعرض.
4. تحويل consent ledger إلى حوكمة تشغيلية كاملة: سياسات وطنية، نماذج موافقة، أغراض الوصول، retention، ولوحات audit.
5. تحسين CDSS وAI Coding بقاعدة معرفة دوائية/سريرية/ترميزية معتمدة.
6. UX hardening لمسارات admission, billing, claims, pharmacy, lab/radiology, MPI consent.
7. Performance/load testing على سيناريوهات واقعية، خصوصا MPI search وFHIR export.

### أولوية 6 إلى 12 شهرا

1. Mobile production version.
2. National HIE profile: APIs، سياسات تبادل، consent registry، وربط مؤسسات خارجية.
3. إكمال Marketplace/Developer Portal: إدارة التطبيقات من DB، واجهة مطورين، API explorer، SDK، sandbox، وapp review workflow.
4. اعتماد ISO 27001 أو SOC2 readiness assessment خارجي.
5. HL7/FHIR/IHE conformance testing موثق.
6. Customer case studies وreference site.
7. Revenue analytics وexecutive dashboard ناضج لملاك المستشفيات.

## 11. نتائج التحقق الفني

تم تنفيذ:

- `npx jest --runInBand` داخل `server`: نجح، 64 test suites passed، 558 tests passed، 4 skipped.
- `npm run build` داخل `client`: نجح.
- `npm run lint` داخل `client`: نجح مع 65 تحذيرا وبدون أخطاء.

ملاحظة: بعض الأوامر احتاجت تشغيل خارج sandbox بسبب أخطاء صلاحيات Windows/EPERM، ثم نجحت.

## 12. مصادر المقارنة السوقية

- KLAS: US Acute Care EHR Market Share 2025  
  https://klasresearch.com/report/us-acute-care-ehr-market-share-2025/3640
- CNBC عن نتائج KLAS وحصة Epic/Oracle في 2025  
  https://www.cnbc.com/2025/04/30/epic-systems-expands-ehr-market-share-lead-over-oracle-health.html
- Oracle Health Interoperability  
  https://www.oracle.com/health/interoperability/
- Oracle Health CMS Aligned Network announcement, 2026-04-20  
  https://www.oracle.com/news/announcement/oracle-health-demonstrates-interoperability-leadership-2026-04-20/
- Epic Cosmos  
  https://cosmos.epic.com/about/
- SAP/Fresenius digital healthcare partnership, 2026  
  https://news.sap.com/2026/01/sap-fresenius-ai-digital-healthcare-delivery/
- NPHIES Implementation Guide  
  https://portal.nphies.sa/ig/downloads.html
- iCenna  
  https://icenna.com/
- AndroHealth  
  https://ahhis.com/en
- Hakeem Program Jordan  
  https://ehs.com.jo/hakeem-program
- My Hakeem  
  https://my.hakeem.jo/index.php/en
- Finerva: B2B SaaS 2026 Valuation Multiples
  https://finerva.com/report/b2b-saas-2026-valuation-multiples/
- Multiples.vc: Public Software Valuation Multiples, May 2026
  https://multiples.vc/reports/software-saas-valuation-multiples
- iMerge Advisors: Q1 2026 Private SaaS Valuation Report
  https://imergeadvisors.com/saas-valuation-multiples-q1-2026/

## 13. الحكم النهائي

الحكم المنصف بعد مراجعة الكود والتحديثات الأخيرة: **السرايا نظام طبي مؤسسي حقيقي، واسع، ومبني بوعي واضح تجاه المستشفيات والمراكز الطبية، وليس مجرد prototype أو CRUD system**.

نقاطه الأقوى هي الجمع بين HIS وERP وRCM وNPHIES وFHIR وAI Coding وMPI/Federation والحوكمة السريرية وQuality/CAPA وABAC/Tenant isolation والأمن التشغيلي في منصة واحدة.

نقاطه الأضعف لم تعد في “غياب ميزات أساسية”، بل في **إثبات النضج التجاري والتشغيلي**: الاعتمادات، العملاء، شهادات NPHIES/ISO/SOC2، حوكمة الشبكة الوطنية، سياسات AI safety، polish الواجهة، الموبايل الإنتاجي، واختبارات التشغيل الواقعية تحت الضغط.

إذا تم تنفيذ حزمة 90 يوما المقترحة، يمكن تقديم السرايا بثقة كنظام عربي/إقليمي منافس بقوة للمستشفيات المتوسطة والمراكز الطبية الكبيرة، مع إمكانية الدخول للسوق السعودي إذا اكتمل إثبات NPHIES والامتثال المحلي. المقارنة مع Epic/Oracle/SAP يجب أن تبقى مقارنة موقع استراتيجي لا مساواة نضج عالمي؛ السرايا قوي إقليميا ومؤهل للتطور، لكنه يحتاج إثباتات تشغيل واعتمادات قبل أي ادعاء بمستوى العمالقة العالميين.
