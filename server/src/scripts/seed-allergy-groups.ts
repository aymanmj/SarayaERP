import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Allergy Cross-Reactivity Groups
 * Based on WHO/FDA clinical pharmacology references
 *
 * When a patient has an allergy to one drug in a group,
 * the CDSS will alert for ALL drugs in that group.
 */
const ALLERGY_GROUPS = [
  {
    name: 'NSAIDs',
    nameAr: 'مضادات الالتهاب غير الستيرويدية',
    description:
      'Non-Steroidal Anti-Inflammatory Drugs — cross-reactivity risk ~20-30%',
    members: [
      'aspirin',
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'meloxicam',
      'celecoxib',
      'indomethacin',
      'piroxicam',
      'ketorolac',
      'mefenamic acid',
    ],
  },
  {
    name: 'Penicillins',
    nameAr: 'البنسلينات',
    description:
      'Beta-lactam antibiotics — penicillin class. ~10% cross-reactivity with Cephalosporins.',
    members: [
      'amoxicillin',
      'ampicillin',
      'penicillin',
      'piperacillin',
      'flucloxacillin',
      'cloxacillin',
      'nafcillin',
      'oxacillin',
      'amoxicillin/clavulanate',
      'ampicillin/sulbactam',
      'piperacillin/tazobactam',
    ],
  },
  {
    name: 'Cephalosporins',
    nameAr: 'السيفالوسبورينات',
    description:
      'Beta-lactam antibiotics — cephalosporin class. ~2-5% cross-reactivity with Penicillins.',
    members: [
      'ceftriaxone',
      'cefuroxime',
      'cephalexin',
      'cefazolin',
      'cefotaxime',
      'ceftazidime',
      'cefepime',
      'cefixime',
      'cefaclor',
    ],
  },
  {
    name: 'Sulfonamides',
    nameAr: 'السلفوناميدات',
    description: 'Sulfonamide antibiotics and related drugs',
    members: [
      'sulfamethoxazole',
      'sulfasalazine',
      'sulfadiazine',
      'trimethoprim/sulfamethoxazole',
      'dapsone',
    ],
  },
  {
    name: 'ACE Inhibitors',
    nameAr: 'مثبطات الإنزيم المحول للأنجيوتنسين',
    description:
      'Angiotensin-Converting Enzyme Inhibitors — angioedema risk is class-wide',
    members: [
      'captopril',
      'enalapril',
      'lisinopril',
      'ramipril',
      'perindopril',
      'quinapril',
      'fosinopril',
      'benazepril',
    ],
  },
  {
    name: 'Statins',
    nameAr: 'الستاتينات',
    description:
      'HMG-CoA reductase inhibitors — myopathy/rhabdomyolysis risk is class-wide',
    members: [
      'atorvastatin',
      'rosuvastatin',
      'simvastatin',
      'pravastatin',
      'lovastatin',
      'fluvastatin',
      'pitavastatin',
    ],
  },
  {
    name: 'Opioids',
    nameAr: 'المواد الأفيونية',
    description:
      'Opioid analgesics — cross-reactivity variable but clinically significant',
    members: [
      'morphine',
      'codeine',
      'tramadol',
      'fentanyl',
      'oxycodone',
      'hydromorphone',
      'methadone',
      'pethidine',
      'meperidine',
    ],
  },
  {
    name: 'Fluoroquinolones',
    nameAr: 'الفلوروكينولونات',
    description:
      'Fluoroquinolone antibiotics — class-wide tendon and CNS adverse effects',
    members: [
      'ciprofloxacin',
      'levofloxacin',
      'moxifloxacin',
      'norfloxacin',
      'ofloxacin',
      'gatifloxacin',
    ],
  },
  {
    name: 'Local Anesthetics (Amide)',
    nameAr: 'المخدرات الموضعية (أميد)',
    description:
      'Amide-type local anesthetics — cross-reactivity within amide class',
    members: [
      'lidocaine',
      'bupivacaine',
      'ropivacaine',
      'mepivacaine',
      'prilocaine',
      'articaine',
    ],
  },
];

async function seedAllergyGroups() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Allergy Cross-Reactivity Groups Seeding Script        ║');
  console.log('║   Phase 2: Clinical Depth — CDSS Enhancement            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let groupCount = 0;
  let memberCount = 0;

  for (const group of ALLERGY_GROUPS) {
    try {
      // Upsert the group
      const dbGroup = await prisma.allergyGroup.upsert({
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
      groupCount++;

      // Upsert each member
      for (const member of group.members) {
        await prisma.allergyGroupDrug.upsert({
          where: {
            allergyGroupId_drugGeneric: {
              allergyGroupId: dbGroup.id,
              drugGeneric: member,
            },
          },
          update: {},
          create: {
            allergyGroupId: dbGroup.id,
            drugGeneric: member,
          },
        });
        memberCount++;
      }

      console.log(
        `✅ ${group.name} (${group.nameAr}) — ${group.members.length} drugs`,
      );
    } catch (err) {
      console.error(
        `❌ Failed to seed group "${group.name}":`,
        (err as Error).message,
      );
    }
  }

  console.log(`\n✅ Seeding Completed.`);
  console.log(`📊 Groups: ${groupCount} | Members: ${memberCount}`);
}

seedAllergyGroups()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
