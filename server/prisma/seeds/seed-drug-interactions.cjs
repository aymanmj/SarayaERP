// seed-drug-interactions.cjs
// =============================================================
// Clinical Knowledge Base: Drug Interaction Seeding Script
// Based on WHO Essential Medicines List & FDA Drug Safety Communications
// =============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Evidence-based drug interactions from:
 * - WHO Essential Medicines List (2023)
 * - FDA Drug Safety Communications
 * - UpToDate Clinical Pharmacology Database
 * - British National Formulary (BNF)
 */
const DRUG_INTERACTIONS = [
  // ──────────────────────────────────────
  // CRITICAL — Life-Threatening Interactions
  // ──────────────────────────────────────
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'aspirin',
    severity: 'CRITICAL',
    description: 'Greatly increased risk of major bleeding (GI, intracranial). Combined anticoagulant and antiplatelet effect.',
    descriptionAr: 'خطر نزيف حاد جداً (معدي معوي، داخل الجمجمة). تأثير مزدوج مضاد للتخثر ومضاد للصفيحات.',
    recommendation: 'Avoid combination unless specifically indicated (e.g., mechanical valve + recent ACS). Monitor INR closely if unavoidable.',
    source: 'FDA Drug Safety Communication',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'methotrexate',
    drugBGeneric: 'trimethoprim',
    severity: 'CRITICAL',
    description: 'Trimethoprim inhibits renal excretion of methotrexate, leading to toxic accumulation. Risk of fatal pancytopenia.',
    descriptionAr: 'تريميثوبريم يثبط الإخراج الكلوي للميثوتريكسات مما يؤدي لتراكم سام. خطر قلة الكريات الشاملة المميتة.',
    recommendation: 'CONTRAINDICATED. Use alternative antibiotic (e.g., amoxicillin, azithromycin).',
    source: 'BNF Interactions',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'simvastatin',
    drugBGeneric: 'clarithromycin',
    severity: 'CRITICAL',
    description: 'Clarithromycin is a strong CYP3A4 inhibitor. Greatly increases simvastatin levels → rhabdomyolysis risk.',
    descriptionAr: 'كلاريثرومايسين مثبط قوي لـ CYP3A4. يزيد بشدة من مستويات سيمفاستاتين → خطر انحلال العضلات.',
    recommendation: 'CONTRAINDICATED. Suspend statin during clarithromycin course, or use azithromycin instead.',
    source: 'FDA Drug Safety Communication 2012',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'potassium chloride',
    drugBGeneric: 'spironolactone',
    severity: 'CRITICAL',
    description: 'Both increase serum potassium. Combined use causes life-threatening hyperkalemia → cardiac arrest.',
    descriptionAr: 'كلاهما يزيد البوتاسيوم في الدم. الاستخدام المشترك يسبب فرط بوتاسيوم الدم المهدد للحياة → سكتة قلبية.',
    recommendation: 'AVOID. Monitor potassium if combination is essential. Target K+ < 5.0 mEq/L.',
    source: 'WHO Essential Medicines List',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'cisapride',
    drugBGeneric: 'ketoconazole',
    severity: 'CRITICAL',
    description: 'Ketoconazole inhibits CYP3A4 metabolism of cisapride → QT prolongation → Torsades de Pointes.',
    descriptionAr: 'كيتوكونازول يثبط استقلاب سيسابريد عبر CYP3A4 → إطالة QT → تسارع بطيني.',
    recommendation: 'ABSOLUTELY CONTRAINDICATED. Fatal arrhythmia risk.',
    source: 'FDA Black Box Warning',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'lithium',
    drugBGeneric: 'ibuprofen',
    severity: 'CRITICAL',
    description: 'NSAIDs reduce renal lithium clearance, causing toxic lithium levels. Risk of seizures, renal failure, coma.',
    descriptionAr: 'مضادات الالتهاب غير الستيرويدية تقلل التخلص الكلوي من الليثيوم. خطر تسمم الليثيوم: تشنجات، فشل كلوي، غيبوبة.',
    recommendation: 'Avoid NSAIDs in lithium patients. Use acetaminophen for pain. If NSAID is essential, reduce lithium dose 25-50% and monitor levels.',
    source: 'UpToDate Clinical Pharmacology',
    evidenceLevel: 'A',
  },

  // ──────────────────────────────────────
  // HIGH — Serious Clinical Significance
  // ──────────────────────────────────────
  {
    drugAGeneric: 'metformin',
    drugBGeneric: 'contrast dye',
    severity: 'HIGH',
    description: 'Iodinated contrast media may cause acute kidney injury in metformin patients → lactic acidosis risk.',
    descriptionAr: 'وسائط التباين اليودية قد تسبب إصابة كلوية حادة في مرضى الميتفورمين → خطر حماض لبني.',
    recommendation: 'Withhold metformin 48h before and after contrast. Check renal function (eGFR) before restart.',
    source: 'ACR Manual on Contrast Media',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'ciprofloxacin',
    drugBGeneric: 'theophylline',
    severity: 'HIGH',
    description: 'Ciprofloxacin inhibits CYP1A2 metabolism of theophylline. Theophylline levels may double → seizures, arrhythmias.',
    descriptionAr: 'سيبروفلوكساسين يثبط استقلاب الثيوفيلين عبر CYP1A2. قد تتضاعف مستويات الثيوفيلين → تشنجات، اضطراب نظم.',
    recommendation: 'Reduce theophylline dose by 30-50%. Monitor levels. Consider levofloxacin as alternative.',
    source: 'BNF Interactions',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'warfarin',
    drugBGeneric: 'amiodarone',
    severity: 'HIGH',
    description: 'Amiodarone inhibits CYP2C9 metabolism of warfarin. INR may increase 50-100%, persisting weeks after discontinuation.',
    descriptionAr: 'أميودارون يثبط استقلاب الوارفارين عبر CYP2C9. قد يرتفع INR بنسبة 50-100%.',
    recommendation: 'Reduce warfarin dose by 30-50% when starting amiodarone. Monitor INR weekly × 6 weeks.',
    source: 'AHA/ACC Pharmacotherapy Guidelines',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'clopidogrel',
    drugBGeneric: 'omeprazole',
    severity: 'HIGH',
    description: 'Omeprazole inhibits CYP2C19, reducing clopidogrel activation. Decreased antiplatelet effect → stent thrombosis risk.',
    descriptionAr: 'أوميبرازول يثبط CYP2C19 مما يقلل تفعيل كلوبيدوقريل. ينخفض التأثير المضاد للصفيحات → خطر تخثر الدعامة.',
    recommendation: 'Use pantoprazole or famotidine instead. If omeprazole essential, consider switching to prasugrel/ticagrelor.',
    source: 'FDA Drug Safety Communication 2010',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'digoxin',
    drugBGeneric: 'amiodarone',
    severity: 'HIGH',
    description: 'Amiodarone increases digoxin levels by 70-100% through P-glycoprotein inhibition. Risk of digitalis toxicity.',
    descriptionAr: 'أميودارون يزيد مستويات الديجوكسين بنسبة 70-100% عبر تثبيط P-glycoprotein. خطر تسمم الديجيتاليس.',
    recommendation: 'Reduce digoxin dose by 50% when initiating amiodarone. Monitor digoxin levels.',
    source: 'UpToDate Clinical Pharmacology',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'enalapril',
    drugBGeneric: 'spironolactone',
    severity: 'HIGH',
    description: 'Dual RAAS blockade causes additive hyperkalemia risk, especially in CKD or diabetes.',
    descriptionAr: 'الحصار المزدوج لمحور RAAS يسبب خطر فرط بوتاسيوم الدم التراكمي، خصوصاً في أمراض الكلى أو السكري.',
    recommendation: 'Monitor potassium within 1 week of starting. Avoid if eGFR < 30 or K+ > 5.0.',
    source: 'NICE Guidelines CG182',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'fluoxetine',
    drugBGeneric: 'tramadol',
    severity: 'HIGH',
    description: 'Both increase serotonin levels. Combined use → Serotonin Syndrome (agitation, hyperthermia, clonus, diarrhea).',
    descriptionAr: 'كلاهما يزيد مستويات السيروتونين. الاستخدام المشترك → متلازمة السيروتونين (هياج، ارتفاع حرارة، رمع عضلي).',
    recommendation: 'Avoid combination. Use non-serotonergic analgesic (acetaminophen, morphine). If essential, start low and monitor.',
    source: 'FDA Drug Safety Communication 2016',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'insulin',
    drugBGeneric: 'propranolol',
    severity: 'HIGH',
    description: 'Beta-blockers mask hypoglycemia symptoms (tachycardia, tremor) and prolong recovery from hypoglycemic episodes.',
    descriptionAr: 'حاصرات بيتا تخفي أعراض نقص السكر (تسارع القلب، الرجفان) وتطيل فترة التعافي من نوبات نقص السكر.',
    recommendation: 'Use cardioselective beta-blocker (bisoprolol, metoprolol) instead. Educate patient on non-adrenergic hypo symptoms.',
    source: 'ADA Standards of Care 2024',
    evidenceLevel: 'B',
  },

  // ──────────────────────────────────────
  // MODERATE — Requires Monitoring
  // ──────────────────────────────────────
  {
    drugAGeneric: 'amlodipine',
    drugBGeneric: 'simvastatin',
    severity: 'MODERATE',
    description: 'Amlodipine increases simvastatin exposure via CYP3A4 inhibition. Higher risk of myopathy at simvastatin > 20mg.',
    descriptionAr: 'أملوديبين يزيد من تعرض الجسم للسيمفاستاتين عبر تثبيط CYP3A4. خطر اعتلال عضلي مع جرعة سيمفاستاتين > 20 مجم.',
    recommendation: 'Limit simvastatin to 20mg/day with amlodipine. Consider atorvastatin or rosuvastatin as alternatives.',
    source: 'FDA Drug Safety Communication 2011',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'metformin',
    drugBGeneric: 'alcohol',
    severity: 'MODERATE',
    description: 'Alcohol potentiates metformin effect on lactate metabolism. Increased lactic acidosis risk with heavy alcohol use.',
    descriptionAr: 'الكحول يعزز تأثير الميتفورمين على استقلاب اللاكتات. خطر حماض لبني متزايد مع تناول الكحول الكثيف.',
    recommendation: 'Advise moderate alcohol consumption. Discontinue metformin in binge drinking scenarios.',
    source: 'ADA Standards of Care 2024',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'levothyroxine',
    drugBGeneric: 'calcium carbonate',
    severity: 'MODERATE',
    description: 'Calcium reduces levothyroxine absorption from GI tract. May result in inadequate thyroid control.',
    descriptionAr: 'الكالسيوم يقلل امتصاص الليفوثيروكسين من الجهاز الهضمي. قد يؤدي لعدم كفاية التحكم في الغدة الدرقية.',
    recommendation: 'Separate administration by at least 4 hours. Take levothyroxine on empty stomach, calcium with meals.',
    source: 'ATA Guidelines 2014',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'ciprofloxacin',
    drugBGeneric: 'iron sulfate',
    severity: 'MODERATE',
    description: 'Iron chelates fluoroquinolones in the GI tract, dramatically reducing antibiotic absorption (up to 90%).',
    descriptionAr: 'الحديد يرتبط بالفلوروكينولونات في الجهاز الهضمي، مما يقلل امتصاص المضاد الحيوي بشكل كبير (حتى 90%).',
    recommendation: 'Separate by at least 2 hours before or 6 hours after ciprofloxacin.',
    source: 'BNF Interactions',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'metoprolol',
    drugBGeneric: 'verapamil',
    severity: 'HIGH',
    description: 'Both suppress cardiac conduction. Combined use → severe bradycardia, AV block, heart failure.',
    descriptionAr: 'كلاهما يثبط التوصيل القلبي. الاستخدام المشترك → بطء قلب شديد، إحصار أذيني بطيني، فشل قلب.',
    recommendation: 'AVOID combination. If needed, use dihydropyridine CCB (amlodipine) instead of verapamil/diltiazem.',
    source: 'ESC Guidelines on Arrhythmias',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'gentamicin',
    drugBGeneric: 'furosemide',
    severity: 'HIGH',
    description: 'Furosemide enhances ototoxicity and nephrotoxicity of aminoglycosides through additive effects on cochlear cells.',
    descriptionAr: 'فيوروسيميد يعزز السمية الأذنية والكلوية للأمينوغليكوزيدات من خلال تأثيرات تراكمية على خلايا القوقعة.',
    recommendation: 'Monitor renal function and drug levels closely. Consider alternative diuretic or antibiotic if possible.',
    source: 'WHO Essential Medicines List',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'phenytoin',
    drugBGeneric: 'valproic acid',
    severity: 'HIGH',
    description: 'Valproate displaces phenytoin from protein binding and inhibits its metabolism. Free phenytoin levels rise → toxicity.',
    descriptionAr: 'فالبروات يزيح الفينيتوين من ارتباطه بالبروتين ويثبط استقلابه. ترتفع مستويات الفينيتوين الحر → تسمم.',
    recommendation: 'Monitor free phenytoin levels (not total). Adjust phenytoin dose based on clinical response and levels.',
    source: 'AAN/AES Epilepsy Guidelines',
    evidenceLevel: 'A',
  },
  {
    drugAGeneric: 'prednisone',
    drugBGeneric: 'ibuprofen',
    severity: 'MODERATE',
    description: 'Combined corticosteroid and NSAID use significantly increases risk of GI bleeding and peptic ulceration.',
    descriptionAr: 'الاستخدام المشترك للكورتيكوستيرويدات ومضادات الالتهاب غير الستيرويدية يزيد بشكل كبير خطر النزيف المعدي وتقرح المعدة.',
    recommendation: 'Add proton pump inhibitor (PPI) for GI prophylaxis if combination is essential. Monitor for GI symptoms.',
    source: 'ACG Guidelines on Ulcer Prevention',
    evidenceLevel: 'A',
  },

  // ──────────────────────────────────────
  // LOW — Awareness Required
  // ──────────────────────────────────────
  {
    drugAGeneric: 'paracetamol',
    drugBGeneric: 'warfarin',
    severity: 'LOW',
    description: 'Regular paracetamol use (> 2g/day for > 1 week) may modestly increase INR. Occasional use is safe.',
    descriptionAr: 'الاستخدام المنتظم للباراسيتامول (> 2 جم/يوم لأكثر من أسبوع) قد يزيد INR بشكل بسيط. الاستخدام العرضي آمن.',
    recommendation: 'Monitor INR if regular paracetamol > 2g/day. No dose adjustment needed for occasional use.',
    source: 'BNF Interactions',
    evidenceLevel: 'B',
  },
  {
    drugAGeneric: 'metformin',
    drugBGeneric: 'enalapril',
    severity: 'LOW',
    description: 'ACE inhibitors may slightly enhance the hypoglycemic effect of metformin. Clinically significant only rarely.',
    descriptionAr: 'مثبطات ACE قد تعزز بشكل طفيف تأثير الميتفورمين في خفض السكر. ذات أهمية سريرية نادراً.',
    recommendation: 'Be aware of potential enhanced hypoglycemia. No dose adjustment typically needed.',
    source: 'UpToDate Clinical Pharmacology',
    evidenceLevel: 'C',
  },
];

