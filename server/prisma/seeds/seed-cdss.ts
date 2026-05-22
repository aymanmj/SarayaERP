// prisma/seeds/seed-cdss.ts
// =====================================================================
// بيانات أولية لنظام دعم القرار السريري
// التفاعلات الدوائية الشائعة - المصدر: FDA, Micromedex, BNF
// =====================================================================

import { PrismaClient, DrugInteractionSeverity } from '@prisma/client';

const prisma = new PrismaClient();

// ======================== التفاعلات الدوائية الشائعة ========================

const DRUG_INTERACTIONS = [
  // ============ مميعات الدم (Anticoagulants) ============
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'aspirin',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Increased risk of bleeding. Concurrent use should be avoided or monitored closely.',
    descriptionAr: 'زيادة خطر النزيف. يجب تجنب الاستخدام المتزامن أو المراقبة الدقيقة.',
    recommendation: 'Monitor INR closely. Consider alternative antiplatelet if needed.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'ibuprofen',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Increased risk of gastrointestinal bleeding.',
    descriptionAr: 'زيادة خطر النزيف الهضمي.',
    recommendation: 'Avoid combination. Use acetaminophen for pain if possible.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'naproxen',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'NSAIDs increase warfarin effect and bleeding risk.',
    descriptionAr: 'مضادات الالتهاب غير الستيرويدية تزيد من تأثير الوارفارين وخطر النزيف.',
    source: 'BNF',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'metronidazole',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Metronidazole inhibits warfarin metabolism, increasing anticoagulant effect.',
    descriptionAr: 'الميترونيدازول يثبط استقلاب الوارفارين، مما يزيد من تأثير مضاد التخثر.',
    source: 'Micromedex',
    evidenceLevel: 'B',
  },

  // ============ أدوية القلب (Cardiovascular) ============
  {
    drugAGeneric: 'sildenafil',
    drugBGeneric: 'nitroglycerin',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Risk of life-threatening hypotension. Absolute contraindication.',
    descriptionAr: 'خطر انخفاض ضغط الدم المهدد للحياة. موانع استخدام مطلقة.',
    recommendation: 'NEVER combine. Wait at least 24 hours between uses.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'sildenafil',
    drugBGeneric: 'isosorbide',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Severe hypotension risk with nitrate combinations.',
    descriptionAr: 'خطر انخفاض ضغط الدم الشديد مع مجموعات النيترات.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'digoxin',
    drugBGeneric: 'amiodarone',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Amiodarone increases digoxin levels, risk of toxicity.',
    descriptionAr: 'الأميودارون يرفع مستويات الديجوكسين، خطر السمية.',
    recommendation: 'Reduce digoxin dose by 50% when starting amiodarone.',
    source: 'BNF',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'digoxin',
    drugBGeneric: 'verapamil',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Verapamil increases digoxin levels significantly.',
    descriptionAr: 'الفيراباميل يرفع مستويات الديجوكسين بشكل ملحوظ.',
    source: 'Micromedex',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'atenolol',
    drugBGeneric: 'verapamil',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Risk of severe bradycardia, heart block, and hypotension.',
    descriptionAr: 'خطر بطء القلب الشديد، إحصار القلب، وانخفاض ضغط الدم.',
    source: 'BNF',
    evidenceLevel: 'A',
  },

  // ============ الستاتينات (Statins) ============
  {
    drugAGeneric: 'simvastatin',
    drugBGeneric: 'clarithromycin',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Risk of myopathy and rhabdomyolysis due to increased statin levels.',
    descriptionAr: 'خطر اعتلال العضلات وانحلال العضلات بسبب ارتفاع مستويات الستاتين.',
    recommendation: 'Suspend statin during clarithromycin course or use azithromycin.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'simvastatin',
    drugBGeneric: 'erythromycin',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'CYP3A4 inhibition increases simvastatin toxicity risk.',
    descriptionAr: 'تثبيط CYP3A4 يزيد من خطر سمية السيمفاستاتين.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'atorvastatin',
    drugBGeneric: 'gemfibrozil',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Increased risk of myopathy with statin-fibrate combination.',
    descriptionAr: 'زيادة خطر اعتلال العضلات مع مزيج الستاتين والفايبريت.',
    source: 'FDA',
    evidenceLevel: 'A',
  },

  // ============ المضادات الحيوية (Antibiotics) ============
  {
    drugAGeneric: 'amoxicillin',
    drugBGeneric: 'allopurinol',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Increased risk of skin rash.',
    descriptionAr: 'زيادة خطر الطفح الجلدي.',
    source: 'BNF',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'ciprofloxacin',
    drugBGeneric: 'theophylline',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Ciprofloxacin inhibits theophylline metabolism, risk of toxicity.',
    descriptionAr: 'السيبروفلوكساسين يثبط استقلاب الثيوفيلين، خطر السمية.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'ciprofloxacin',
    drugBGeneric: 'tizanidine',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Dramatic increase in tizanidine levels, causing severe hypotension and sedation.',
    descriptionAr: 'زيادة كبيرة في مستويات التيزانيدين، مسببة انخفاض ضغط الدم الشديد والتخدير.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'metronidazole',
    drugBGeneric: 'alcohol',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Disulfiram-like reaction: nausea, vomiting, flushing, headache.',
    descriptionAr: 'تفاعل شبيه بالديسلفيرام: غثيان، قيء، احمرار، صداع.',
    recommendation: 'Avoid alcohol during and 48 hours after metronidazole.',
    source: 'BNF',
    evidenceLevel: 'A',
  },

  // ============ أدوية السكري (Diabetes) ============
  {
    drugAGeneric: 'metformin',
    drugBGeneric: 'contrast media',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Risk of lactic acidosis with iodinated contrast.',
    descriptionAr: 'خطر الحماض اللبني مع مادة التباين اليودية.',
    recommendation: 'Hold metformin for 48 hours after contrast administration.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'glibenclamide',
    drugBGeneric: 'fluconazole',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Fluconazole increases sulfonylurea levels, risk of hypoglycemia.',
    descriptionAr: 'الفلوكونازول يرفع مستويات السلفونيليوريا، خطر نقص السكر.',
    source: 'Micromedex',
    evidenceLevel: 'B',
  },

  // ============ مضادات التخثر الجديدة (DOACs) ============
  {
    drugAGeneric: 'rivaroxaban',
    drugBGeneric: 'ketoconazole',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Strong CYP3A4 and P-gp inhibition dramatically increases bleeding risk.',
    descriptionAr: 'التثبيط القوي لـ CYP3A4 و P-gp يزيد بشكل كبير من خطر النزيف.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'apixaban',
    drugBGeneric: 'rifampicin',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Rifampicin significantly reduces apixaban levels, loss of efficacy.',
    descriptionAr: 'الريفامبيسين يقلل بشكل كبير من مستويات الأبيكسابان، فقدان الفعالية.',
    source: 'FDA',
    evidenceLevel: 'A',
  },

  // ============ مضادات الاكتئاب (Antidepressants) ============
  {
    drugAGeneric: 'fluoxetine',
    drugBGeneric: 'tramadol',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Risk of serotonin syndrome and seizures.',
    descriptionAr: 'خطر متلازمة السيروتونين والنوبات.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'sertraline',
    drugBGeneric: 'tramadol',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Serotonin syndrome risk with SSRI-tramadol combination.',
    descriptionAr: 'خطر متلازمة السيروتونين مع مزيج SSRI والترامادول.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'fluoxetine',
    drugBGeneric: 'monoamine oxidase inhibitor',
    severity: DrugInteractionSeverity.CONTRAINDICATED,
    description: 'Fatal serotonin syndrome. Absolute contraindication.',
    descriptionAr: 'متلازمة السيروتونين القاتلة. موانع استخدام مطلقة.',
    recommendation: 'Allow 5 weeks washout between fluoxetine and MAOIs.',
    source: 'FDA',
    evidenceLevel: 'A',
  },

  // ============ المسكنات (Analgesics) ============
  {
    drugAGeneric: 'codeine',
    drugBGeneric: 'paroxetine',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Paroxetine inhibits codeine conversion to morphine, reducing efficacy.',
    descriptionAr: 'الباروكستين يثبط تحويل الكودايين إلى المورفين، مما يقلل الفعالية.',
    source: 'Micromedex',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'morphine',
    drugBGeneric: 'benzodiazepine',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Risk of profound sedation, respiratory depression, coma, and death.',
    descriptionAr: 'خطر التخدير العميق، تثبيط التنفس، الغيبوبة، والوفاة.',
    source: 'FDA Black Box Warning',
    evidenceLevel: 'A',
  },

  // ============ أدوية الصرع (Antiepileptics) ============
  {
    drugAGeneric: 'carbamazepine',
    drugBGeneric: 'oral contraceptive',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Carbamazepine induces metabolism of hormonal contraceptives.',
    descriptionAr: 'الكاربامازيبين يحفز استقلاب موانع الحمل الهرمونية.',
    recommendation: 'Use alternative contraception or higher dose pills.',
    source: 'BNF',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'phenytoin',
    drugBGeneric: 'oral contraceptive',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Phenytoin reduces contraceptive efficacy.',
    descriptionAr: 'الفينيتوين يقلل من فعالية موانع الحمل.',
    source: 'BNF',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'valproic acid',
    drugBGeneric: 'lamotrigine',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Valproate doubles lamotrigine levels, requiring dose adjustment.',
    descriptionAr: 'الفالبروات يضاعف مستويات اللاموتريجين، مما يتطلب تعديل الجرعة.',
    recommendation: 'Start lamotrigine at lower dose and titrate slowly.',
    source: 'FDA',
    evidenceLevel: 'A',
  },

  // ============ مثبطات المناعة (Immunosuppressants) ============
  {
    drugAGeneric: 'cyclosporine',
    drugBGeneric: 'potassium supplement',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Risk of severe hyperkalemia.',
    descriptionAr: 'خطر ارتفاع البوتاسيوم الشديد.',
    source: 'Micromedex',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'tacrolimus',
    drugBGeneric: 'fluconazole',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Fluconazole significantly increases tacrolimus levels.',
    descriptionAr: 'الفلوكونازول يرفع مستويات التاكروليموس بشكل كبير.',
    recommendation: 'Monitor tacrolimus levels closely, consider dose reduction.',
    source: 'FDA',
    evidenceLevel: 'A',
  },

  // ============ أدوية أخرى مهمة ============
  {
    drugAGeneric: 'lithium',
    drugBGeneric: 'ibuprofen',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'NSAIDs increase lithium levels, risk of toxicity.',
    descriptionAr: 'مضادات الالتهاب غير الستيرويدية ترفع مستويات الليثيوم، خطر السمية.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'lithium',
    drugBGeneric: 'ace inhibitor',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'ACE inhibitors may increase lithium levels.',
    descriptionAr: 'مثبطات الإنزيم المحول للأنجيوتنسين قد ترفع مستويات الليثيوم.',
    source: 'BNF',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'potassium supplement',
    drugBGeneric: 'spironolactone',
    severity: DrugInteractionSeverity.SEVERE,
    description: 'Risk of life-threatening hyperkalemia.',
    descriptionAr: 'خطر ارتفاع البوتاسيوم المهدد للحياة.',
    source: 'FDA',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'clopidogrel',
    drugBGeneric: 'omeprazole',
    severity: DrugInteractionSeverity.MODERATE,
    description: 'Omeprazole may reduce clopidogrel antiplatelet effect.',
    descriptionAr: 'الأوميبرازول قد يقلل من تأثير الكلوبيدوجريل المضاد للصفيحات.',
    recommendation: 'Consider pantoprazole as PPI alternative.',
    source: 'FDA',
    evidenceLevel: 'B',
  },
];

