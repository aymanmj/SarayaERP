// prisma/seeds/data/diagnoses.ts

export const diagnosesData = [
  // --- أمراض القلب والدورة الدموية (I00-I99) ---
  {
    code: 'I10',
    nameEn: 'Essential (primary) hypertension',
    nameAr: 'ارتفاع ضغط الدم الأساسي',
  },
  {
    code: 'I11.0',
    nameEn: 'Hypertensive heart disease with heart failure',
    nameAr: 'مرض القلب الناتج عن ارتفاع الضغط مع فشل القلب',
  },
  {
    code: 'I11.9',
    nameEn: 'Hypertensive heart disease without heart failure',
    nameAr: 'مرض القلب الناتج عن ارتفاع الضغط بدون فشل',
  },
  {
    code: 'I20.0',
    nameEn: 'Unstable angina',
    nameAr: 'الذبحة الصدرية غير المستقرة',
  },
  {
    code: 'I20.9',
    nameEn: 'Angina pectoris, unspecified',
    nameAr: 'الذبحة الصدرية غير المحددة',
  },
  {
    code: 'I21.9',
    nameEn: 'Acute myocardial infarction, unspecified',
    nameAr: 'احتشاء عضلة القلب الحاد (نوبة قلبية)',
  },
  {
    code: 'I25.10',
    nameEn: 'Atherosclerotic heart disease',
    nameAr: 'تصلب الشرايين القلبية',
  },
  {
    code: 'I48.0',
    nameEn: 'Paroxysmal atrial fibrillation',
    nameAr: 'الرجفان الأذيني الانتيابي',
  },
  {
    code: 'I48.91',
    nameEn: 'Unspecified atrial fibrillation',
    nameAr: 'الرجفان الأذيني غير المحدد',
  },
  { code: 'I50.9', nameEn: 'Heart failure, unspecified', nameAr: 'فشل القلب' },
  {
    code: 'I50.22',
    nameEn: 'Chronic systolic (congestive) heart failure',
    nameAr: 'فشل القلب الاحتقاني الانقباضي المزمن',
  },
  {
    code: 'I63.9',
    nameEn: 'Cerebral infarction, unspecified',
    nameAr: 'جلطة دماغية',
  },
  {
    code: 'I80.2',
    nameEn: 'Phlebitis and thrombophlebitis of deep vessels',
    nameAr: 'التهاب الوريد الخثاري (جلطة الساق)',
  },

  // --- الغدد الصماء والتمثيل الغذائي (E00-E90) ---
  {
    code: 'E03.9',
    nameEn: 'Hypothyroidism, unspecified',
    nameAr: 'قصور الغدة الدرقية',
  },
  {
    code: 'E05.9',
    nameEn: 'Thyrotoxicosis, unspecified',
    nameAr: 'فرط نشاط الغدة الدرقية',
  },
  {
    code: 'E10.9',
    nameEn: 'Type 1 diabetes mellitus without complications',
    nameAr: 'السكري النوع 1 (بدون مضاعفات)',
  },
  {
    code: 'E11.21',
    nameEn: 'Type 2 diabetes mellitus with diabetic nephropathy',
    nameAr: 'السكري النوع 2 مع اعتلال الكلية',
  },
  {
    code: 'E11.40',
    nameEn: 'Type 2 diabetes mellitus with diabetic neuropathy',
    nameAr: 'السكري النوع 2 مع اعتلال الأعصاب',
  },
  {
    code: 'E11.51',
    nameEn: 'Type 2 diabetes mellitus with diabetic peripheral angiopathy',
    nameAr: 'السكري النوع 2 مع اعتلال الأوعية الدموية',
  },
  {
    code: 'E11.621',
    nameEn: 'Type 2 diabetes mellitus with foot ulcer',
    nameAr: 'السكري النوع 2 مع قرحة القدم',
  },
  {
    code: 'E11.9',
    nameEn: 'Type 2 diabetes mellitus without complications',
    nameAr: 'السكري النوع 2 (بدون مضاعفات)',
  },
  {
    code: 'E66.01',
    nameEn: 'Morbid (severe) obesity',
    nameAr: 'السمنة المفرطة',
  },
  { code: 'E66.3', nameEn: 'Overweight', nameAr: 'زيادة الوزن' },
  {
    code: 'E78.0',
    nameEn: 'Pure hypercholesterolemia',
    nameAr: 'ارتفاع الكوليسترول',
  },
  {
    code: 'E78.2',
    nameEn: 'Mixed hyperlipidemia',
    nameAr: 'ارتفاع دهون الدم المختلط',
  },
  {
    code: 'E87.1',
    nameEn: 'Hypo-osmolality and hyponatremia',
    nameAr: 'نقص الصوديوم',
  },
  { code: 'E87.5', nameEn: 'Hyperkalemia', nameAr: 'ارتفاع البوتاسيوم' },
  { code: 'E87.6', nameEn: 'Hypokalemia', nameAr: 'نقص البوتاسيوم' },
  {
    code: 'D50.9',
    nameEn: 'Iron deficiency anemia, unspecified',
    nameAr: 'أنيميا نقص الحديد',
  },
  { code: 'D64.9', nameEn: 'Anemia, unspecified', nameAr: 'فقر دم غير محدد' },

  // --- الجهاز التنفسي (J00-J99) ---
  {
    code: 'J00',
    nameEn: 'Acute nasopharyngitis [common cold]',
    nameAr: 'زكام (التهاب البلعوم الأنفي)',
  },
  {
    code: 'J01.90',
    nameEn: 'Acute sinusitis, unspecified',
    nameAr: 'التهاب الجيوب الأنفية الحاد',
  },
  {
    code: 'J02.0',
    nameEn: 'Streptococcal pharyngitis',
    nameAr: 'التهاب الحلق العقدي',
  },
  {
    code: 'J03.90',
    nameEn: 'Acute tonsillitis, unspecified',
    nameAr: 'التهاب اللوزتين الحاد',
  },
  {
    code: 'J06.9',
    nameEn: 'Acute upper respiratory infection, unspecified',
    nameAr: 'عدوى الجهاز التنفسي العلوي',
  },
  {
    code: 'J11.1',
    nameEn: 'Influenza with other respiratory manifestations',
    nameAr: 'إنفلونزا',
  },
  {
    code: 'J18.9',
    nameEn: 'Pneumonia, unspecified organism',
    nameAr: 'التهاب رئوي',
  },
  {
    code: 'J20.9',
    nameEn: 'Acute bronchitis, unspecified',
    nameAr: 'التهاب الشعب الهوائية الحاد',
  },
  {
    code: 'J30.1',
    nameEn: 'Allergic rhinitis due to pollen',
    nameAr: 'حساسية الأنف (حبوب اللقاح)',
  },
  {
    code: 'J44.1',
    nameEn: 'COPD with (acute) exacerbation',
    nameAr: 'انسداد رئوي مزمن (نوبة حادة)',
  },
  {
    code: 'J44.9',
    nameEn: 'Chronic obstructive pulmonary disease, unspecified',
    nameAr: 'انسداد رئوي مزمن (COPD)',
  },
  {
    code: 'J45.901',
    nameEn: 'Unspecified asthma with (acute) exacerbation',
    nameAr: 'ربو شعبي (نوبة حادة)',
  },
  {
    code: 'J45.909',
    nameEn: 'Unspecified asthma, uncomplicated',
    nameAr: 'ربو شعبي (مستقر)',
  },

  // --- الجهاز الهضمي (K00-K93) ---
  {
    code: 'K21.0',
    nameEn: 'Gastro-esophageal reflux disease with esophagitis',
    nameAr: 'ارتجاع المريء مع التهاب',
  },
  {
    code: 'K21.9',
    nameEn: 'Gastro-esophageal reflux disease without esophagitis',
    nameAr: 'ارتجاع المريء (GERD)',
  },
  {
    code: 'K29.00',
    nameEn: 'Acute gastritis without bleeding',
    nameAr: 'التهاب المعدة الحاد',
  },
  {
    code: 'K29.70',
    nameEn: 'Gastritis, unspecified, without bleeding',
    nameAr: 'التهاب المعدة',
  },
  {
    code: 'K35.80',
    nameEn: 'Unspecified acute appendicitis',
    nameAr: 'التهاب الزائدة الدودية الحاد',
  },
  {
    code: 'K52.9',
    nameEn: 'Noninfective gastroenteritis and colitis, unspecified',
    nameAr: 'نزلات معوية غير معدية',
  },
  {
    code: 'K58.0',
    nameEn: 'Irritable bowel syndrome with diarrhea',
    nameAr: 'قولون عصبي (إسهال)',
  },
  {
    code: 'K58.9',
    nameEn: 'Irritable bowel syndrome without diarrhea',
    nameAr: 'قولون عصبي (إمساك/مختلط)',
  },
  { code: 'K59.00', nameEn: 'Constipation, unspecified', nameAr: 'إمساك' },
  { code: 'K64.9', nameEn: 'Unspecified hemorrhoids', nameAr: 'بواسير' },
  {
    code: 'K80.00',
    nameEn: 'Calculus of gallbladder with acute cholecystitis',
    nameAr: 'حصى المرارة مع التهاب حاد',
  },
  {
    code: 'K81.0',
    nameEn: 'Acute cholecystitis',
    nameAr: 'التهاب المرارة الحاد',
  },
  { code: 'K92.0', nameEn: 'Hematemesis', nameAr: 'قيء دموي' },
  { code: 'K92.1', nameEn: 'Melena', nameAr: 'براز مدمم (Melena)' },
  {
    code: 'A09',
    nameEn: 'Infectious gastroenteritis and colitis',
    nameAr: 'نزلات معوية معدية',
  },

  // --- الجهاز العضلي الهيكلي (M00-M99) ---
  {
    code: 'M17.9',
    nameEn: 'Osteoarthritis of knee, unspecified',
    nameAr: 'خشونة الركبة',
  },
  {
    code: 'M19.90',
    nameEn: 'Unspecified osteoarthritis, unspecified site',
    nameAr: 'خشونة المفاصل',
  },
  {
    code: 'M25.50',
    nameEn: 'Pain in unspecified joint',
    nameAr: 'ألم في المفاصل',
  },
  {
    code: 'M25.511',
    nameEn: 'Pain in right shoulder',
    nameAr: 'ألم الكتف الأيمن',
  },
  {
    code: 'M25.512',
    nameEn: 'Pain in left shoulder',
    nameAr: 'ألم الكتف الأيسر',
  },
  {
    code: 'M25.561',
    nameEn: 'Pain in right knee',
    nameAr: 'ألم الركبة اليمنى',
  },
  { code: 'M25.562', nameEn: 'Pain in left knee', nameAr: 'ألم الركبة اليسرى' },
  {
    code: 'M47.812',
    nameEn: 'Spondylosis without myelopathy or radiculopathy, cervical region',
    nameAr: 'خشونة الفقرات العنقية',
  },
  {
    code: 'M54.16',
    nameEn: 'Radiculopathy, lumbar region',
    nameAr: 'اعتلال الجذور العصبية القطنية (عرق النسا)',
  },
  { code: 'M54.2', nameEn: 'Cervicalgia', nameAr: 'ألم الرقبة' },
  { code: 'M54.5', nameEn: 'Low back pain', nameAr: 'ألم أسفل الظهر' },
  { code: 'M54.9', nameEn: 'Dorsalgia, unspecified', nameAr: 'ألم الظهر' },
  {
    code: 'M62.81',
    nameEn: 'Muscle weakness (generalized)',
    nameAr: 'ضعف عضلات',
  },
  { code: 'M79.1', nameEn: 'Myalgia', nameAr: 'ألم العضلات' },
  { code: 'M79.601', nameEn: 'Pain in right arm', nameAr: 'ألم الذراع الأيمن' },
  { code: 'M79.602', nameEn: 'Pain in left arm', nameAr: 'ألم الذراع الأيسر' },
  { code: 'M79.604', nameEn: 'Pain in right leg', nameAr: 'ألم الساق اليمنى' },
  { code: 'M79.605', nameEn: 'Pain in left leg', nameAr: 'ألم الساق اليسرى' },
  {
    code: 'S01.90XA',
    nameEn: 'Unspecified open wound of head',
    nameAr: 'جرح مفتوح في الرأس',
  },
  {
    code: 'S83.509A',
    nameEn: 'Sprain of unspecified cruciate ligament of unspecified knee',
    nameAr: 'تمزق الرباط الصليبي',
  },

  // --- الجهاز البولي والتناسلي (N00-N99) ---
  {
    code: 'N17.9',
    nameEn: 'Acute kidney failure, unspecified',
    nameAr: 'فشل كلوي حاد',
  },
  {
    code: 'N18.9',
    nameEn: 'Chronic kidney disease, unspecified',
    nameAr: 'فشل كلوي مزمن',
  },
  { code: 'N20.0', nameEn: 'Calculus of kidney', nameAr: 'حصى الكلى' },
  { code: 'N20.1', nameEn: 'Calculus of ureter', nameAr: 'حصى الحالب' },
  { code: 'N23', nameEn: 'Unspecified renal colic', nameAr: 'مغص كلوي' },
  {
    code: 'N30.00',
    nameEn: 'Acute cystitis without hematuria',
    nameAr: 'التهاب المثانة الحاد',
  },
  {
    code: 'N39.0',
    nameEn: 'Urinary tract infection, site not specified',
    nameAr: 'التهاب المسالك البولية',
  },
  {
    code: 'N40.1',
    nameEn: 'Benign prostatic hyperplasia with lower urinary tract symptoms',
    nameAr: 'تضخم البروستاتا الحميد',
  },
  {
    code: 'N92.0',
    nameEn: 'Excessive and frequent menstruation',
    nameAr: 'غزارة الطمث',
  },
  {
    code: 'N94.6',
    nameEn: 'Dysmenorrhea, unspecified',
    nameAr: 'عسر الطمث (آلام الدورة)',
  },

  // --- الأعراض والعلامات العامة (R00-R99) ---
  {
    code: 'R00.0',
    nameEn: 'Tachycardia, unspecified',
    nameAr: 'تسارع نبضات القلب',
  },
  { code: 'R04.0', nameEn: 'Epistaxis', nameAr: 'نزيف الأنف (رعاف)' },
  { code: 'R05', nameEn: 'Cough', nameAr: 'سعال' },
  { code: 'R06.00', nameEn: 'Dyspnea, unspecified', nameAr: 'ضيق تنفس' },
  { code: 'R07.9', nameEn: 'Chest pain, unspecified', nameAr: 'ألم في الصدر' },
  {
    code: 'R10.11',
    nameEn: 'Right upper quadrant pain',
    nameAr: 'ألم أعلى البطن الأيمن',
  },
  {
    code: 'R10.31',
    nameEn: 'Right lower quadrant pain',
    nameAr: 'ألم أسفل البطن الأيمن',
  },
  {
    code: 'R10.9',
    nameEn: 'Unspecified abdominal pain',
    nameAr: 'ألم في البطن (عام)',
  },
  { code: 'R11.0', nameEn: 'Nausea', nameAr: 'غثيان' },
  { code: 'R11.10', nameEn: 'Vomiting, unspecified', nameAr: 'قيء' },
  { code: 'R11.2', nameEn: 'Nausea with vomiting', nameAr: 'غثيان وقيء معاً' },
  {
    code: 'R21',
    nameEn: 'Rash and other nonspecific skin eruption',
    nameAr: 'طفح جلدي',
  },
  { code: 'R42', nameEn: 'Dizziness and giddiness', nameAr: 'دوخة / دوار' },
  { code: 'R50.9', nameEn: 'Fever, unspecified', nameAr: 'حمى' },
  { code: 'R51', nameEn: 'Headache', nameAr: 'صداع' },
  { code: 'R53.1', nameEn: 'Weakness', nameAr: 'وهن / ضعف' },
  { code: 'R53.83', nameEn: 'Fatigue', nameAr: 'تعب وإرهاق' },
  { code: 'R55', nameEn: 'Syncope and collapse', nameAr: 'إغماء' },
  { code: 'R60.0', nameEn: 'Localized edema', nameAr: 'وذمة موضعية (تورم)' },
  { code: 'R60.9', nameEn: 'Edema, unspecified', nameAr: 'تورم عام' },

  // --- الجلدية (L00-L99) ---
  {
    code: 'L02.91',
    nameEn: 'Cutaneous abscess, unspecified',
    nameAr: 'خراج جلدي',
  },
  { code: 'L03.90', nameEn: 'Cellulitis, unspecified', nameAr: 'التهاب خلوي' },
  { code: 'L20.9', nameEn: 'Atopic dermatitis, unspecified', nameAr: 'اكزيما' },
  { code: 'L30.9', nameEn: 'Dermatitis, unspecified', nameAr: 'التهاب جلد' },
  {
    code: 'L50.9',
    nameEn: 'Urticaria, unspecified',
    nameAr: 'أرتيكاريا (حساسية)',
  },
  { code: 'L70.0', nameEn: 'Acne vulgaris', nameAr: 'حب الشباب' },
  { code: 'B35.1', nameEn: 'Tinea unguium', nameAr: 'فطريات الأظافر' },
  { code: 'B35.3', nameEn: 'Tinea corporis', nameAr: 'تينيا (فطريات الجسم)' },

  // --- العيون والأذن (H00-H95) ---
  {
    code: 'H10.1',
    nameEn: 'Acute atopic conjunctivitis',
    nameAr: 'التهاب ملتحمة تحسسي',
  },
  {
    code: 'H10.9',
    nameEn: 'Unspecified conjunctivitis',
    nameAr: 'التهاب ملتحمة العين (رمد)',
  },
  {
    code: 'H60.90',
    nameEn: 'Unspecified otitis externa, unspecified ear',
    nameAr: 'التهاب الأذن الخارجية',
  },
  {
    code: 'H66.90',
    nameEn: 'Otitis media, unspecified',
    nameAr: 'التهاب الأذن الوسطى',
  },
  { code: 'H93.1', nameEn: 'Tinnitus', nameAr: 'طنين الأذن' },

  // --- الحمل والولادة (O00-O99) ---
  {
    code: 'O80',
    nameEn: 'Encounter for full-term uncomplicated delivery',
    nameAr: 'ولادة طبيعية',
  },
  {
    code: 'O82',
    nameEn: 'Encounter for cesarean delivery',
    nameAr: 'ولادة قيصرية',
  },
  {
    code: 'Z32.01',
    nameEn: 'Encounter for pregnancy test, result positive',
    nameAr: 'اختبار حمل إيجابي',
  },
  {
    code: 'O21.0',
    nameEn: 'Mild hyperemesis gravidarum',
    nameAr: 'قيء حملي بسيط',
  },

  // --- الطب النفسي (F00-F99) ---
  {
    code: 'F32.9',
    nameEn: 'Major depressive disorder, single episode, unspecified',
    nameAr: 'اكتئاب',
  },
  { code: 'F41.1', nameEn: 'Generalized anxiety disorder', nameAr: 'قلق عام' },
  {
    code: 'F41.9',
    nameEn: 'Anxiety disorder, unspecified',
    nameAr: 'قلق وتوتر',
  },
  { code: 'G47.00', nameEn: 'Insomnia, unspecified', nameAr: 'أرق' },

  // --- حالات أخرى ---
  { code: 'T14.90', nameEn: 'Injury, unspecified', nameAr: 'إصابة غير محددة' },
  {
    code: 'Z00.00',
    nameEn: 'Encounter for general adult medical examination',
    nameAr: 'فحص طبي عام',
  },
];

export function getDiagnoses() {
  // ✅ [FIX] استخدام المتغير الصحيح diagnosesData
  const extendedDiagnoses = [...diagnosesData];
  let counter = 1;

  // توليد بيانات إضافية (Mock) للوصول للعدد المطلوب
  while (extendedDiagnoses.length < 300) {
    extendedDiagnoses.push({
      code: `X${counter.toString().padStart(3, '0')}`,
      nameEn: `Specific Medical Condition Type ${counter}`,
      nameAr: `حالة طبية محددة نوع ${counter}`,
    });
    counter++;
  }

  return extendedDiagnoses;
}