async function seed() {
  console.log('🏥 Seeding Clinical Drug Interaction Knowledge Base...');
  console.log(`   Total interactions to seed: ${DRUG_INTERACTIONS.length}`);
  console.log('');

  let created = 0;
  let skipped = 0;

  for (const interaction of DRUG_INTERACTIONS) {
    try {
      await prisma.drugInteraction.upsert({
        where: {
          drugAGeneric_drugBGeneric: {
            drugAGeneric: interaction.drugAGeneric,
            drugBGeneric: interaction.drugBGeneric,
          },
        },
        create: interaction,
        update: {
          severity: interaction.severity,
          description: interaction.description,
          descriptionAr: interaction.descriptionAr,
          recommendation: interaction.recommendation,
          source: interaction.source,
          evidenceLevel: interaction.evidenceLevel,
        },
      });
      console.log(
        `   ✅ ${interaction.severity.padEnd(8)} ${interaction.drugAGeneric} ↔ ${interaction.drugBGeneric}`,
      );
      created++;
    } catch (err) {
      console.log(
        `   ⚠️ Skipped: ${interaction.drugAGeneric} ↔ ${interaction.drugBGeneric} — ${err.message}`,
      );
      skipped++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  ✅ Created/Updated: ${created}`);
  console.log(`  ⚠️ Skipped: ${skipped}`);
  console.log('  📊 Distribution:');
  console.log(`     CRITICAL: ${DRUG_INTERACTIONS.filter(d => d.severity === 'CRITICAL').length}`);
  console.log(`     HIGH:     ${DRUG_INTERACTIONS.filter(d => d.severity === 'HIGH').length}`);
  console.log(`     MODERATE: ${DRUG_INTERACTIONS.filter(d => d.severity === 'MODERATE').length}`);
  console.log(`     LOW:      ${DRUG_INTERACTIONS.filter(d => d.severity === 'LOW').length}`);
  console.log('═══════════════════════════════════════════');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
