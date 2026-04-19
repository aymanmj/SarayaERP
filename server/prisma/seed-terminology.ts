import { PrismaClient, TerminologySystem } from '@prisma/client';

const prisma = new PrismaClient();

const starterTerminology = [
  // ========================== ICD-10 (Diagnoses) ==========================
  { system: TerminologySystem.ICD10, code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', displayAr: 'السكري من النوع 2 (بدون مضاعفات)' },
  { system: TerminologySystem.ICD10, code: 'I10', display: 'Essential (primary) hypertension', displayAr: 'ارتفاع ضغط الدم الأساسي' },
  { system: TerminologySystem.ICD10, code: 'J00', display: 'Acute nasopharyngitis [common cold]', displayAr: 'التهاب البلعوم الأنفي الحاد (زكام)' },
  { system: TerminologySystem.ICD10, code: 'K21.9', display: 'Gastro-esophageal reflux disease without esophagitis', displayAr: 'ارتجاع المريء' },
  { system: TerminologySystem.ICD10, code: 'J45.909', display: 'Unspecified asthma, uncomplicated', displayAr: 'ربو شعبي' },
  { system: TerminologySystem.ICD10, code: 'M54.5', display: 'Low back pain', displayAr: 'ألم أسفل الظهر' },
  { system: TerminologySystem.ICD10, code: 'R51', display: 'Headache', displayAr: 'صداع' },
  { system: TerminologySystem.ICD10, code: 'K35.80', display: 'Unspecified acute appendicitis', displayAr: 'التهاب الزائدة الدودية الحاد' },
  { system: TerminologySystem.ICD10, code: 'A09', display: 'Infectious gastroenteritis and colitis', displayAr: 'نزلات معوية' },
  { system: TerminologySystem.ICD10, code: 'N39.0', display: 'Urinary tract infection, site not specified', displayAr: 'التهاب المسالك البولية' },
  { system: TerminologySystem.ICD10, code: 'H10.1', display: 'Acute atopic conjunctivitis', displayAr: 'التهاب ملتحمة تحسسي' },
  { system: TerminologySystem.ICD10, code: 'L20.9', display: 'Atopic dermatitis, unspecified', displayAr: 'اكزيما' },
  { system: TerminologySystem.ICD10, code: 'R07.9', display: 'Chest pain, unspecified', displayAr: 'ألم في الصدر' },
  { system: TerminologySystem.ICD10, code: 'E78.5', display: 'Hyperlipidemia, unspecified', displayAr: 'ارتفاع الكوليسترول / دهون الدم' },
  { system: TerminologySystem.ICD10, code: 'D64.9', display: 'Anemia, unspecified', displayAr: 'فقر دم' },
  { system: TerminologySystem.ICD10, code: 'E66.9', display: 'Obesity, unspecified', displayAr: 'سمنة مفرطة' },
  { system: TerminologySystem.ICD10, code: 'I20.9', display: 'Angina pectoris, unspecified', displayAr: 'ذبحة صدرية' },

  // ========================== SNOMED CT (Clinical Findings) ==========================
  { system: TerminologySystem.SNOMED_CT, code: '35489007', display: 'Depressive disorder', displayAr: 'اضطراب اكتئابي' },
  { system: TerminologySystem.SNOMED_CT, code: '38341003', display: 'Hypertensive emergency', displayAr: 'طوارئ ارتفاع ضغط الدم' },
  { system: TerminologySystem.SNOMED_CT, code: '22298006', display: 'Myocardial infarction', displayAr: 'احتشاء عضلة القلب (جلطة)' },
  { system: TerminologySystem.SNOMED_CT, code: '26624006', display: 'Acute exacerbation of Asthma', displayAr: 'نوبة ربو حادة' },

  // ========================== LOINC (Lab Tests) ==========================
  { system: TerminologySystem.LOINC, code: '1751-7', display: 'Albumin [Mass/volume] in Serum or Plasma', displayAr: 'الألبومين في مصل الدم' },
  { system: TerminologySystem.LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', displayAr: 'كرياتينين الدم' },
  { system: TerminologySystem.LOINC, code: '4544-3', display: 'Hematocrit [Volume Fraction] of Blood', displayAr: 'الهيماتوكريت' },
  { system: TerminologySystem.LOINC, code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', displayAr: 'هيموجلوبين' },
  { system: TerminologySystem.LOINC, code: '6690-2', display: 'Leukocytes [#/volume] in Blood', displayAr: 'كريات الدم البيضاء (WBC)' },
  { system: TerminologySystem.LOINC, code: '14925-3', display: 'Urate [Mass/volume] in Serum or Plasma', displayAr: 'حمض اليوريك' },
  { system: TerminologySystem.LOINC, code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma', displayAr: 'الكوليسترول الجيد (HDL)' },
  { system: TerminologySystem.LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', displayAr: 'السكر التراكمي (HbA1c)' },

  // ========================== ATC / RxNorm (Drugs) ==========================
  { system: TerminologySystem.ATC, code: 'N02BE01', display: 'Paracetamol', displayAr: 'باراسيتامول' },
  { system: TerminologySystem.ATC, code: 'M01AE01', display: 'Ibuprofen', displayAr: 'ايبوبروفين' },
  { system: TerminologySystem.ATC, code: 'J01CR02', display: 'Amoxicillin and beta-lactamase inhibitor', displayAr: 'أموكسيسيلين وحمض الكلافولانيك (أوجمنتين)' },
  { system: TerminologySystem.ATC, code: 'A02BC05', display: 'Esomeprazole', displayAr: 'إيسوميبرازول' },
  { system: TerminologySystem.ATC, code: 'A10BA02', display: 'Metformin', displayAr: 'ميتفورمين (منظم سكر)' },
  { system: TerminologySystem.ATC, code: 'J01FA10', display: 'Azithromycin', displayAr: 'أزيثرومايسين' },
  { system: TerminologySystem.ATC, code: 'M01AB05', display: 'Diclofenac', displayAr: 'ديكلوفيناك (فولتارين)' },
  { system: TerminologySystem.ATC, code: 'J01MA02', display: 'Ciprofloxacin', displayAr: 'سيبروفلوكساسين' },
  { system: TerminologySystem.ATC, code: 'C10AA05', display: 'Atorvastatin', displayAr: 'أتورفاستاتين (ليبيتور)' },
  { system: TerminologySystem.ATC, code: 'R03AC02', display: 'Salbutamol', displayAr: 'سالبوتامول (فينتولين)' },
  { system: TerminologySystem.ATC, code: 'B01AC06', display: 'Acetylsalicylic acid', displayAr: 'حمض أسيتيل ساليسيليك (أسبرين)' }
];

export async function seedTerminology(prismaClient: PrismaClient = prisma) {
  console.log('📚 Seeding Terminology Starter Pack...');
  console.log('Connecting to database to insert Standard Concepts...');

  let successCount = 0;
  for (const term of starterTerminology) {
    try {
      await prismaClient.terminologyConcept.upsert({
        where: {
          system_code: {
            system: term.system,
            code: term.code,
          },
        },
        update: {
          display: term.display,
          displayAr: term.displayAr,
        },
        create: {
          system: term.system,
          code: term.code,
          display: term.display,
          displayAr: term.displayAr,
          isActive: true,
          version: '2026-04',
        },
      });
      successCount++;
    } catch (err) {
      console.error(`Failed to insert ${term.system} - ${term.code}`, err);
    }
  }

  console.log(`✅ Successfully seeded ${successCount} concepts out of ${starterTerminology.length}.`);
  console.log('💡 Note: You can use the Bulk Importer CLI to load full multimillion-row datasets.');
}

if (require.main === module) {
  seedTerminology()
    .catch((e) => {
      console.error('❌ Terminology seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
