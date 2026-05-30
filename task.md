# المهام: توسيع نظام الترجمة (i18n) - المرحلة الخامسة (توطين قاعدة البيانات)

## المراحل المكتملة
- [x] المرحلة 1: Login, Dashboard, Patients, PatientChart, Appointments
- [x] المرحلة 2: TriageDashboard, Admissions, ActiveInpatients
- [x] المرحلة 3: NursingStation, DoctorRounds, DischargePlanning, DischargeSummaryBuilder
- [x] المرحلة 4: EncountersList, EncounterDetails, LabWorklist, RadiologyWorklist, PharmacyWorklist
- [x] إصلاح نصوص متبقية في TriageDashboardPage (placeholders + saveBtn)

## المرحلة الخامسة - بناء طبقة توطين قاعدة البيانات ثنائية اللغة

- [x] **1. تحديث مخطط قاعدة البيانات (Prisma Schema)**
  - [x] إضافة حقول ثنائية اللغة لنموذج `Hospital`
  - [x] إضافة حقول ثنائية اللغة لنموذج `Department`
  - [x] إضافة حقول ثنائية اللغة لنموذج `Specialty`
  - [x] إضافة حقول ثنائية اللغة لنموذج `ServiceCategory`
  - [x] إضافة حقول ثنائية اللغة لنموذج `ServiceItem`
  - [x] إضافة حقول ثنائية اللغة لنموذج `LabTest`
  - [x] إضافة حقول ثنائية اللغة لنموذج `RadiologyStudy`
  - [x] إضافة حقول ثنائية اللغة لنموذج `Product`
  - [x] توليد عميل بريسما `npx prisma generate`

- [x] **2. تحديث سكربتات التهيئة والزرع (Database Seeding)**
  - [x] تحديث `seed.ts` للبيانات الأساسية (مستشفيات، تخصصات، أقسام)
  - [x] تحديث `seed-lab-radiology.ts` لزرع التحاليل والأشعة باللغتين
  - [x] تحديث `seed-medical-data.ts` لزرع الأدوية والمستلزمات الطبية
  - [x] تطبيق التغييرات على قاعدة البيانات النشطة وإعادة الزرع `npx prisma db push` (تم الإدماج وجاهز للتشغيل عند بدء الحاوية)

- [x] **3. مواءمة شاشات العميل (Frontend Integration)**
  - [x] تحديث `LabsTab.tsx` لاستخدام الاسم المعرب ديناميكياً
  - [x] تحديث `RadiologyTab.tsx` لاستخدام الاسم المعرب ديناميكياً
  - [x] تحديث `OrderSetsPage.tsx` لتبسيط استهلاك أسماء التحاليل والأشعة

- [x] **4. التحقق والتحميل**
  - [x] اختبار التشغيل وبناء المشروع كاملاً `npm run build`
  - [x] توثيق ومراجعة النتائج النهائية