// ======================== القيم الحرجة للمختبر ========================

const LAB_CRITICAL_VALUES = [
  { labTestCode: 'K', labTestName: 'Potassium', criticalLow: 2.5, criticalHigh: 6.5, panicLow: 2.0, panicHigh: 7.0, unit: 'mEq/L', action: 'Notify physician STAT' },
  { labTestCode: 'NA', labTestName: 'Sodium', criticalLow: 120, criticalHigh: 160, panicLow: 115, panicHigh: 165, unit: 'mEq/L', action: 'Notify physician STAT' },
  { labTestCode: 'GLU', labTestName: 'Glucose', criticalLow: 40, criticalHigh: 450, panicLow: 30, panicHigh: 600, unit: 'mg/dL', action: 'Immediate intervention' },
  { labTestCode: 'HGB', labTestName: 'Hemoglobin', criticalLow: 5, criticalHigh: 20, panicLow: 4, panicHigh: 22, unit: 'g/dL', action: 'Consider transfusion' },
  { labTestCode: 'PLT', labTestName: 'Platelets', criticalLow: 20, criticalHigh: 1000, panicLow: 10, panicHigh: 1200, unit: 'x10³/µL', action: 'Bleeding precautions' },
  { labTestCode: 'WBC', labTestName: 'White Blood Cells', criticalLow: 1.0, criticalHigh: 50, panicLow: 0.5, panicHigh: 100, unit: 'x10³/µL', action: 'Infection control' },
  { labTestCode: 'CREAT', labTestName: 'Creatinine', criticalLow: null, criticalHigh: 10, panicLow: null, panicHigh: 15, unit: 'mg/dL', action: 'Nephrology consult' },
  { labTestCode: 'BUN', labTestName: 'Blood Urea Nitrogen', criticalLow: null, criticalHigh: 100, panicLow: null, panicHigh: 150, unit: 'mg/dL', action: 'Renal assessment' },
  { labTestCode: 'CA', labTestName: 'Calcium', criticalLow: 6.0, criticalHigh: 13, panicLow: 5.5, panicHigh: 14, unit: 'mg/dL', action: 'ECG monitoring' },
  { labTestCode: 'MG', labTestName: 'Magnesium', criticalLow: 1.0, criticalHigh: 5.0, panicLow: 0.8, panicHigh: 6.0, unit: 'mg/dL', action: 'Cardiac monitoring' },
  { labTestCode: 'INR', labTestName: 'INR', criticalLow: null, criticalHigh: 5.0, panicLow: null, panicHigh: 8.0, unit: '', action: 'Bleeding risk assessment' },
  { labTestCode: 'TROP', labTestName: 'Troponin', criticalLow: null, criticalHigh: 0.04, panicLow: null, panicHigh: 0.1, unit: 'ng/mL', action: 'Cardiology STAT' },
];

