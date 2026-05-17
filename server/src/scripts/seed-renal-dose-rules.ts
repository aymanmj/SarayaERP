// server/src/scripts/seed-renal-dose-rules.ts
// =====================================================================
// Seed: قواعد تعديل الجرعات الكلوية — وفق KDIGO 2023 / FDA Labels
// يُشغَّل مرة واحدة بعد migration
// =====================================================================

import { PrismaClient, RenalRiskClass } from '@prisma/client';

const prisma = new PrismaClient();

const renalRules: Array<{
  atcPrefix?: string;
  drugGeneric?: string;
  renalClass: RenalRiskClass;
  minSafeEgfr: number;
  action: string;
  actionAr: string;
  evidenceSource: string;
  notes?: string;
}> = [
  // ── Antibiotics (ATC: J01) ──
  { atcPrefix: 'J01', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 45, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة — تعديل وفق eGFR', evidenceSource: 'KDIGO 2023, FDA Labeling' },

  // ── Aminoglycosides (nephrotoxic) ──
  { drugGeneric: 'vancomycin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 50, action: 'TDM_GUIDED', actionAr: 'جرعة مبنية على TDM — مراقبة مستمرة لمستوى الدم', evidenceSource: 'ASHP/IDSA Vancomycin Guidelines 2020', notes: 'AUC-based dosing preferred over trough-only' },
  { drugGeneric: 'gentamicin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 60, action: 'INTERVAL_EXTENSION', actionAr: 'تمديد الفترة بين الجرعات — q36h أو q48h', evidenceSource: 'FDA Labeling, Sanford Guide 2024' },
  { drugGeneric: 'tobramycin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 60, action: 'INTERVAL_EXTENSION', actionAr: 'تمديد الفترة بين الجرعات', evidenceSource: 'FDA Labeling 2024' },
  { drugGeneric: 'amikacin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 60, action: 'INTERVAL_EXTENSION', actionAr: 'تمديد الفترة بين الجرعات', evidenceSource: 'FDA Labeling 2024' },
  { drugGeneric: 'colistin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 50, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة اليومية', evidenceSource: 'EUCAST / Lexicomp' },

  // ── NSAIDs (ATC: M01A) ──
  { atcPrefix: 'M01', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 30, action: 'AVOID_IF_POSSIBLE', actionAr: 'تجنب إن أمكن — استخدم paracetamol بديلاً', evidenceSource: 'KDIGO 2023, UpToDate' },
  { drugGeneric: 'ibuprofen', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 30, action: 'AVOID', actionAr: 'ممنوع — خطر تدهور الوظيفة الكلوية الحاد', evidenceSource: 'KDIGO AKI Guidelines 2012' },
  { drugGeneric: 'naproxen', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 30, action: 'AVOID', actionAr: 'ممنوع مع انخفاض الوظيفة الكلوية', evidenceSource: 'FDA Labeling' },
  { drugGeneric: 'diclofenac', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 30, action: 'AVOID', actionAr: 'ممنوع مع انخفاض الوظيفة الكلوية', evidenceSource: 'FDA Labeling' },

  // ── Antidiabetics ──
  { drugGeneric: 'metformin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 30, action: 'AVOID_BELOW_30', actionAr: 'ممنوع إذا كان eGFR < 30 — خطر حماض اللاكتيك', evidenceSource: 'ADA 2024, FDA Labeling', notes: 'Use with caution 30-45, reduce dose' },
  { drugGeneric: 'glibenclamide', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 30, action: 'AVOID', actionAr: 'ممنوع — خطر نقص سكر الدم الشديد', evidenceSource: 'FDA Labeling' },
  { drugGeneric: 'sitagliptin', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 30, action: 'REDUCE_DOSE_50', actionAr: 'تقليل الجرعة 50% إذا eGFR 30-45', evidenceSource: 'FDA Labeling' },

  // ── Cardiac / Antihypertensive ──
  { drugGeneric: 'digoxin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 50, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة — مراقبة مستوى الدم', evidenceSource: 'Lexicomp, Micromedex' },
  { drugGeneric: 'atenolol', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 35, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة وفق eGFR', evidenceSource: 'BNF 2024' },
  { drugGeneric: 'lisinopril', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 30, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة — مراقبة البوتاسيوم والكرياتينين', evidenceSource: 'JNC 8, FDA Labeling' },
  { drugGeneric: 'ramipril', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 30, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة — مراقبة الكرياتينين', evidenceSource: 'BNF 2024' },

  // ── Antivirals ──
  { drugGeneric: 'acyclovir', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 50, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة وتمديد الفترة', evidenceSource: 'FDA Labeling', notes: 'Adequate hydration essential' },
  { drugGeneric: 'valacyclovir', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 50, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة وفق eGFR', evidenceSource: 'FDA Labeling' },

  // ── Antifungals (ATC: J02) ──
  { atcPrefix: 'J02', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 40, action: 'MONITOR', actionAr: 'مراقبة وظائف الكلى بانتظام', evidenceSource: 'ESCMID Guidelines' },
  { drugGeneric: 'amphotericin b', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 40, action: 'PREFER_LIPOSOMAL', actionAr: 'استخدم الصيغة الدهنية (liposomal) — أقل سمية كلوية', evidenceSource: 'IDSA Guidelines 2016' },

  // ── Lithium ──
  { drugGeneric: 'lithium', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 45, action: 'REDUCE_DOSE_MONITOR', actionAr: 'تقليل الجرعة ومراقبة مستوى الدم كل أسبوع', evidenceSource: 'NICE 2014, APA Guidelines' },

  // ── Antineoplastics ──
  { drugGeneric: 'cisplatin', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 60, action: 'AVOID_OR_REDUCE', actionAr: 'تجنب أو تقليل جرعة — سمية كلوية عالية', evidenceSource: 'FDA Labeling, NCCN 2024' },
  { drugGeneric: 'methotrexate', renalClass: RenalRiskClass.HIGH, minSafeEgfr: 60, action: 'REDUCE_DOSE', actionAr: 'تقليل الجرعة — خطر تراكم وسمية', evidenceSource: 'FDA Labeling, ACR Guidelines' },
  { drugGeneric: 'carboplatin', renalClass: RenalRiskClass.MODERATE, minSafeEgfr: 50, action: 'AUC_BASED_DOSING', actionAr: 'حساب الجرعة بناءً على AUC ووظيفة الكلى', evidenceSource: 'Calvert Formula, NCCN 2024' },
];

async function main() {
  console.log('🌱 Seeding Renal Dose Requirements...');

  let created = 0;
  let skipped = 0;

  for (const rule of renalRules) {
    const existing = await prisma.renalDoseRequirement.findFirst({
      where: {
        OR: [
          rule.atcPrefix ? { atcPrefix: rule.atcPrefix } : undefined,
          rule.drugGeneric ? { drugGeneric: { equals: rule.drugGeneric, mode: 'insensitive' } } : undefined,
        ].filter(Boolean) as object[],
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.renalDoseRequirement.create({ data: rule });
    created++;
  }

  console.log(`✅ Renal Dose Rules seeded: ${created} created, ${skipped} already exist`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
