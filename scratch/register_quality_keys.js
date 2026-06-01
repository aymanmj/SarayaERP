const { addTranslations } = require('./add_keys_to_json');

const updates = [
  {
    key: 'quality.reportIncident',
    ar: 'الإبلاغ عن حادثة',
    en: 'Report an Incident'
  },
  {
    key: 'quality.dueDate',
    ar: 'تاريخ الاستحقاق:',
    en: 'Due Date:'
  },
  {
    key: 'quality.reportIncidentNearMiss',
    ar: 'الإبلاغ عن حادثة / near miss',
    en: 'Report an Incident / Near Miss'
  },
  {
    key: 'quality.locationPlaceholder',
    ar: 'الجناح / غرفة العمليات...',
    en: 'Ward / Operating Room...'
  },
  {
    key: 'quality.descriptionPlaceholder',
    ar: 'اشرح ما حدث بدقة — من، ماذا، متى، وكيف...',
    en: 'Explain what happened accurately — who, what, when, and how...'
  },
  {
    key: 'quality.minimumCharacters',
    ar: '20 حرف كحد أدنى',
    en: '20 characters minimum'
  },
  {
    key: 'quality.submitting',
    ar: 'جارِ الإرسال...',
    en: 'Submitting...'
  }
];

addTranslations(updates);