// ======================== القيم الحرجة للعلامات الحيوية ========================

const VITAL_CRITICAL_VALUES = [
  { vitalType: 'HR', vitalName: 'Heart Rate', criticalLow: 40, criticalHigh: 150, unit: 'bpm', action: 'ECG STAT', ageGroup: 'ADULT' },
  { vitalType: 'HR', vitalName: 'Heart Rate (Pediatric)', criticalLow: 60, criticalHigh: 180, unit: 'bpm', action: 'Pediatric assessment', ageGroup: 'CHILD' },
  { vitalType: 'BP_SYS', vitalName: 'Systolic BP', criticalLow: 70, criticalHigh: 200, unit: 'mmHg', action: 'Immediate assessment', ageGroup: 'ADULT' },
  { vitalType: 'BP_DIA', vitalName: 'Diastolic BP', criticalLow: 40, criticalHigh: 120, unit: 'mmHg', action: 'Immediate assessment', ageGroup: 'ADULT' },
  { vitalType: 'TEMP', vitalName: 'Temperature', criticalLow: 35, criticalHigh: 40, unit: '°C', action: 'Sepsis protocol', ageGroup: null },
  { vitalType: 'SPO2', vitalName: 'Oxygen Saturation', criticalLow: 88, criticalHigh: null, unit: '%', action: 'Oxygen therapy STAT', ageGroup: 'ADULT' },
  { vitalType: 'RR', vitalName: 'Respiratory Rate', criticalLow: 8, criticalHigh: 30, unit: '/min', action: 'Respiratory assessment', ageGroup: 'ADULT' },
];

