# مراجعة معمقة لنظام السرايا الطبي

تاريخ المراجعة: 2026-05-13  
نطاق المراجعة: ملفات وأكواد المستودع الحالي في `E:\SarayaERP`، مع مقارنة سوقية مرجعية بالأنظمة العالمية والإقليمية.

## 1. الخلاصة التنفيذية العادلة

النتيجة الأهم بعد المراجعة المعمقة: **نظام السرايا الطبي ليس مجرد نظام إدارة عيادات أو HIS تقليدي، بل منصة طبية/إدارية Enterprise في مرحلة نضج تجاري متقدمة جزئيا**. الكود يحتوي فعليا على طبقات لا تظهر عادة في الأنظمة الصغيرة: حوكمة المحتوى السريري، Revenue Cycle Management، NPHIES، FHIR R4، بوابة مريض، CDSS، AI Coding Assistance، عزل مستأجرين، MPI/Federation للسجل الموحد، تدقيق بسلسلة hash، تشفير، Vault، مراقبة، نسخ احتياطي، وإدارة تشغيلية واسعة.

التصنيف الأقرب:

- **وظيفيا:** HIS/ERP طبي متكامل يغطي المستشفى والمركز الطبي والعيادات، مع امتدادات RCM وتكاملات.
- **تقنيا:** منصة NestJS/React/Prisma/PostgreSQL/Redis قابلة للتوسع، وليست prototype في الخادم أو الويب.
- **تجاريا:** منتج قوي يحتاج إلى إثباتات سوقية وتشغيلية خارج الكود: مواقع تشغيل فعلية، شهادات امتثال، NPHIES certification/production evidence، SIEM فعلي، اختبارات اختراق، ومرجعيات عملاء.
- **الموبايل:** كما ذكرت، تطبيق الموبايل ما يزال Prototype ولم يدخل مرحلة الإنتاج، وهذا واضح من كثرة `any`، TODO crash reporting، وبنية offline/sync الأولية.
- **Developer ecosystem:** بدأ فعليا عبر FHIR/SMART OAuth وregistered apps وSubscriptions ودليل تكامل عملي، لكنه لم يصل بعد إلى Marketplace كامل بواجهة إدارة تطبيقات ودليل مطورين عام.

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
| ملفات الخادم داخل `server/src` | 443 |
| ملفات الواجهة داخل `client/src` | 250 |
| ملفات الموبايل | 49 |
| اختبارات الخادم | 63 ملفا |
| نماذج Prisma | 187 model |
| Enums في Prisma | 106 enum |
| Controllers في الخادم | 88 |
| Services في الخادم | 105 |
| اختبارات الخادم التي نجحت | 63/63 suites |
| عدد اختبارات الخادم | 547 passed, 4 skipped |
| بناء الواجهة | نجح |
| Lint الواجهة | نجح مع 65 تحذيرا |

هذه الأرقام مهمة لأنها تؤكد أن النظام كبير فعلا، وأن جودة الكود الأمامي تحسنت بوضوح بعد إزالة أخطاء lint وتحويل الباقي إلى تحذيرات محدودة.

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
- عند الاعتماد، يحفظ ICD-10 في `EncounterDiagnosis`، وينشئ أو يربط `TerminologyConcept` و`DiagnosisCode`.
- يحول CPT إلى `EncounterCharge` مع محاولة جلب السعر من Price Lists، ما يربط التوثيق السريري بالفوترة.
- في الواجهة، `client/src/pages/EncounterDetailsPage.tsx` يحتوي نافذة اعتماد الأكواد المقترحة واختيار primary/secondary diagnosis واختيار CPT.

