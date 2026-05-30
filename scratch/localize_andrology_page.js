const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'client', 'src', 'pages', 'andrology', 'AndrologyPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add import
content = content.replace(
  'import { Suspense, lazy, useCallback, useEffect, useState } from "react";',
  'import { Suspense, lazy, useCallback, useEffect, useState } from "react";\nimport { useTranslation } from "react-i18next";'
);

// 2. Add hook call inside component
content = content.replace(
  'export default function AndrologyPage() {',
  'export default function AndrologyPage() {\n  const { t, i18n } = useTranslation();\n  const isRtl = i18n.language === "ar";'
);

// 3. Fallbacks
content = content.replace(
  'function AndrologyPanelFallback({ label = "جارِ تحميل القسم..." }',
  'function AndrologyPanelFallback({ label }'
);
content = content.replace(
  '<span>{label}</span>',
  '<span>{label || "Loading..."}</span>'
);

// 4. Translate fallback strings
content = content.replace(
  'label="جارِ تحميل بنك التجميد..."',
  'label={t("andrology.loading.cryo", "جارِ تحميل بنك التجميد...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج السائل المنوي..."',
  'label={t("andrology.loading.semenForm", "جارِ تحميل نموذج السائل المنوي...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج الزيارة..."',
  'label={t("andrology.loading.visitForm", "جارِ تحميل نموذج الزيارة...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج الهرمونات..."',
  'label={t("andrology.loading.hormoneForm", "جارِ تحميل نموذج الهرمونات...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج الجراحة..."',
  'label={t("andrology.loading.surgeryForm", "جارِ تحميل نموذج الجراحة...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج الدواء..."',
  'label={t("andrology.loading.medicationForm", "جارِ تحميل نموذج الدواء...")}'
);
content = content.replace(
  'label="جارِ تحميل نموذج الفحوصات..."',
  'label={t("andrology.loading.investigationForm", "جارِ تحميل نموذج الفحوصات...")}'
);
content = content.replace(
  'label="جارِ تحميل التقرير الطبي..."',
  'label={t("andrology.loading.reportPrint", "جارِ تحميل التقرير الطبي...")}'
);

