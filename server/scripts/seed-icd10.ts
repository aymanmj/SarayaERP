
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const icd10Codes = [
  // Infectious diseases
  { code: 'A09', nameEn: 'Infectious gastroenteritis and colitis, unspecified', nameAr: 'التهاب المعدة والأمعاء المعدي' },
  { code: 'B34.2', nameEn: 'Coronavirus infection, unspecified', nameAr: 'عدوى فيروس كورونا' },
  { code: 'J00', nameEn: 'Acute nasopharyngitis [common cold]', nameAr: 'الزكام الحاد (نزلات البرد)' },
  { code: 'J01', nameEn: 'Acute sinusitis', nameAr: 'التهاب الجيوب الأنفية الحاد' },
  { code: 'J02', nameEn: 'Acute pharyngitis', nameAr: 'التهاب البلعوم الحاد' },
  { code: 'J03', nameEn: 'Acute tonsillitis', nameAr: 'التهاب اللوزتين الحاد' },
  { code: 'J18', nameEn: 'Pneumonia, unspecified organism', nameAr: 'التهاب رئوي' },
  { code: 'J45', nameEn: 'Asthma', nameAr: 'الربو' },

  // Metabolic & Endocrine
  { code: 'E10', nameEn: 'Type 1 diabetes mellitus', nameAr: 'السكري من النوع الأول' },
  { code: 'E11', nameEn: 'Type 2 diabetes mellitus', nameAr: 'السكري من النوع الثاني' },
  { code: 'E66', nameEn: 'Overweight and obesity', nameAr: 'السمنة وزيادة الوزن' },
  { code: 'E78', nameEn: 'Disorders of lipoprotein metabolism and other lipidemias', nameAr: 'اضطرابات الكوليسترول والدهون' },

  // Cardiovascular
  { code: 'I10', nameEn: 'Essential (primary) hypertension', nameAr: 'ارتفاع ضغط الدم الأساسي' },
  { code: 'I20', nameEn: 'Angina pectoris', nameAr: 'الذبحة الصدرية' },
  { code: 'I21', nameEn: 'Acute myocardial infarction', nameAr: 'احتشاء عضلة القلب الحاد (جلطة قلبية)' },
  { code: 'I50', nameEn: 'Heart failure', nameAr: 'قصور القلب' },

  // Digestive
  { code: 'K21', nameEn: 'Gastro-esophageal reflux disease', nameAr: 'الارتجاع المعدي المريئي' },
  { code: 'K29', nameEn: 'Gastritis and duodenitis', nameAr: 'التهاب المعدة والاثني عشر' },
  { code: 'K35', nameEn: 'Acute appendicitis', nameAr: 'التهاب الزائدة الدودية الحاد' },
  { code: 'K80', nameEn: 'Cholelithiasis', nameAr: 'حصوات المرارة' },

  // Musculoskeletal
  { code: 'M54.5', nameEn: 'Low back pain', nameAr: 'آلام أسفل الظهر' },
  { code: 'M17', nameEn: 'Osteoarthritis of knee', nameAr: 'خشونة الركبة' },
  { code: 'M25.5', nameEn: 'Pain in joint', nameAr: 'آلام المفاصل' },

  // Genitourinary
  { code: 'N39.0', nameEn: 'Urinary tract infection, site not specified', nameAr: 'التهاب المسالك البولية' },
  { code: 'N20', nameEn: 'Calculus of kidney and ureter', nameAr: 'حصوات الكلى والحالب' },

  // Signs & Symptoms
  { code: 'R05', nameEn: 'Cough', nameAr: 'السعال' },
  { code: 'R07.4', nameEn: 'Chest pain, unspecified', nameAr: 'آلام الصدر' },
  { code: 'R10', nameEn: 'Abdominal and pelvic pain', nameAr: 'آلام البطن والحوض' },
  { code: 'R50', nameEn: 'Fever of other and unknown origin', nameAr: 'حمى (ارتفاع درجة الحرارة)' },
  { code: 'R51', nameEn: 'Headache', nameAr: 'صداع' },
  
  // Injury
  { code: 'S01', nameEn: 'Open wound of head', nameAr: 'جرح مفتوح في الرأس' },
  { code: 'S62', nameEn: 'Fracture at wrist and hand level', nameAr: 'كسر في المعصم واليد' },
  { code: 'T14.0', nameEn: 'Superficial injury of unspecified body region', nameAr: 'إصابة سطحية' },
];

async function main() {
  console.log(`🚀 Start seeding ICD-10 codes... (${icd10Codes.length} items)`);

  for (const item of icd10Codes) {
    await prisma.diagnosisCode.upsert({
      where: { code: item.code },
      update: {
        nameEn: item.nameEn,
        nameAr: item.nameAr,
      },
      create: {
        code: item.code,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        isActive: true,
      },
    });
  }

  console.log('✅ Seeding ICD-10 codes completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