التقييم: **ميزة تجارية قوية جدا** لأنها تربط الطبيب، الترميز، المطالبات، والفوترة.  
الفجوة: يجب إضافة audit واضح على كل اقتراح/اعتماد، قياس دقة، human-in-the-loop policy، منع الاعتماد الآلي دون مراجعة، وربطها بقواعد payer/NPHIES حتى لا تتحول الأخطاء إلى رفض مطالبات.

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
- `MpiConsentRecord` في Prisma يضيف سجل موافقات فعلي بحالات مثل `ACTIVE` و`REVOKED` وحقول `revokedAt`, `revokedReason`, `otpVerifiedAt`.
- `server/src/patients/patients.service.ts` ينشئ سجل موافقة MPI عند إنشاء المريض، إما `PENDING_OTP` أو `ACTIVE` حسب إعدادات المؤسسة.
- `server/src/settings/settings.controller.ts` و`client/src/pages/OrganizationSettingsPage.tsx` يضيفان واجهة إدارية لتفعيل federation واشتراط OTP، مع عرض إحصاءات الربط على مستوى الشبكة.
- `MpiController` يوفر:
  - `GET /mpi/search`
  - `POST /mpi/consent/trigger`
  - `POST /mpi/consent/verify`
- الواجهة تحتوي إشارات MPI في `PatientsPage` و`EncounterDetailsPage`.

التقييم: **هذه ليست مجرد ميزة مستشفى واحد؛ هذه طبقة HIE/MPI يمكن أن تصبح أساس سجل وطني موحد**.  
الملاحظة العادلة: الموجود حاليا هو foundation قوي ومعه consent registry ومسار revocation/audit فعليان، لكنه يحتاج قبل الاستخدام الوطني إلى ربط revocation بإنفاذ الوصول في كل نقطة قراءة، token invalidation فعلي للـ JWT الصادر لمدة ساعة، IHE profile mapping، audit مخصص لكل طلب تبادل، patient matching tuning، APIs موثقة للمؤسسات الخارجية، وإثباتات أداء وأمن على مستوى وطني.

### 4.1.3 الجودة وسلامة المرضى: Incident / Near Miss / CAPA

بعد التحديثات الأخيرة أصبحت هذه النقطة موجودة في الكود وليست مجرد backlog.

الأدلة:

- `server/src/quality/quality.module.ts` مضاف في `AppModule`.
- `server/src/quality/quality.controller.ts` يوفر مسارات dashboard، الحوادث، near miss، إغلاق الحوادث، CAPA، والتحقق من CAPA.
- `server/src/quality/quality.service.ts` يدير ترقيم الحوادث، تواريخ المراجعة حسب severity، منع إغلاق الحادث قبل اكتمال CAPA، وإحصاءات dashboard.
- `server/prisma/schema.prisma` يحتوي `ClinicalIncident` و`CapaAction` مع enums للحالة والشدة والنوع وroot cause.
- `client/src/pages/QualityAndSafetyPage.tsx` يوفر واجهة dashboard، تسجيل حادث، قائمة الحوادث، ومهام CAPA.

التقييم: **هذه إضافة مهمة ترفع نضج السرايا في مجال Clinical Governance وسلامة المرضى**.  
الملاحظات المتبقية: تمت إضافة `PermissionsGuard` وصلاحيات `quality:view` و`quality:manage` لمسارات الجودة الأساسية، لكن `my-capa-tasks` وبلاغ الحادث يحتاجان قرارا واضحا حول صلاحياتهما المقصودة. توليد رقم الحادث بطريقة count+1 ما زال يحتاج حماية من السباق عند الضغط العالي، ويجب ربط CAPA مباشرة بدورة حياة order sets/pathways وCDSS عندما يكون السبب السريري أو الإجرائي متكررا.

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
الملاحظة: وثائق `docs/clinical-governance` تبدو أقدم من الكود في بعض المواضع وتذكر فجوات تم تنفيذها لاحقا؛ يجب تحديثها حتى لا تظلم النظام عند العرض التجاري.

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
- `server/src/nphies/*`.
- اختبارات `server/src/rcm/claim.service.spec.ts`.

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
- Tenant isolation في Prisma extension.
- Clinical ABAC وbreak-glass audit.
- Backup service وbackup worker وrestore scripts.
- Monitoring: Prometheus, Grafana, Alertmanager, OpenTelemetry.
- Docker production stack وNginx/Kong configs.

التقييم: **فوق المتوسط بوضوح** لمنصة عربية محلية.  
الفجوة: readiness في الكود لا يساوي certification. يلزم external audit، penetration test، runbooks موقعة، retention policies، SIEM فعلي، واختبارات restore موثقة.

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