// Toasts
content = content.replace(
  'toast.error("لم يتم العثور على أي مريض.");',
  'toast.error(t("andrology.search.patientNotFound", "لم يتم العثور على أي مريض."));'
);
content = content.replace(
  'toast.error("خطأ في البحث.");',
  'toast.error(t("andrology.search.searchError", "خطأ في البحث."));'
);
content = content.replace(
  'toast.success("تم حفظ تحليل السائل المنوي بنجاح.");',
  'toast.success(t("andrology.semen.saveSuccess", "تم حفظ تحليل السائل المنوي بنجاح."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);
content = content.replace(
  'toast.success("تم حفظ زيارة أمراض الذكورة.");',
  'toast.success(t("andrology.visit.saveSuccess", "تم حفظ زيارة أمراض الذكورة."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);
content = content.replace(
  'toast.success("تم حفظ البروفايل الهرموني بنجاح.");',
  'toast.success(t("andrology.hormone.saveSuccess", "تم حفظ البروفايل الهرموني بنجاح."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);
content = content.replace(
  'toast.success("تم حفظ العملية الجراحية بنجاح.");',
  'toast.success(t("andrology.surgery.saveSuccess", "تم حفظ العملية الجراحية بنجاح."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);
content = content.replace(
  'toast.success("تم حفظ الدواء بنجاح.");',
  'toast.success(t("andrology.medication.saveSuccess", "تم حفظ الدواء بنجاح."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);
content = content.replace(
  'toast.success("تم حفظ الفحص الطبي بنجاح.");',
  'toast.success(t("andrology.investigation.saveSuccess", "تم حفظ الفحص الطبي بنجاح."));'
);
content = content.replace(
  'toast.error(e?.response?.data?.message || "فشل الحفظ.");',
  'toast.error(e?.response?.data?.message || t("andrology.common.saveFailed", "فشل الحفظ."));'
);

// date helper
content = content.replace(
  'const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-LY") : "—";',
  'const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(i18n.language) : "—";'
);

// layout direction
content = content.replace(
  'className="p-6 space-y-6 text-slate-100 max-w-7xl mx-auto" dir="rtl"',
  'className="p-6 space-y-6 text-slate-100 max-w-7xl mx-auto" dir={isRtl ? "rtl" : "ltr"}'
);

// HTML content translations
content = content.replace(
  '<h1 className="text-3xl font-black text-white tracking-tight">عيادة أمراض الذكورة والعقم</h1>',
  '<h1 className="text-3xl font-black text-white tracking-tight">{t("andrology.title", "عيادة أمراض الذكورة والعقم")}</h1>'
);
content = content.replace(
  '<p className="text-slate-400 mt-1">وحدة المتابعة المتقدمة: تحليل وتشخيص، بروفايل هرموني، وجراحات دقيقة</p>',
  '<p className="text-slate-400 mt-1">{t("andrology.subtitle", "وحدة المتابعة المتقدمة: تحليل وتشخيص، بروفايل هرموني، وجراحات دقيقة")}</p>'
);

// Search Patient
content = content.replace(
  '🔍<span className="text-lg">البحث عن المريض</span>',
  '🔍<span className="text-lg">{t("andrology.search.title", "البحث عن المريض")}</span>'
);
content = content.replace(
  'placeholder="ابحث بواسطة الاسم، رقم الملف (MRN)، أو رقم الهاتف..."',
  'placeholder={t("andrology.search.placeholder", "ابحث بواسطة الاسم، رقم الملف (MRN)، أو رقم الهاتف...")}'
);
content = content.replace(
  '{searching ? "جاري البحث..." : "بحث الآن"}',
  '{searching ? t("andrology.search.searching", "جاري البحث...") : t("andrology.search.button", "بحث الآن")}'
);
content = content.replace(
  'تم العثور على {searchResults.length} نتيجة — الرجاء الاختيار:',
  '{t("andrology.search.resultsFound", "تم العثور على {count} نتيجة — الرجاء الاختيار:").replace("{count}", searchResults.length.toString())}'
);

content = content.replace(
  '🖨️ التقرير الطبي',
  '🖨️ {t("andrology.btn.report", "التقرير الطبي")}'
);
content = content.replace(
  '🔄 مريض آخر',
  '🔄 {t("andrology.btn.anotherPatient", "مريض آخر")}'
);

// Tabs
content = content.replace(
  '📊 لوحة التحكم',
  '📊 {t("andrology.tab.overview", "لوحة التحكم")}'
);
content = content.replace(
  '🔬 السائل المنوي',
  '🔬 {t("andrology.tab.semen", "السائل المنوي")}'
);
content = content.replace(
  '🩸 الهرمونات',
  '🩸 {t("andrology.tab.hormones", "الهرمونات")}'
);
content = content.replace(
  '🩺 الزيارات',
  '🩺 {t("andrology.tab.visits", "الزيارات")}'
);
content = content.replace(
  '🔪 الجراحات',
  '🔪 {t("andrology.tab.surgery", "الجهود")}'
);
content = content.replace(
  '💊 الأدوية',
  '💊 {t("andrology.tab.medications", "الأدوية")}'
);
content = content.replace(
  '🔬 الفحوصات (Investigations)',
  '🔬 {t("andrology.tab.investigations", "الفحوصات (Investigations)")}'
);
content = content.replace(
  '❄️ بنك التجميد',
  '❄️ {t("andrology.tab.cryo", "بنك التجميد")}'
);

// Overview items
content = content.replace(
  '<h3 className="text-lg font-bold text-white mb-4">الملخص السريري 💡</h3>',
  '<h3 className="text-lg font-bold text-white mb-4">{t("andrology.overview.summaryTitle", "الملخص السريري 💡")}</h3>'
);
content = content.replace(
  '<p className="text-xs text-slate-400 mb-1">حالة السائل المنوي (آخر تحليل)</p>',
  '<p className="text-xs text-slate-400 mb-1">{t("andrology.overview.semenStatus", "حالة السائل المنوي (آخر تحليل)")}</p>'
);
content = content.replace(
  'analyses[0].autoClassification || "لم يُصنف بعد"',
  'analyses[0].autoClassification || t("andrology.overview.unclassified", "لم يُصنف بعد")'
);
content = content.replace(
  '"لا يوجد تحليل"',
  't("andrology.overview.noAnalysis", "لا يوجد تحليل")'
);

content = content.replace(
  '<p className="text-xs text-slate-400 mb-1">الوضع الهرموني (آخر فحص)</p>',
  '<p className="text-xs text-slate-400 mb-1">{t("andrology.overview.hormoneStatus", "الوضع الهرموني (آخر فحص)")}</p>'
);
content = content.replace(
  '"لا يوجد بروفايل"',
  't("andrology.overview.noProfile", "لا يوجد بروفايل")'
);

content = content.replace(
  '<p className="text-xs text-slate-400 mb-1">آخر تشخيص سريري</p>',
  '<p className="text-xs text-slate-400 mb-1">{t("andrology.overview.lastDiagnosis", "آخر تشخيص سريري")}</p>'
);
content = content.replace(
  'visits[0]?.diagnosis || "لم يحدد بعد"',
  'visits[0]?.diagnosis || t("andrology.overview.unspecified", "لم يحدد بعد")'
);

content = content.replace(
  '<p className="text-xs text-slate-400 mb-1">الإجراءات الجراحية</p>',
  '<p className="text-xs text-slate-400 mb-1">{t("andrology.overview.surgicalProcedures", "الإجراءات الجراحية")}</p>'
);
content = content.replace(
  '`${surgeries.length} عملية (آخرها: ${surgeries[0].procedure})`',
  't("andrology.overview.surgeriesCount", "{count} عملية (آخرها: {procedure})").replace("{count}", surgeries.length.toString()).replace("{procedure}", surgeries[0].procedure)'
);
content = content.replace(
  '"لا يوجد تدخلات جراحية"',
  't("andrology.overview.noSurgeries", "لا يوجد تدخلات جراحية")'
);

// Charts
content = content.replace(
  '<span>📈 مسار السائل المنوي عبر الزمن</span>',
  '<span>{t("andrology.chart.semenTrend", "📈 مسار السائل المنوي عبر الزمن")}</span>'
);
content = content.replace(
  'يتطلب التخطيط البياني تحليلين أو أكثر',
  '{t("andrology.chart.semenChartRequired", "يتطلب التخطيط البياني تحليلين أو أكثر")}'
);
content = content.replace(
  '<span>📉 التغير الهرموني الكلي</span>',
  '<span>{t("andrology.chart.hormoneTrend", "📉 التغير الهرموني الكلي")}</span>'
);
content = content.replace(
  'يتطلب التخطيط البياني فحصين أو أكثر',
  '{t("andrology.chart.hormoneChartRequired", "يتطلب التخطيط البياني فحصين أو أكثر")}'
);

// Timeline
content = content.replace(
  '<h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">⏱️ التسلسل الزمني السريع للمريض (Timeline)</h3>',
  '<h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">{t("andrology.overview.timelineTitle", "⏱️ التسلسل الزمني السريع للمريض (Timeline)")}</h3>'
);
content = content.replace(
  '<div className="text-xs text-slate-400">بدء علاج</div>',
  '<div className="text-xs text-slate-400">{t("andrology.timeline.medication", "بدء علاج")}</div>'
);
content = content.replace(
  '<div className="text-xs text-slate-400">عملية جراحية</div>',
  '<div className="text-xs text-slate-400">{t("andrology.timeline.surgery", "عملية جراحية")}</div>'
);
content = content.replace(
  '<div className="text-xs text-slate-400">سائل منوي</div>',
  '<div className="text-xs text-slate-400">{t("andrology.timeline.semen", "سائل منوي")}</div>'
);
content = content.replace(
  '<div className="text-xs text-slate-400">فحص وتصوير</div>',
  '<div className="text-xs text-slate-400">{t("andrology.timeline.investigation", "فحص وتصوير")}</div>'
);

// Semen analysis tab
content = content.replace(
  '📋<span className="mt-0.5">سجل السائل المنوي (WHO 6th Ed)</span>',
  '📋<span className="mt-0.5">{t("andrology.semen.recordTitle", "سجل السائل المنوي (WHO 6th Ed)")}</span>'
);
content = content.replace(
  '➕ إضافة تحليل جديد',
  '➕ {t("andrology.semen.addNew", "إضافة تحليل جديد")}'
);
content = content.replace(
  'جارِ تحميل...',
  '{t("andrology.common.loading", "جارِ تحميل...")}'
);
content = content.replace(
  '<p className="font-medium">لا توجد تحاليل سائل منوي مسجلة.</p>',
  '<p className="font-medium">{t("andrology.semen.noRecords", "لا توجد تحاليل سائل منوي مسجلة.")}</p>'
);
content = content.replace(
  'تاريخ الفحص: ',
  't("andrology.semen.testDate", "تاريخ الفحص: ")'
);
content = content.replace(
  'فترة امتناع: ',
  't("andrology.semen.abstinencePeriod", "فترة امتناع: ")'
);
content = content.replace(
  ' أيام',
  't("andrology.semen.days", " أيام")'
);
content = content.replace(
  'طريقة الجمع: ',
  't("andrology.semen.collectionMethod", "طريقة الجمع: ")'
);

// Semen Grid Fields
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">الحجم</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.semen.fields.volume", "الحجم")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">التركيز</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.semen.fields.concentration", "التركيز")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">الحركة الكلية PR+NP</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.semen.fields.totalMotility", "الحركة الكلية PR+NP")}</span>'
);
content = content.replace(
  '<span className="text-emerald-500 text-xs block mb-1">التقدمية PR</span>',
  '<span className="text-emerald-500 text-xs block mb-1">{t("andrology.semen.fields.progressivePR", "التقدمية PR")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">شكل طبيعي (Kruger)</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.semen.fields.normalForms", "شكل طبيعي (Kruger)")}</span>'
);