// ======================== قواعد القصور الكلوي الكلينيكية ========================
const RENAL_DOSE_REQUIREMENTS = [
  {
    atcPrefix: 'M01A', // NSAIDs
    drugGeneric: 'ibuprofen',
    renalClass: 'MODERATE' as const,
    minSafeEgfr: 30,
    action: 'AVOID',
    actionAr: 'تجنب الاستخدام في القصور الكلوي الحاد (eGFR < 30)',
    evidenceSource: 'KDIGO 2023',
    notes: 'NSAIDs may cause acute kidney injury in vulnerable patients.',
  },
  {
    atcPrefix: 'J01X', // Glycopeptides / Other antibacterials
    drugGeneric: 'vancomycin',
    renalClass: 'HIGH' as const,
    minSafeEgfr: 30,
    action: 'REDUCE_DOSE_50%',
    actionAr: 'تعديل الجرعة بنسبة 50% أو زيادة الفاصل الزمني للتكرار',
    evidenceSource: 'FDA Label',
    notes: 'Nephrotoxic drug requiring serum level monitoring.',
  },
  {
    atcPrefix: 'J01G', // Aminoglycosides
    drugGeneric: 'gentamicin',
    renalClass: 'HIGH' as const,
    minSafeEgfr: 30,
    action: 'REDUCE_DOSE_50%',
    actionAr: 'تعديل الجرعة بنسبة 50% أو زيادة الفاصل الزمني للتكرار',
    evidenceSource: 'FDA Label',
    notes: 'Highly nephrotoxic, requires therapeutic drug monitoring.',
  },
];

