// prisma/seeds/seed-lab-radiology.ts
// Comprehensive Lab Tests & Radiology Studies Catalog

import { PrismaClient, ServiceType } from '@prisma/client';

// Price tiers by category (in LYD)
const labPriceMap: Record<string, number> = {
  'Hematology': 25, 'Biochemistry': 20, 'Hormones': 50, 'OB/GYN & Fertility': 45,
  'Andrology & Male Fertility': 50, 'Immunology': 40, 'Infectious Disease': 30,
  'Urinalysis': 15, 'Microbiology': 45, 'Tumor Markers': 60,
};
const labPriceOverrides: Record<string, number> = {
  'CBC': 25, 'LIPID': 60, 'LFT': 70, 'RFT': 60, 'ELEC': 55, 'IRON-P': 65,
  'THY-P': 90, 'FERT-F': 120, 'TORCH': 150, 'SEMEN': 80, 'ABG': 100,
  'OGTT': 45, 'PT': 25, 'HBA1C': 40, 'TROP-I': 80, 'BNP': 90,
  'PROCAL': 120, 'D-DIMER': 60, 'HB-ELEC': 70, 'COVID-PCR': 100,
  'SPERM-DNA': 200, 'BLD-CX': 60, 'CA125': 70,
};

const radPriceMap: Record<string, number> = {
  'X-RAY': 30, 'ULTRASOUND': 80, 'CT': 250, 'MRI': 500,
  'FLUOROSCOPY': 120, 'MAMMOGRAPHY': 100, 'DEXA': 80,
};
const radPriceOverrides: Record<string, number> = {
  'ECHO': 150, 'US-ANOMALY': 120, 'US-NT': 100, 'US-FOLLIC': 60,
  'HSG': 200, 'CTPA': 350, 'CTA-BRAIN': 400, 'CTA-AORTA': 400,
  'MRI-BREAST': 600, 'MRCP': 550, 'MRA-BRAIN': 550,
};

// ============================================================
//                    LAB TESTS CATALOG
// ============================================================

