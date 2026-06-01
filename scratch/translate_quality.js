const fs = require('fs');

const file = 'E:/SarayaERP/client/src/pages/QualityAndSafetyPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    '<span>＋</span> الإبلاغ عن حادثة',
    '<span>＋</span> {t("quality.reportIncident", "الإبلاغ عن حادثة")}'
  ],
  [
    "<span>🎯 تاريخ الاستحقاق: {new Date(capa.dueDate).toLocaleDateString('ar-SA')}</span>",
    '<span>🎯 {t("quality.dueDate", "تاريخ الاستحقاق:")} {new Date(capa.dueDate).toLocaleDateString(isRtl ? "ar-SA" : "en-US")}</span>'
  ],
  [
    '<span className="text-2xl">📝</span> الإبلاغ عن حادثة / near miss',
    '<span className="text-2xl">📝</span> {t("quality.reportIncidentNearMiss", "الإبلاغ عن حادثة / near miss")}'
  ],
  [
    'placeholder="الجناح / غرفة العمليات..."',
    'placeholder={t("quality.locationPlaceholder", "الجناح / غرفة العمليات...")}'
  ],
  [
    "{form.severity === 'SENTINEL' && ' — يتطلب تحقيقاً فورياً خلال 24 ساعة'}",
    '{form.severity === \'SENTINEL\' && t("quality.requiresImmediateInvestigationWithin24Ho", " — يتطلب تحقيقاً فورياً خلال 24 ساعة")}'
  ],
  [
    "{form.severity === 'MAJOR' && ' — يتطلب مراجعة خلال 24 ساعة'}",
    '{form.severity === \'MAJOR\' && t("quality.requiresReviewWithin24Hours", " — يتطلب مراجعة خلال 24 ساعة")}'
  ],
  [
    "{form.severity === 'MODERATE' && ' — يتطلب مراجعة خلال 3 أيام'}",
    '{form.severity === \'MODERATE\' && t("quality.requiresReviewWithin3Days", " — يتطلب مراجعة خلال 3 أيام")}'
  ],
  [
    "{form.severity === 'MINOR' && ' — يتطلب مراجعة خلال أسبوع'}",
    '{form.severity === \'MINOR\' && t("quality.requiresReviewWithinAWeek", " — يتطلب مراجعة خلال أسبوع")}'
  ],
  [
    "{form.severity === 'NEAR_MISS' && ' — يتطلب مراجعة خلال أسبوعين'}",
    '{form.severity === \'NEAR_MISS\' && t("quality.requiresReviewWithinTwoWeeks", " — يتطلب مراجعة خلال أسبوعين")}'
  ],
  [
    'placeholder="اشرح ما حدث بدقة — من، ماذا، متى، وكيف..."',
    'placeholder={t("quality.descriptionPlaceholder", "اشرح ما حدث بدقة — من، ماذا، متى، وكيف...")}'
  ],
  [
    '<div className="text-xs text-slate-500 mt-1">{form.description.length} / 20 حرف كحد أدنى</div>',
    '<div className="text-xs text-slate-500 mt-1">{form.description.length} / {t("quality.minimumCharacters", "20 حرف كحد أدنى")}</div>'
  ],
  [
    "{submitting ? 'جارٍ الإرسال...' : t(\"quality.sendTheReport\", \"إرسال البلاغ\")}",
    '{submitting ? t("quality.submitting", "جارِ الإرسال...") : t("quality.sendTheReport", "إرسال البلاغ")}'
  ],
  [
    'إلغاء',
    '{t("cancel", "إلغاء")}'
  ]
];

replacements.forEach(([target, replacement]) => {
  if (content.includes(target)) {
    content = content.split(target).join(replacement);
    console.log(`Replaced: ${target} -> ${replacement}`);
  } else {
    console.warn(`Warning: Target not found: ${target}`);
  }
});

fs.writeFileSync(file, content, 'utf8');
console.log('QualityAndSafetyPage translation applied!');