// ======================== قواعد القصور الكبدي الكلينيكية ========================
const HEPATIC_DOSE_REQUIREMENTS = [
  {
    atcPrefix: 'N02B', // Other analgesics
    drugGeneric: 'paracetamol',
    hepaticClass: 'MODERATE' as const,
    childPughClass: 'C',
    action: 'REDUCE_DOSE_50%',
    actionAr: 'تخفيض الجرعة القصوى إلى 2 جرام يومياً أو تجنب الاستخدام',
    evidenceSource: 'FDA Label',
    notes: 'Severe hepatic impairment increases risk of acetaminophen hepatotoxicity.',
  },
  {
    atcPrefix: 'L01B', // Antimetabolites
    drugGeneric: 'methotrexate',
    hepaticClass: 'HIGH' as const,
    childPughClass: 'B',
    action: 'AVOID',
    actionAr: 'تجنب الاستخدام لمرضى الفشل الكبدي المتوسط (Child-Pugh B)',
    evidenceSource: 'UpToDate',
    notes: 'Hepatotoxic agent, contraindicated in active liver disease.',
  },
  {
    atcPrefix: 'L01B', // Antimetabolites
    drugGeneric: 'methotrexate',
    hepaticClass: 'HIGH' as const,
    childPughClass: 'C',
    action: 'AVOID',
    actionAr: 'تجنب الاستخدام لمرضى الفشل الكبدي الشديد (Child-Pugh C)',
    evidenceSource: 'UpToDate',
    notes: 'Hepatotoxic agent, contraindicated in active liver disease.',
  },
  {
    atcPrefix: 'J02A', // Antimycotics for systemic use
    drugGeneric: 'ketoconazole',
    hepaticClass: 'HIGH' as const,
    childPughClass: 'B',
    action: 'AVOID',
    actionAr: 'تجنب الاستخدام لمرضى الفشل الكبدي المتوسط (Child-Pugh B)',
    evidenceSource: 'FDA Black Box Warning',
    notes: 'Severe hepatotoxicity risk.',
  },
  {
    atcPrefix: 'J02A', // Antimycotics for systemic use
    drugGeneric: 'ketoconazole',
    hepaticClass: 'HIGH' as const,
    childPughClass: 'C',
    action: 'AVOID',
    actionAr: 'تجنب الاستخدام لمرضى الفشل الكبدي الشديد (Child-Pugh C)',
    evidenceSource: 'FDA Black Box Warning',
    notes: 'Severe hepatotoxicity risk.',
  },
];

// ======================== مجموعات الحساسية والتحسس المشترك ========================
const ALLERGY_GROUPS = [
  {
    name: 'NSAIDs',
    nameAr: 'مضادات الالتهاب غير الستيرويدية',
    description: 'Non-Steroidal Anti-Inflammatory Drugs cross-reactivity group',
    members: ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac'],
  },
  {
    name: 'Penicillins',
    nameAr: 'البنسلينات',
    description: 'Beta-lactam penicillins group',
    members: ['penicillin', 'amoxicillin', 'ampicillin', 'piperacillin'],
  },
];