// Hormones Tab
content = content.replace(
  '🩸<span className="mt-0.5">التتبع الهرموني (Hormonal Profile)</span>',
  '🩸<span className="mt-0.5">{t("andrology.print.sections.hormonalProfile", "التتبع الهرموني (Hormonal Profile)")}</span>'
);
content = content.replace(
  '➕ إضافة فحص هرموني',
  '➕ {t("andrology.btn.addHormone", "إضافة فحص هرموني")}'
);
content = content.replace(
  '<p className="font-medium">لا توجد فحوصات هرمونية مسجلة.</p>',
  '<p className="font-medium">{t("andrology.hormone.noRecords", "لا توجد فحوصات هرمونية مسجلة.")}</p>'
);
content = content.replace(
  `<th className="p-4 rounded-tr-xl font-medium">التاريخ</th>
                          <th className="p-4 font-medium text-center">FSH <span className="text-[10px] text-slate-500">mIU</span></th>
                          <th className="p-4 font-medium text-center">LH <span className="text-[10px] text-slate-500">mIU</span></th>
                          <th className="p-4 font-medium text-center">Total T <span className="text-[10px] text-slate-500">ng/dL</span></th>
                          <th className="p-4 font-medium text-center">E2 <span className="text-[10px] text-slate-500">pg/mL</span></th>
                          <th className="p-4 font-medium text-center">PRL <span className="text-[10px] text-slate-500">ng/mL</span></th>
                          <th className="p-4 rounded-tl-xl font-medium">ملاحظات</th>`,
  `<th className="p-4 rounded-tr-xl font-medium">{t("andrology.print.table.date", "التاريخ")}</th>
                          <th className="p-4 font-medium text-center">{t("andrology.print.table.fsh", "FSH (mIU/mL)")}</th>
                          <th className="p-4 font-medium text-center">{t("andrology.print.table.lh", "LH (mIU/mL)")}</th>
                          <th className="p-4 font-medium text-center">{t("andrology.print.table.testosterone", "Testosterone (ng/dL)")}</th>
                          <th className="p-4 font-medium text-center">E2 <span className="text-[10px] text-slate-500">pg/mL</span></th>
                          <th className="p-4 font-medium text-center">{t("andrology.print.table.prolactin", "Prolactin (ng/mL)")}</th>
                          <th className="p-4 rounded-tl-xl font-medium">{t("andrology.surgery.fields.findings", "النتائج / Findings")}</th>`
);