- فشل lint بعدد كبير: 855 مشكلة.
- استخدام واسع لـ `any`.
- بعض النصوص العربية في ملفات معينة تظهر كـ encoding/mojibake.
- bundle كبير، خصوصا DICOM loader وindex chunk.
- الحاجة إلى UX audit لمسارات المستخدمين الحرجة: التسجيل، الفوترة، claims، المختبر، الأشعة، التنويم.

التقييم: **وظيفيا واسعة، لكنها تحتاج polishing هندسي وتجاري قبل demo أمام مستشفيات كبيرة**.

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
8. **وحدة Quality / Incident / Near Miss / CAPA** أصبحت موجودة كمسار تشغيلي في الخادم والواجهة، ومعها صلاحيات جودة أساسية.
9. **اختبارات خادم جيدة نسبيا**: 547 اختبارا ناجحا.
10. **بنية قابلة للتوسع** باستخدام NestJS/Prisma/PostgreSQL/Redis/Bull/OpenTelemetry.
11. **ملكية كاملة للكود** تمنح مرونة أعلى من الأنظمة المغلقة.

## 6. نقاط الضعف والمخاطر

1. **النضج التجاري غير مثبت من الكود وحده**: لا توجد في المستودع أدلة كافية على عدد العملاء، uptime حقيقي، شهادات، أو تشغيل production واسع.
2. **Lint الواجهة تحسن جذريا**: لم تعد هناك أخطاء lint، لكن بقيت 65 تحذيرا أغلبها `any` وتعطيلات eslint غير مستخدمة.
3. **الموبايل prototype** ولا يجب بيعه كمنتج إنتاجي مكتمل بعد.
4. **الوثائق غير متزامنة مع الكود**، خصوصا وثائق clinical governance.
5. **الامتثال readiness وليس certification**: ISO/SOC2/HIPAA readiness controls موجودة، لكن الاعتماد الخارجي غير مثبت.
6. **NPHIES يحتاج إثبات خارجي**: وجود الكود ممتاز، لكن السوق السعودي سيطلب certification وsuccessful transactions.
7. **CDSS يحتاج knowledge base سريرية أعمق**: بعض المنطق يبدو محليا/ثابتا ويحتاج قواعد دوائية/إرشادية معتمدة.
8. **AI Coding يحتاج ضوابط جودة واعتماد**: يجب ألا يعتمد الكود على اقتراح النموذج وحده دون مراجعة الطبيب/الم coder، audit، وقياس دقة.
9. **MPI الوطني يحتاج حوكمة وطنية**: الأساس البرمجي وسجل الموافقات ومسار الإلغاء موجودة، لكن التشغيل الوطني يحتاج إنفاذ revocation على كل وصول فعلي، اتفاقيات تبادل، سياسات retention، ومطابقة مرضى أكثر صرامة.
10. **Quality/CAPA يحتاج ربطا أعمق**: الوحدة أصبحت موجودة وصلاحياتها تحسنت، لكنها تحتاج معالجة ترقيم الحوادث تحت الضغط، وتدفق إشعارات واضح، وربطا مباشرا مع Clinical Content Lifecycle.
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

هذه ليست valuation مالية رسمية، لأن المستودع لا يحتوي على معلومات العملاء، الإيرادات، العقود، CAC، churn، ARR، أو شهادات الاعتماد. لذلك التقييم أدناه **تقدير سيناريوهات**.

### 9.1 قيمة الكود كأصل تقني دون عملاء مثبتين

تقدير محافظ: **700 ألف إلى 2 مليون دولار**.

مبررات:

- حجم الكود كبير وواسع.
- توجد وحدات Enterprise حقيقية.
- توجد ميزات ذات قيمة سوقية عالية مثل AI Coding وMPI/Federation وNPHIES.
- الاختبارات الخلفية جيدة.
- لكن غياب إثبات العملاء والشهادات يقلل القيمة الاستثمارية.

### 9.2 قيمة المنتج مع عميل أو عميلين production ودون ARR كبير

تقدير محتمل: **2 إلى 5 ملايين دولار**.

الشروط:

- تشغيل فعلي في مستشفى/مركز.
- NPHIES مثبت في بيئة sandbox/production.
- SLA وbackup/restore drill موثق.
- demo تجاري مستقر.

### 9.3 قيمة الشركة/المنتج مع ARR متكرر