// ======================== Main Seed Function ========================

export async function seedCDSS() {
  console.log('🏥 Seeding CDSS Data...');

  // 1. Drug Interactions
  console.log('💊 Seeding Drug Interactions...');
  for (const interaction of DRUG_INTERACTIONS) {
    await prisma.drugInteraction.upsert({
      where: {
        drugAGeneric_drugBGeneric: {
          drugAGeneric: interaction.drugAGeneric.toLowerCase(),
          drugBGeneric: interaction.drugBGeneric.toLowerCase(),
        },
      },
      update: interaction,
      create: {
        ...interaction,
        drugAGeneric: interaction.drugAGeneric.toLowerCase(),
        drugBGeneric: interaction.drugBGeneric.toLowerCase(),
      },
    });
  }
  console.log(`   ✅ ${DRUG_INTERACTIONS.length} drug interactions seeded`);

  // 2. Lab Critical Values - استخدام deleteMany/createMany لتجنب مشاكل null في unique constraint
  console.log('🧪 Seeding Lab Critical Values...');
  // حذف القيم القديمة أولاً
  await prisma.labCriticalValue.deleteMany({});
  // إنشاء القيم الجديدة
  await prisma.labCriticalValue.createMany({
    data: LAB_CRITICAL_VALUES.map(lab => ({
      ...lab,
      ageGroup: undefined, // null = undefined for optional fields
      gender: undefined,
    })),
    skipDuplicates: true,
  });
  console.log(`   ✅ ${LAB_CRITICAL_VALUES.length} lab critical values seeded`);

  // 3. Vital Critical Values
  console.log('❤️ Seeding Vital Critical Values...');
  // حذف القيم القديمة أولاً
  await prisma.vitalCriticalValue.deleteMany({});
  // إنشاء القيم الجديدة
  await prisma.vitalCriticalValue.createMany({
    data: VITAL_CRITICAL_VALUES.map(vital => ({
      ...vital,
      ageGroup: vital.ageGroup ?? undefined, // تحويل null إلى undefined
    })),
    skipDuplicates: true,
  });
  console.log(`   ✅ ${VITAL_CRITICAL_VALUES.length} vital critical values seeded`);

  // 4. Renal Dose Requirements
  console.log('腎 Seeding Renal Dose Requirements...');
  await prisma.renalDoseRequirement.deleteMany({});
  await prisma.renalDoseRequirement.createMany({
    data: RENAL_DOSE_REQUIREMENTS,
    skipDuplicates: true,
  });
  console.log(`   ✅ ${RENAL_DOSE_REQUIREMENTS.length} renal dose requirements seeded`);

  // 5. Hepatic Dose Requirements
  console.log('肝 Seeding Hepatic Dose Requirements...');
  await prisma.hepaticDoseRequirement.deleteMany({});
  await prisma.hepaticDoseRequirement.createMany({
    data: HEPATIC_DOSE_REQUIREMENTS,
    skipDuplicates: true,
  });
  console.log(`   ✅ ${HEPATIC_DOSE_REQUIREMENTS.length} hepatic dose requirements seeded`);

  // 6. Allergy Groups & Members
  console.log('🛡️ Seeding Allergy Groups and Cross-Reactivity members...');
  for (const group of ALLERGY_GROUPS) {
    const allergyGroup = await prisma.allergyGroup.upsert({
      where: { name: group.name },
      update: {
        nameAr: group.nameAr,
        description: group.description,
      },
      create: {
        name: group.name,
        nameAr: group.nameAr,
        description: group.description,
      },
    });

    for (const member of group.members) {
      await prisma.allergyGroupDrug.upsert({
        where: {
          allergyGroupId_drugGeneric: {
            allergyGroupId: allergyGroup.id,
            drugGeneric: member.toLowerCase(),
          },
        },
        update: {},
        create: {
          allergyGroupId: allergyGroup.id,
          drugGeneric: member.toLowerCase(),
        },
      });
    }
  }
  console.log(`   ✅ ${ALLERGY_GROUPS.length} allergy groups seeded with members`);

  console.log('🎉 CDSS Seeding Complete!');
}

// Run if executed directly
if (require.main === module) {
  seedCDSS()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