// Visits Tab
content = content.replace(
  '🩺<span className="mt-0.5">زيارات أمراض الذكورة</span>',
  '🩺<span className="mt-0.5">{t("andrology.btn.visitsTitle", "زيارات أمراض الذكورة")}</span>'
);
content = content.replace(
  '➕ زيارة جديدة',
  '➕ {t("andrology.btn.newVisit", "زيارة جديدة")}'
);
content = content.replace(
  '<p className="font-medium">لا توجد زيارات مسجلة.</p>',
  '<p className="font-medium">{t("andrology.visits.noRecords", "لا توجد زيارات مسجلة.")}</p>'
);
content = content.replace(
  '📅 زيارة بتاريخ ',
  't("andrology.visits.visitDate", "📅 زيارة بتاريخ ")'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">الشكوى الرئيسية</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.visit.fields.chiefComplaint", "الشكوى الرئيسية")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs mb-1">الدوالي العامة</span>',
  '<span className="text-slate-500 text-xs mb-1">{t("andrology.visit.fields.varicoceleGrade", "الدوالي العامة")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs mb-1">الدوالي (يمين / يسار)</span>',
  '<span className="text-slate-500 text-xs mb-1">{t("andrology.visits.varicoceleRL", "الدوالي (يمين / يسار)")}</span>'
);
content = content.replace(
  '<span className="text-emerald-500 text-xs font-bold block mb-1">خطة العلاج</span>',
  '<span className="text-emerald-500 text-xs font-bold block mb-1">{t("andrology.visit.fields.treatmentPlan", "خطة العلاج")}</span>'
);