const labTests = [
  // ── Hematology ──
  { code: 'CBC', name: 'Complete Blood Count', arabicName: 'صورة دم كاملة', category: 'Hematology', params: [
    { code: 'WBC', name: 'White Blood Cells', unit: '10^3/uL', ref: '4.0-10.0' },
    { code: 'RBC', name: 'Red Blood Cells', unit: '10^6/uL', ref: '4.5-5.5' },
    { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL', ref: '13.0-17.0' },
    { code: 'HCT', name: 'Hematocrit', unit: '%', ref: '40-50' },
    { code: 'MCV', name: 'Mean Corpuscular Volume', unit: 'fL', ref: '80-100' },
    { code: 'MCH', name: 'Mean Corpuscular Hemoglobin', unit: 'pg', ref: '27-33' },
    { code: 'MCHC', name: 'MCHC', unit: 'g/dL', ref: '32-36' },
    { code: 'RDW', name: 'Red Cell Distribution Width', unit: '%', ref: '11.5-14.5' },
    { code: 'PLT', name: 'Platelets', unit: '10^3/uL', ref: '150-450' },
    { code: 'MPV', name: 'Mean Platelet Volume', unit: 'fL', ref: '7.4-10.4' },
    { code: 'LYM', name: 'Lymphocytes %', unit: '%', ref: '20-40' },
    { code: 'NEUT', name: 'Neutrophils %', unit: '%', ref: '40-60' },
    { code: 'MONO', name: 'Monocytes %', unit: '%', ref: '2-8' },
    { code: 'EOS', name: 'Eosinophils %', unit: '%', ref: '1-4' },
    { code: 'BASO', name: 'Basophils %', unit: '%', ref: '0-1' },
  ]},
  { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', arabicName: 'سرعة ترسيب الدم', category: 'Hematology', params: [] },
  { code: 'RETIC', name: 'Reticulocyte Count', arabicName: 'عدد الخلايا الشبكية', category: 'Hematology', params: [] },
  { code: 'ABO', name: 'Blood Group & Rh Type', arabicName: 'فصيلة الدم وعامل Rh', category: 'Hematology', params: [] },
  { code: 'COOMB-D', name: 'Direct Coombs Test', arabicName: 'اختبار كومبس المباشر', category: 'Hematology', params: [] },
  { code: 'COOMB-I', name: 'Indirect Coombs Test', arabicName: 'اختبار كومبس غير المباشر', category: 'Hematology', params: [] },
  { code: 'PT', name: 'Prothrombin Time / INR', arabicName: 'وقت البروثرومبين', category: 'Hematology', params: [
    { code: 'PT-SEC', name: 'PT (seconds)', unit: 'sec', ref: '11-13.5' },
    { code: 'INR', name: 'INR', unit: '', ref: '0.9-1.1' },
  ]},
  { code: 'PTT', name: 'Partial Thromboplastin Time', arabicName: 'وقت الثرومبوبلاستين الجزئي', category: 'Hematology', params: [] },
  { code: 'FBGN', name: 'Fibrinogen', arabicName: 'الفيبرينوجين', category: 'Hematology', params: [] },
  { code: 'D-DIMER', name: 'D-Dimer', arabicName: 'دي دايمر', category: 'Hematology', params: [] },
  { code: 'PERIPH', name: 'Peripheral Blood Smear', arabicName: 'مسحة دم محيطية', category: 'Hematology', params: [] },
  { code: 'HB-ELEC', name: 'Hemoglobin Electrophoresis', arabicName: 'الفصل الكهربائي للهيموجلوبين', category: 'Hematology', params: [] },
  { code: 'G6PD', name: 'G6PD Screen', arabicName: 'فحص نقص G6PD', category: 'Hematology', params: [] },
  { code: 'IRON-P', name: 'Iron Profile', arabicName: 'تحليل الحديد', category: 'Hematology', params: [
    { code: 'FE', name: 'Serum Iron', unit: 'µg/dL', ref: '60-170' },
    { code: 'TIBC', name: 'TIBC', unit: 'µg/dL', ref: '250-370' },
    { code: 'FERR', name: 'Ferritin', unit: 'ng/mL', ref: '12-150' },
    { code: 'TSAT', name: 'Transferrin Saturation', unit: '%', ref: '20-50' },
  ]},
  // ── Biochemistry ──
  { code: 'FBS', name: 'Fasting Blood Sugar', arabicName: 'سكر صائم', category: 'Biochemistry', params: [] },
  { code: 'RBS', name: 'Random Blood Sugar', arabicName: 'سكر عشوائي', category: 'Biochemistry', params: [] },
  { code: 'PPBS', name: 'Post-Prandial Blood Sugar', arabicName: 'سكر بعد الأكل', category: 'Biochemistry', params: [] },
  { code: 'OGTT', name: 'Oral Glucose Tolerance Test', arabicName: 'اختبار تحمل الجلوكوز', category: 'Biochemistry', params: [
    { code: 'OGTT-F', name: 'Fasting', unit: 'mg/dL', ref: '<100' },
    { code: 'OGTT-1H', name: '1 Hour', unit: 'mg/dL', ref: '<180' },
    { code: 'OGTT-2H', name: '2 Hours', unit: 'mg/dL', ref: '<140' },
  ]},
  { code: 'HBA1C', name: 'HbA1c (Glycated Hemoglobin)', arabicName: 'الهيموجلوبين السكري', category: 'Biochemistry', params: [] },
  { code: 'LIPID', name: 'Lipid Profile', arabicName: 'تحليل الدهون', category: 'Biochemistry', params: [
    { code: 'CHOL', name: 'Total Cholesterol', unit: 'mg/dL', ref: '<200' },
    { code: 'TRIG', name: 'Triglycerides', unit: 'mg/dL', ref: '<150' },
    { code: 'HDL', name: 'HDL', unit: 'mg/dL', ref: '>40' },
    { code: 'LDL', name: 'LDL', unit: 'mg/dL', ref: '<100' },
    { code: 'VLDL', name: 'VLDL', unit: 'mg/dL', ref: '<30' },
  ]},
  { code: 'LFT', name: 'Liver Function Tests', arabicName: 'وظائف الكبد', category: 'Biochemistry', params: [
    { code: 'ALT', name: 'ALT (SGPT)', unit: 'U/L', ref: '0-41' }, { code: 'AST', name: 'AST (SGOT)', unit: 'U/L', ref: '0-40' },
    { code: 'ALP', name: 'Alkaline Phosphatase', unit: 'U/L', ref: '40-129' }, { code: 'GGT', name: 'GGT', unit: 'U/L', ref: '0-60' },
    { code: 'BIL-T', name: 'Total Bilirubin', unit: 'mg/dL', ref: '0.1-1.2' }, { code: 'BIL-D', name: 'Direct Bilirubin', unit: 'mg/dL', ref: '0-0.3' },
    { code: 'ALB', name: 'Albumin', unit: 'g/dL', ref: '3.5-5.0' }, { code: 'TP', name: 'Total Protein', unit: 'g/dL', ref: '6.0-8.3' },
  ]},
  { code: 'RFT', name: 'Renal Function Tests', arabicName: 'وظائف الكلى', category: 'Biochemistry', params: [
    { code: 'UREA-S', name: 'Blood Urea', unit: 'mg/dL', ref: '7-20' }, { code: 'CREAT-S', name: 'Serum Creatinine', unit: 'mg/dL', ref: '0.7-1.3' },
    { code: 'BUN-S', name: 'BUN', unit: 'mg/dL', ref: '7-20' }, { code: 'URIC', name: 'Uric Acid', unit: 'mg/dL', ref: '3.5-7.2' },
    { code: 'EGFR', name: 'eGFR', unit: 'mL/min', ref: '>90' },
  ]},
  { code: 'ELEC', name: 'Electrolytes Panel', arabicName: 'الأملاح والمعادن', category: 'Biochemistry', params: [
    { code: 'NA', name: 'Sodium', unit: 'mEq/L', ref: '136-145' }, { code: 'K', name: 'Potassium', unit: 'mEq/L', ref: '3.5-5.1' },
    { code: 'CL', name: 'Chloride', unit: 'mEq/L', ref: '98-106' }, { code: 'CA', name: 'Calcium', unit: 'mg/dL', ref: '8.5-10.5' },
    { code: 'MG', name: 'Magnesium', unit: 'mg/dL', ref: '1.7-2.2' }, { code: 'PHOS', name: 'Phosphorus', unit: 'mg/dL', ref: '2.5-4.5' },
  ]},
  { code: 'UREA', name: 'Urea', arabicName: 'يوريا', category: 'Biochemistry', params: [] },
  { code: 'CREAT', name: 'Creatinine', arabicName: 'كرياتينين', category: 'Biochemistry', params: [] },
  { code: 'URIC-A', name: 'Uric Acid', arabicName: 'حمض اليوريك', category: 'Biochemistry', params: [] },
  { code: 'CRP', name: 'C-Reactive Protein', arabicName: 'البروتين التفاعلي C', category: 'Biochemistry', params: [] },
  { code: 'CRP-HS', name: 'High-Sensitivity CRP', arabicName: 'CRP عالي الحساسية', category: 'Biochemistry', params: [] },
  { code: 'LDH', name: 'Lactate Dehydrogenase', arabicName: 'إنزيم LDH', category: 'Biochemistry', params: [] },
  { code: 'AMYLASE', name: 'Amylase', arabicName: 'الأميليز', category: 'Biochemistry', params: [] },
  { code: 'LIPASE', name: 'Lipase', arabicName: 'الليباز', category: 'Biochemistry', params: [] },
  { code: 'CPK', name: 'Creatine Phosphokinase (CPK)', arabicName: 'إنزيم العضلات CPK', category: 'Biochemistry', params: [] },
  { code: 'TROP-I', name: 'Troponin I', arabicName: 'تروبونين I', category: 'Biochemistry', params: [] },
  { code: 'BNP', name: 'BNP / NT-proBNP', arabicName: 'مؤشر قصور القلب', category: 'Biochemistry', params: [] },
  { code: 'ABG', name: 'Arterial Blood Gases', arabicName: 'غازات الدم الشرياني', category: 'Biochemistry', params: [
    { code: 'PH', name: 'pH', unit: '', ref: '7.35-7.45' }, { code: 'PCO2', name: 'pCO2', unit: 'mmHg', ref: '35-45' },
    { code: 'PO2', name: 'pO2', unit: 'mmHg', ref: '80-100' }, { code: 'HCO3', name: 'HCO3', unit: 'mEq/L', ref: '22-26' },
    { code: 'BE', name: 'Base Excess', unit: 'mEq/L', ref: '-2 to +2' },
  ]},
  { code: 'PROCAL', name: 'Procalcitonin', arabicName: 'بروكالسيتونين', category: 'Biochemistry', params: [] },
  // ── Hormones ──
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', arabicName: 'هرمون الغدة الدرقية TSH', category: 'Hormones', params: [] },
  { code: 'FT3', name: 'Free T3', arabicName: 'T3 حر', category: 'Hormones', params: [] },
  { code: 'FT4', name: 'Free T4', arabicName: 'T4 حر', category: 'Hormones', params: [] },
  { code: 'THY-P', name: 'Thyroid Profile (TSH + FT3 + FT4)', arabicName: 'وظائف الغدة الدرقية', category: 'Hormones', params: [
    { code: 'TSH-P', name: 'TSH', unit: 'mIU/L', ref: '0.4-4.0' }, { code: 'FT3-P', name: 'Free T3', unit: 'pg/mL', ref: '2.0-4.4' },
    { code: 'FT4-P', name: 'Free T4', unit: 'ng/dL', ref: '0.8-1.8' },
  ]},
  { code: 'VITD', name: 'Vitamin D (25-OH)', arabicName: 'فيتامين د', category: 'Hormones', params: [] },
  { code: 'VITB12', name: 'Vitamin B12', arabicName: 'فيتامين ب12', category: 'Hormones', params: [] },
  { code: 'FOLATE', name: 'Folate / Folic Acid', arabicName: 'حمض الفوليك', category: 'Hormones', params: [] },
  { code: 'PTH', name: 'Parathyroid Hormone', arabicName: 'هرمون الغدة الجاردرقية', category: 'Hormones', params: [] },
  { code: 'CORTISOL', name: 'Cortisol (AM/PM)', arabicName: 'الكورتيزول', category: 'Hormones', params: [] },
  { code: 'INSULIN', name: 'Fasting Insulin', arabicName: 'الأنسولين صائم', category: 'Hormones', params: [] },
  { code: 'GH', name: 'Growth Hormone', arabicName: 'هرمون النمو', category: 'Hormones', params: [] },
  { code: 'IGF1', name: 'IGF-1', arabicName: 'عامل النمو الشبيه بالأنسولين', category: 'Hormones', params: [] },
  { code: 'PRL', name: 'Prolactin', arabicName: 'هرمون الحليب (البرولاكتين)', category: 'Hormones', params: [] },
  { code: 'ALDO', name: 'Aldosterone', arabicName: 'الألدوستيرون', category: 'Hormones', params: [] },
  // ── OB/GYN & Fertility ──
  { code: 'BHCG', name: 'Beta HCG (Pregnancy Test)', arabicName: 'اختبار الحمل (Beta HCG)', category: 'OB/GYN & Fertility', params: [] },
  { code: 'BHCG-Q', name: 'Quantitative Beta HCG', arabicName: 'Beta HCG كمي', category: 'OB/GYN & Fertility', params: [] },
  { code: 'FSH', name: 'Follicle Stimulating Hormone', arabicName: 'هرمون FSH', category: 'OB/GYN & Fertility', params: [] },
  { code: 'LH', name: 'Luteinizing Hormone', arabicName: 'هرمون LH', category: 'OB/GYN & Fertility', params: [] },
  { code: 'E2', name: 'Estradiol (E2)', arabicName: 'الإستراديول', category: 'OB/GYN & Fertility', params: [] },
  { code: 'PROG', name: 'Progesterone', arabicName: 'البروجسترون', category: 'OB/GYN & Fertility', params: [] },
  { code: 'AMH', name: 'Anti-Müllerian Hormone (AMH)', arabicName: 'مخزون المبيض AMH', category: 'OB/GYN & Fertility', params: [] },
  { code: 'FERT-F', name: 'Female Fertility Panel', arabicName: 'تحاليل خصوبة المرأة', category: 'OB/GYN & Fertility', params: [
    { code: 'FSH-F', name: 'FSH', unit: 'mIU/mL', ref: '3.5-12.5' }, { code: 'LH-F', name: 'LH', unit: 'mIU/mL', ref: '2.4-12.6' },
    { code: 'E2-F', name: 'Estradiol', unit: 'pg/mL', ref: '12.5-166' }, { code: 'PROG-F', name: 'Progesterone', unit: 'ng/mL', ref: '0.2-1.5' },
    { code: 'AMH-F', name: 'AMH', unit: 'ng/mL', ref: '1.0-3.5' }, { code: 'PRL-F', name: 'Prolactin', unit: 'ng/mL', ref: '4.8-23.3' },
  ]},
  { code: 'DHEAS', name: 'DHEA-Sulfate', arabicName: 'هرمون DHEA', category: 'OB/GYN & Fertility', params: [] },
  { code: 'TESTO-F', name: 'Testosterone (Female)', arabicName: 'تستوستيرون (نساء)', category: 'OB/GYN & Fertility', params: [] },
  { code: 'SHBG', name: 'Sex Hormone Binding Globulin', arabicName: 'الجلوبيولين الرابط للهرمونات الجنسية', category: 'OB/GYN & Fertility', params: [] },
  { code: '17OHP', name: '17-OH Progesterone', arabicName: '17 هيدروكسي بروجسترون', category: 'OB/GYN & Fertility', params: [] },
  { code: 'ANTID', name: 'Anti-D Antibody Screen', arabicName: 'فحص الأجسام المضادة Anti-D', category: 'OB/GYN & Fertility', params: [] },
  { code: 'TORCH', name: 'TORCH Panel', arabicName: 'تحاليل TORCH للحمل', category: 'OB/GYN & Fertility', params: [
    { code: 'TOXO-IGG', name: 'Toxoplasma IgG', unit: 'IU/mL', ref: 'Negative' }, { code: 'TOXO-IGM', name: 'Toxoplasma IgM', unit: '', ref: 'Negative' },
    { code: 'RUB-IGG', name: 'Rubella IgG', unit: 'IU/mL', ref: '>10' }, { code: 'RUB-IGM', name: 'Rubella IgM', unit: '', ref: 'Negative' },
    { code: 'CMV-IGG', name: 'CMV IgG', unit: 'AU/mL', ref: 'Varies' }, { code: 'CMV-IGM', name: 'CMV IgM', unit: '', ref: 'Negative' },
    { code: 'HSV-IGG', name: 'HSV IgG', unit: '', ref: 'Negative' }, { code: 'HSV-IGM', name: 'HSV IgM', unit: '', ref: 'Negative' },
  ]},
  { code: 'PAP', name: 'Pap Smear', arabicName: 'مسحة عنق الرحم', category: 'OB/GYN & Fertility', params: [] },
  { code: 'HVS', name: 'High Vaginal Swab (HVS)', arabicName: 'مسحة مهبلية', category: 'OB/GYN & Fertility', params: [] },
  { code: 'GBS', name: 'Group B Strep Screen', arabicName: 'فحص ستربتوكوكس جروب بي', category: 'OB/GYN & Fertility', params: [] },
  { code: 'CA125', name: 'CA-125', arabicName: 'دلالة أورام المبيض CA-125', category: 'OB/GYN & Fertility', params: [] },
  // ── Andrology & Male Fertility ──
  { code: 'SEMEN', name: 'Semen Analysis (Seminogram)', arabicName: 'تحليل السائل المنوي', category: 'Andrology & Male Fertility', params: [
    { code: 'SEM-VOL', name: 'Volume', unit: 'mL', ref: '>=1.5' }, { code: 'SEM-CNT', name: 'Sperm Count', unit: 'M/mL', ref: '>=15' },
    { code: 'SEM-MOT', name: 'Total Motility', unit: '%', ref: '>=40' }, { code: 'SEM-PRG', name: 'Progressive Motility', unit: '%', ref: '>=32' },
    { code: 'SEM-MOR', name: 'Normal Morphology', unit: '%', ref: '>=4' }, { code: 'SEM-VIT', name: 'Vitality', unit: '%', ref: '>=58' },
  ]},
  { code: 'TESTO', name: 'Total Testosterone', arabicName: 'التستوستيرون الكلي', category: 'Andrology & Male Fertility', params: [] },
  { code: 'TESTO-F2', name: 'Free Testosterone', arabicName: 'التستوستيرون الحر', category: 'Andrology & Male Fertility', params: [] },
  { code: 'FSH-M', name: 'FSH (Male)', arabicName: 'هرمون FSH للرجال', category: 'Andrology & Male Fertility', params: [] },
  { code: 'LH-M', name: 'LH (Male)', arabicName: 'هرمون LH للرجال', category: 'Andrology & Male Fertility', params: [] },
  { code: 'PSA', name: 'Prostate Specific Antigen (PSA)', arabicName: 'مستضد البروستاتا PSA', category: 'Andrology & Male Fertility', params: [] },
  { code: 'PSA-F', name: 'Free PSA', arabicName: 'PSA الحر', category: 'Andrology & Male Fertility', params: [] },
  { code: 'SPERM-AB', name: 'Anti-Sperm Antibodies', arabicName: 'أجسام مضادة للحيوانات المنوية', category: 'Andrology & Male Fertility', params: [] },
  { code: 'SPERM-DNA', name: 'Sperm DNA Fragmentation', arabicName: 'تفتت DNA الحيوانات المنوية', category: 'Andrology & Male Fertility', params: [] },
  { code: 'INHIB-B', name: 'Inhibin B', arabicName: 'إنهيبين ب', category: 'Andrology & Male Fertility', params: [] },
  // ── Immunology ──
  { code: 'ANA', name: 'Antinuclear Antibodies (ANA)', arabicName: 'الأجسام المضادة للنواة', category: 'Immunology', params: [] },
  { code: 'ANTI-DS', name: 'Anti-dsDNA', arabicName: 'أجسام مضادة dsDNA', category: 'Immunology', params: [] },
  { code: 'RF', name: 'Rheumatoid Factor', arabicName: 'عامل الروماتويد', category: 'Immunology', params: [] },
  { code: 'ANTI-CCP', name: 'Anti-CCP Antibodies', arabicName: 'أجسام مضادة CCP', category: 'Immunology', params: [] },
  { code: 'ASOT', name: 'ASO Titer', arabicName: 'اختبار ASO', category: 'Immunology', params: [] },
  { code: 'COMPL', name: 'Complement C3 & C4', arabicName: 'مكملات المناعة C3 وC4', category: 'Immunology', params: [] },
  { code: 'IGE', name: 'Total IgE', arabicName: 'الجلوبيولين المناعي IgE', category: 'Immunology', params: [] },
  { code: 'WIDAL', name: 'Widal Test', arabicName: 'اختبار الويدال', category: 'Immunology', params: [] },
  // ── Infectious Disease ──
  { code: 'HBSAG', name: 'Hepatitis B Surface Antigen', arabicName: 'التهاب الكبد ب', category: 'Infectious Disease', params: [] },
  { code: 'HCV-AB', name: 'Hepatitis C Antibody', arabicName: 'التهاب الكبد سي', category: 'Infectious Disease', params: [] },
  { code: 'HIV', name: 'HIV 1/2 Ab/Ag', arabicName: 'فحص فيروس نقص المناعة', category: 'Infectious Disease', params: [] },
  { code: 'VDRL', name: 'VDRL / RPR (Syphilis)', arabicName: 'فحص الزهري', category: 'Infectious Disease', params: [] },
  { code: 'MALARIA', name: 'Malaria Smear / RDT', arabicName: 'فحص الملاريا', category: 'Infectious Disease', params: [] },
  { code: 'COVID-AG', name: 'COVID-19 Rapid Antigen', arabicName: 'فحص كوفيد-19 السريع', category: 'Infectious Disease', params: [] },
  { code: 'COVID-PCR', name: 'COVID-19 PCR', arabicName: 'فحص كوفيد-19 PCR', category: 'Infectious Disease', params: [] },
  { code: 'TB-IGRA', name: 'TB QuantiFERON (IGRA)', arabicName: 'فحص السل IGRA', category: 'Infectious Disease', params: [] },
  { code: 'BRUC', name: 'Brucella Antibodies', arabicName: 'فحص الحمى المالطية', category: 'Infectious Disease', params: [] },
  // ── Urinalysis ──
  { code: 'URINE', name: 'Complete Urine Analysis', arabicName: 'تحليل بول كامل', category: 'Urinalysis', params: [] },
  { code: 'UCR', name: 'Urine Culture & Sensitivity', arabicName: 'مزرعة بول', category: 'Urinalysis', params: [] },
  { code: 'ACR', name: 'Albumin/Creatinine Ratio', arabicName: 'نسبة الألبومين/كرياتينين', category: 'Urinalysis', params: [] },
  { code: 'U-PREG', name: 'Urine Pregnancy Test', arabicName: 'اختبار حمل بول', category: 'Urinalysis', params: [] },
  { code: 'U-DRUG', name: 'Urine Drug Screen', arabicName: 'فحص المخدرات', category: 'Urinalysis', params: [] },
  { code: '24H-PROT', name: '24-Hour Urine Protein', arabicName: 'بروتين البول 24 ساعة', category: 'Urinalysis', params: [] },
  // ── Microbiology ──
  { code: 'BLD-CX', name: 'Blood Culture', arabicName: 'مزرعة دم', category: 'Microbiology', params: [] },
  { code: 'WND-CX', name: 'Wound Culture', arabicName: 'مزرعة جرح', category: 'Microbiology', params: [] },
  { code: 'SPT-CX', name: 'Sputum Culture', arabicName: 'مزرعة بلغم', category: 'Microbiology', params: [] },
  { code: 'THRT-CX', name: 'Throat Culture', arabicName: 'مزرعة حلق', category: 'Microbiology', params: [] },
  { code: 'STL-CX', name: 'Stool Culture', arabicName: 'مزرعة براز', category: 'Microbiology', params: [] },
  { code: 'STL-OVA', name: 'Stool Ova & Parasites', arabicName: 'فحص براز للطفيليات', category: 'Microbiology', params: [] },
  { code: 'STL-OB', name: 'Stool Occult Blood', arabicName: 'دم خفي في البراز', category: 'Microbiology', params: [] },
  { code: 'H-PYLORI', name: 'H. pylori Test', arabicName: 'جرثومة المعدة', category: 'Microbiology', params: [] },
  // ── Tumor Markers ──
  { code: 'AFP', name: 'Alpha-Fetoprotein', arabicName: 'دلالة أورام الكبد AFP', category: 'Tumor Markers', params: [] },
  { code: 'CEA', name: 'CEA', arabicName: 'دلالة أورام القولون CEA', category: 'Tumor Markers', params: [] },
  { code: 'CA19-9', name: 'CA 19-9', arabicName: 'دلالة أورام البنكرياس', category: 'Tumor Markers', params: [] },
  { code: 'CA15-3', name: 'CA 15-3', arabicName: 'دلالة أورام الثدي', category: 'Tumor Markers', params: [] },
];

// ============================================================
//                 RADIOLOGY STUDIES CATALOG
// ============================================================

const radiologyStudies = [
  // ── X-Ray ──
  { code: 'XR-CHEST-PA', name: 'Chest X-Ray (PA)', arabicName: 'أشعة صدر أمامية', modality: 'X-RAY', bodyPart: 'Chest' },
  { code: 'XR-CHEST-LAT', name: 'Chest X-Ray (Lateral)', arabicName: 'أشعة صدر جانبية', modality: 'X-RAY', bodyPart: 'Chest' },
  { code: 'XR-ABD', name: 'Abdominal X-Ray', arabicName: 'أشعة بطن', modality: 'X-RAY', bodyPart: 'Abdomen' },
  { code: 'XR-PELVIS', name: 'Pelvic X-Ray', arabicName: 'أشعة حوض', modality: 'X-RAY', bodyPart: 'Pelvis' },
  { code: 'XR-SKULL', name: 'Skull X-Ray', arabicName: 'أشعة جمجمة', modality: 'X-RAY', bodyPart: 'Head' },
  { code: 'XR-C-SPINE', name: 'Cervical Spine X-Ray', arabicName: 'أشعة فقرات عنقية', modality: 'X-RAY', bodyPart: 'Spine' },
  { code: 'XR-T-SPINE', name: 'Thoracic Spine X-Ray', arabicName: 'أشعة فقرات صدرية', modality: 'X-RAY', bodyPart: 'Spine' },
  { code: 'XR-L-SPINE', name: 'Lumbosacral Spine X-Ray', arabicName: 'أشعة فقرات قطنية', modality: 'X-RAY', bodyPart: 'Spine' },
  { code: 'XR-KNEE', name: 'Knee X-Ray', arabicName: 'أشعة ركبة', modality: 'X-RAY', bodyPart: 'Knee' },
  { code: 'XR-SHOULDER', name: 'Shoulder X-Ray', arabicName: 'أشعة كتف', modality: 'X-RAY', bodyPart: 'Shoulder' },
  { code: 'XR-HIP', name: 'Hip X-Ray', arabicName: 'أشعة مفصل الورك', modality: 'X-RAY', bodyPart: 'Hip' },
  { code: 'XR-HAND', name: 'Hand X-Ray', arabicName: 'أشعة يد', modality: 'X-RAY', bodyPart: 'Hand' },
  { code: 'XR-FOOT', name: 'Foot X-Ray', arabicName: 'أشعة قدم', modality: 'X-RAY', bodyPart: 'Foot' },
  { code: 'XR-ANKLE', name: 'Ankle X-Ray', arabicName: 'أشعة كاحل', modality: 'X-RAY', bodyPart: 'Ankle' },
  { code: 'XR-WRIST', name: 'Wrist X-Ray', arabicName: 'أشعة معصم', modality: 'X-RAY', bodyPart: 'Wrist' },
  { code: 'XR-ELBOW', name: 'Elbow X-Ray', arabicName: 'أشعة كوع', modality: 'X-RAY', bodyPart: 'Elbow' },
  // ── Ultrasound ──
  { code: 'US-ABD', name: 'Abdominal US (Complete)', arabicName: 'سونار بطن كامل', modality: 'ULTRASOUND', bodyPart: 'Abdomen' },
  { code: 'US-PELV', name: 'Pelvic Ultrasound', arabicName: 'سونار حوض', modality: 'ULTRASOUND', bodyPart: 'Pelvis' },
  { code: 'US-TV', name: 'Transvaginal Ultrasound', arabicName: 'سونار مهبلي', modality: 'ULTRASOUND', bodyPart: 'Pelvis' },
  { code: 'US-RENAL', name: 'Renal Ultrasound', arabicName: 'سونار كلى', modality: 'ULTRASOUND', bodyPart: 'Kidneys' },
  { code: 'US-THYROID', name: 'Thyroid Ultrasound', arabicName: 'سونار غدة درقية', modality: 'ULTRASOUND', bodyPart: 'Neck' },
  { code: 'US-BREAST', name: 'Breast Ultrasound', arabicName: 'سونار ثدي', modality: 'ULTRASOUND', bodyPart: 'Breast' },
  { code: 'US-SCROTAL', name: 'Scrotal Ultrasound', arabicName: 'سونار الخصية', modality: 'ULTRASOUND', bodyPart: 'Scrotum' },
  { code: 'US-PROSTATE', name: 'Prostate US (TRUS)', arabicName: 'سونار بروستاتا', modality: 'ULTRASOUND', bodyPart: 'Prostate' },
  { code: 'US-SOFT', name: 'Soft Tissue US', arabicName: 'سونار أنسجة رخوة', modality: 'ULTRASOUND', bodyPart: 'Soft Tissue' },
  { code: 'ECHO', name: 'Echocardiography', arabicName: 'إيكو القلب', modality: 'ULTRASOUND', bodyPart: 'Heart' },
  { code: 'CAROTID-US', name: 'Carotid Doppler', arabicName: 'دوبلر الشريان السباتي', modality: 'ULTRASOUND', bodyPart: 'Neck' },
  { code: 'VENOUS-US', name: 'Venous Doppler (LL)', arabicName: 'دوبلر أوردة الأطراف السفلية', modality: 'ULTRASOUND', bodyPart: 'Lower Limbs' },
  { code: 'ARTERIAL-US', name: 'Arterial Doppler (LL)', arabicName: 'دوبلر شرايين الأطراف السفلية', modality: 'ULTRASOUND', bodyPart: 'Lower Limbs' },
  // ── OB/GYN Ultrasound ──
  { code: 'US-OB-1T', name: 'Obstetric US — 1st Trimester', arabicName: 'سونار حمل — الثلث الأول', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-OB-2T', name: 'Obstetric US — 2nd Trimester', arabicName: 'سونار حمل — الثلث الثاني', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-OB-3T', name: 'Obstetric US — 3rd Trimester', arabicName: 'سونار حمل — الثلث الثالث', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-OB-DOPPLER', name: 'Fetal Doppler', arabicName: 'دوبلر الجنين', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-ANOMALY', name: 'Anomaly Scan (Level II)', arabicName: 'سونار تفصيلي للجنين', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-NT', name: 'Nuchal Translucency (NT)', arabicName: 'فحص الشفافية القفوية', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  { code: 'US-FOLLIC', name: 'Follicular Tracking', arabicName: 'متابعة التبويض', modality: 'ULTRASOUND', bodyPart: 'Ovary' },
  { code: 'HSG', name: 'Hysterosalpingography', arabicName: 'أشعة الرحم والأنابيب بالصبغة', modality: 'FLUOROSCOPY', bodyPart: 'Uterus/Tubes' },
  { code: 'SIS', name: 'Saline Infusion Sonography', arabicName: 'سونار بالمحلول الملحي', modality: 'ULTRASOUND', bodyPart: 'Uterus' },
  // ── CT ──
  { code: 'CT-HEAD', name: 'CT Head (Non-Contrast)', arabicName: 'مقطعية رأس', modality: 'CT', bodyPart: 'Head' },
  { code: 'CT-HEAD-C', name: 'CT Head (Contrast)', arabicName: 'مقطعية رأس بالصبغة', modality: 'CT', bodyPart: 'Head' },
  { code: 'CT-CHEST', name: 'CT Chest', arabicName: 'مقطعية صدر', modality: 'CT', bodyPart: 'Chest' },
  { code: 'CT-CHEST-HR', name: 'HRCT Chest', arabicName: 'مقطعية صدر عالية الدقة', modality: 'CT', bodyPart: 'Chest' },
  { code: 'CTPA', name: 'CT Pulmonary Angiography', arabicName: 'مقطعية شرايين الرئة', modality: 'CT', bodyPart: 'Chest' },
  { code: 'CT-ABD', name: 'CT Abdomen & Pelvis', arabicName: 'مقطعية بطن وحوض', modality: 'CT', bodyPart: 'Abdomen' },
  { code: 'CT-ABD-C', name: 'CT Abd & Pelvis (Contrast)', arabicName: 'مقطعية بطن بالصبغة', modality: 'CT', bodyPart: 'Abdomen' },
  { code: 'CT-SPINE', name: 'CT Spine (Lumbar)', arabicName: 'مقطعية فقرات قطنية', modality: 'CT', bodyPart: 'Spine' },
  { code: 'CT-KUB', name: 'CT KUB (Renal Stone)', arabicName: 'مقطعية كلى وحالب ومثانة', modality: 'CT', bodyPart: 'Abdomen' },
  { code: 'CTA-BRAIN', name: 'CT Angiography Brain', arabicName: 'مقطعية أوعية الدماغ', modality: 'CT', bodyPart: 'Head' },
  { code: 'CTA-AORTA', name: 'CT Angiography Aorta', arabicName: 'مقطعية الأورطي', modality: 'CT', bodyPart: 'Chest/Abdomen' },
  // ── MRI ──
  { code: 'MRI-BRAIN', name: 'MRI Brain', arabicName: 'رنين مغناطيسي دماغ', modality: 'MRI', bodyPart: 'Head' },
  { code: 'MRI-BRAIN-C', name: 'MRI Brain (Contrast)', arabicName: 'رنين دماغ بالصبغة', modality: 'MRI', bodyPart: 'Head' },
  { code: 'MRI-C-SPINE', name: 'MRI Cervical Spine', arabicName: 'رنين فقرات عنقية', modality: 'MRI', bodyPart: 'Spine' },
  { code: 'MRI-L-SPINE', name: 'MRI Lumbar Spine', arabicName: 'رنين فقرات قطنية', modality: 'MRI', bodyPart: 'Spine' },
  { code: 'MRI-KNEE', name: 'MRI Knee', arabicName: 'رنين ركبة', modality: 'MRI', bodyPart: 'Knee' },
  { code: 'MRI-SHOULDER', name: 'MRI Shoulder', arabicName: 'رنين كتف', modality: 'MRI', bodyPart: 'Shoulder' },
  { code: 'MRI-HIP', name: 'MRI Hip', arabicName: 'رنين مفصل الورك', modality: 'MRI', bodyPart: 'Hip' },
  { code: 'MRI-ABD', name: 'MRI Abdomen', arabicName: 'رنين بطن', modality: 'MRI', bodyPart: 'Abdomen' },
  { code: 'MRI-PELV', name: 'MRI Pelvis', arabicName: 'رنين حوض', modality: 'MRI', bodyPart: 'Pelvis' },
  { code: 'MRI-BREAST', name: 'MRI Breast', arabicName: 'رنين ثدي', modality: 'MRI', bodyPart: 'Breast' },
  { code: 'MRCP', name: 'MRCP (Bile Ducts)', arabicName: 'رنين القنوات الصفراوية', modality: 'MRI', bodyPart: 'Abdomen' },
  { code: 'MRA-BRAIN', name: 'MR Angiography Brain', arabicName: 'رنين أوعية الدماغ', modality: 'MRI', bodyPart: 'Head' },
  // ── Special ──
  { code: 'MAMMO', name: 'Mammography', arabicName: 'تصوير الثدي الشعاعي', modality: 'MAMMOGRAPHY', bodyPart: 'Breast' },
  { code: 'DEXA', name: 'DEXA Bone Densitometry', arabicName: 'قياس كثافة العظام', modality: 'DEXA', bodyPart: 'Spine/Hip' },
  { code: 'FLUORO-SWALL', name: 'Barium Swallow', arabicName: 'أشعة بلع الباريوم', modality: 'FLUOROSCOPY', bodyPart: 'Esophagus' },
  { code: 'FLUORO-MEAL', name: 'Barium Meal', arabicName: 'وجبة الباريوم', modality: 'FLUOROSCOPY', bodyPart: 'Stomach' },
  { code: 'IVP', name: 'Intravenous Pyelogram', arabicName: 'تصوير المسالك البولية بالصبغة', modality: 'FLUOROSCOPY', bodyPart: 'Kidneys/Ureters' },
];

// ============================================================
//                     SEED FUNCTION
// ============================================================

export async function seedLabRadiology() {
  const prisma = new PrismaClient();
  try {
  console.log('🧪 Seeding Comprehensive Lab & Radiology Catalogs...');

  const hospital = await prisma.hospital.findFirst();
  if (!hospital) {
    console.error('No hospital found! Run basic seed first.');
    return;
  }
  const hospitalId = hospital.id;

  // === Lab Tests ===
  console.log(`Seeding ${labTests.length} lab tests with ServiceItem prices...`);
  let labCount = 0;
  for (const t of labTests) {
    const price = labPriceOverrides[t.code] ?? labPriceMap[t.category] ?? 20;
    const serviceCode = `LAB-${t.code}`;
    const serviceItem = await prisma.serviceItem.upsert({
      where: { code: serviceCode },
      update: { name: t.arabicName || t.name, defaultPrice: price },
      create: {
        hospitalId, code: serviceCode, name: t.arabicName || t.name,
        type: ServiceType.LAB, defaultPrice: price, isActive: true, isBillable: true,
      },
    });

    const test = await prisma.labTest.upsert({
      where: { hospitalId_code: { hospitalId, code: t.code } },
      update: { arabicName: t.arabicName, category: t.category, serviceItemId: serviceItem.id },
      create: {
        hospitalId, code: t.code, name: t.name, arabicName: t.arabicName,
        category: t.category, isActive: true, serviceItemId: serviceItem.id,
      },
    });

    if (t.params && t.params.length > 0) {
      for (const p of t.params) {
        const existing = await prisma.labTestParameter.findFirst({
          where: { labTestId: test.id, code: p.code },
        });
        if (!existing) {
          await prisma.labTestParameter.create({
            data: { labTestId: test.id, code: p.code, name: p.name, unit: p.unit, refRange: p.ref },
          });
        }
      }
    }
    labCount++;
  }
  console.log(`✅ ${labCount} lab tests seeded with prices.`);

  // === Radiology Studies ===
  console.log(`Seeding ${radiologyStudies.length} radiology studies with ServiceItem prices...`);
  let radCount = 0;
  for (const s of radiologyStudies) {
    const price = radPriceOverrides[s.code] ?? radPriceMap[s.modality] ?? 100;
    const serviceCode = `RAD-${s.code}`;
    const serviceItem = await prisma.serviceItem.upsert({
      where: { code: serviceCode },
      update: { name: s.arabicName || s.name, defaultPrice: price },
      create: {
        hospitalId, code: serviceCode, name: s.arabicName || s.name,
        type: ServiceType.RADIOLOGY, defaultPrice: price, isActive: true, isBillable: true,
      },
    });

    await prisma.radiologyStudy.upsert({
      where: { hospitalId_code: { hospitalId, code: s.code } },
      update: { arabicName: s.arabicName, modality: s.modality, bodyPart: s.bodyPart, serviceItemId: serviceItem.id },
      create: {
        hospitalId, code: s.code, name: s.name, arabicName: s.arabicName,
        modality: s.modality, bodyPart: s.bodyPart, isActive: true, serviceItemId: serviceItem.id,
      },
    });
    radCount++;
  }
  console.log(`✅ ${radCount} radiology studies seeded with prices.`);
  console.log('🎉 Lab & Radiology catalogs seeded successfully!');
  } finally {
    await prisma.$disconnect();
  }
}