إذا وصل النظام إلى ARR سنوي واضح، يمكن تقدير القيمة بمضاعفات B2B SaaS/vertical software التقريبية، مثلا **4x إلى 8x ARR** حسب النمو والهامش والاحتفاظ والعملاء.

أمثلة:

- ARR = 500 ألف دولار: قيمة تقريبية 2 إلى 4 ملايين دولار.
- ARR = 1 مليون دولار: قيمة تقريبية 4 إلى 8 ملايين دولار.
- ARR = 2 مليون دولار مع نمو جيد: قيمة تقريبية 8 إلى 16 مليون دولار.

### 9.4 قيمة البيع/الترخيص للمستشفى الواحد

تقدير تسعيري ممكن حسب الحجم والسوق:

- مركز طبي صغير/متوسط: 15 ألف إلى 60 ألف دولار setup/license، أو 1,500 إلى 6,000 دولار شهريا SaaS.
- مستشفى متوسط: 80 ألف إلى 250 ألف دولار setup/license، أو 6,000 إلى 20,000 دولار شهريا.
- مجموعة مستشفيات أو مستشفى كبير مع NPHIES/RCM/تخصيصات: 250 ألف إلى 750 ألف دولار أو أكثر، بشرط وجود فريق تنفيذ ودعم واتفاقيات SLA.

السعر الأعلى لا يعتمد على الكود فقط، بل على الاعتماد، التنفيذ، الدعم، التدريب، وضمانات التشغيل.

## 10. ما الذي يجب إضافته أو تقويته

### أولوية عالية خلال 30 يوما

1. تحديث وثائق clinical governance لتعكس أن lifecycle/versioning موجود فعلا.
2. تجهيز ملف NPHIES evidence pack: endpoints, mappings, test logs, certification status, known gaps.
3. تجهيز ملف MPI/National HIE evidence pack يشرح GlobalPatient، consent OTP، FHIR token، وحدود المشاركة بين المؤسسات.
4. تجهيز ملف AI Coding safety pack يوضح human approval، حدود النموذج، audit، وقياس الدقة.
5. إصلاح encoding العربي في الواجهة والوثائق المتضررة.
6. تقليل أخطاء lint الحرجة في الواجهة، خصوصا `any`, hooks, unused variables.
7. إنشاء وثيقة Product Capability Matrix من الكود لا من التسويق.
8. توثيق DR drill عملي بتاريخ ونتائج RTO/RPO.

### أولوية 90 يوما

1. تقوية وحدة Incident / Near Miss / CAPA بصلاحيات جودة صريحة، إشعارات، audit، وربطها بدورة حياة المحتوى السريري.
2. audit coverage report يوضح ما هي routes المغطاة بـ ABAC/Tenant/Permissions.
3. NPHIES sandbox certification أو إثبات رسمي قابل للعرض.
4. استكمال إنفاذ consent ledger لتبادل البيانات الوطني، خصوصا إلغاء الموافقة، إبطال tokens، وأغراض الوصول.
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

- `npx jest --runInBand` داخل `server`: نجح، 63 test suites passed، 547 tests passed، 4 skipped.
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

## 13. الحكم النهائي

الحكم المنصف بعد مراجعة الكود: **السرايا نظام طبي مؤسسي حقيقي، واسع، ومبني بوعي واضح تجاه المستشفيات والمراكز الطبية، وليس مجرد prototype أو CRUD system**.  

نقاطه الأقوى هي الجمع بين HIS وERP وRCM وNPHIES وFHIR وAI Coding وMPI/Federation والحوكمة السريرية والأمن التشغيلي في منصة واحدة.  

نقاطه الأضعف ليست في “غياب النظام”، بل في **إثبات النضج التجاري والتشغيلي**: الاعتمادات، العملاء، شهادات NPHIES/ISO/SOC2، حوكمة الشبكة الوطنية، سياسات AI safety، polish الواجهة، الموبايل الإنتاجي، واختبارات التشغيل الواقعية.

إذا تم تنفيذ حزمة 90 يوما المقترحة، يمكن تقديم السرايا بثقة كنظام عربي/إقليمي منافس بقوة للمستشفيات المتوسطة والمراكز الطبية الكبيرة، مع إمكانية الدخول للسوق السعودي إذا اكتمل إثبات NPHIES والامتثال المحلي.