// Surgery Tab
content = content.replace(
  '🔪<span className="mt-0.5">التدخلات الجراحية والميكروسكوبية</span>',
  '🔪<span className="mt-0.5">{t("andrology.print.sections.surgicalHistory", "التدخلات الجراحية والميكروسكوبية")}</span>'
);
content = content.replace(
  '➕ توثيق جراحة',
  '➕ {t("andrology.btn.documentSurgery", "توثيق جراحة")}'
);
content = content.replace(
  '<p className="font-medium">لم يتم إجراء عمليات جراحية للمريض.</p>',
  '<p className="font-medium">{t("andrology.surgery.noRecords", "لم يتم إجراء عمليات جراحية للمريض.")}</p>'
);
content = content.replace(
  '✅ نجاح الاستخراج',
  '✅ {t("andrology.print.fields.successfulRetrieval", "نجاح الاستخراج")}'
);
content = content.replace(
  'تاريخ العملية: ',
  't("andrology.surgery.fields.date", "تاريخ العملية: ")'
);
content = content.replace(
  'الجراح: ',
  't("andrology.surgery.fields.surgeonName", "الجراح: ")'
);
content = content.replace(
  '<span className="text-slate-500 text-xs">التقنية الجراحية:</span>',
  '<span className="text-slate-500 text-xs">{t("andrology.print.fields.technique", "التقنية الجراحية:")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs">نتائج العملية (Findings):</span>',
  '<span className="text-slate-500 text-xs">{t("andrology.surgery.fields.findings", "نتائج العملية (Findings):")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs">النتيجة (Outcome):</span>',
  '<span className="text-slate-500 text-xs">{t("andrology.surgery.fields.outcome", "النتيجة (Outcome):")}</span>'
);

// Medications
content = content.replace(
  '💊<span className="mt-0.5">الخطة العلاجية الدوائية</span>',
  '💊<span className="mt-0.5">{t("andrology.print.sections.pharmacologicalTherapy", "الخطة العلاجية الدوائية")}</span>'
);
content = content.replace(
  '➕ إضافة دواء',
  '➕ {t("andrology.btn.addMedication", "إضافة دواء")}'
);
content = content.replace(
  '<p className="font-medium">لم يتم وصف أدوية للمريض.</p>',
  '<p className="font-medium">{t("andrology.medication.noRecords", "لم يتم وصف أدوية للمريض.")}</p>'
);
content = content.replace(
  'البدء: ',
  't("andrology.print.fields.started", "البدء: ")'
);
content = content.replace(
  'الانتهاء: ',
  't("andrology.medication.fields.endDate", "الانتهاء: ")'
);
content = content.replace(
  'جرعة: ',
  't("andrology.medication.fields.dose", "جرعة: ")'
);
content = content.replace(
  'تكرار: ',
  't("andrology.medication.fields.frequency", "تكرار: ")'
);
content = content.replace(
  '✅ استجابة: ',
  't("andrology.medication.fields.response", "✅ استجابة: ")'
);

// Investigations
content = content.replace(
  '🔬<span className="mt-0.5">الفحوصات الطبية المتقدمة</span>',
  '🔬<span className="mt-0.5">{t("andrology.btn.investigationsTitle", "الفحوصات الطبية المتقدمة")}</span>'
);
content = content.replace(
  '➕ إرفاق فحص جديد',
  '➕ {t("andrology.btn.addInvestigation", "إرفاق فحص جديد")}'
);
content = content.replace(
  '<p className="font-medium">لا توجد فحوصات أو صور أشعة مسجلة.</p>',
  '<p className="font-medium">{t("andrology.investigation.noRecords", "لا توجد فحوصات أو صور أشعة مسجلة.")}</p>'
);
content = content.replace(
  'تاريخ الفحص: ',
  't("andrology.investigation.fields.date", "تاريخ الفحص: ")'
);
content = content.replace(
  '{inv.facilityName && <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">المختبر: {inv.facilityName}</div>}',
  '{inv.facilityName && <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">{t("andrology.investigation.fields.facilityName", "المختبر: ")}{inv.facilityName}</div>}'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">النتائج الفنية (Findings):</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.investigation.fields.findings", "النتائج الفنية (Findings):")}</span>'
);
content = content.replace(
  '<span className="text-slate-500 text-xs block mb-1">التفسير والخلاصة (Interpretation):</span>',
  '<span className="text-slate-500 text-xs block mb-1">{t("andrology.investigation.fields.interpretation", "التفسير والخلاصة (Interpretation):")}</span>'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('AndrologyPage.tsx successfully localized');
