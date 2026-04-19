import { PrismaClient, TerminologySystem } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillDiagnosisLinks() {
  const diagnosisCodes = await prisma.diagnosisCode.findMany({
    where: {
      terminologyConceptId: null,
      icd10Code: { not: null },
    },
    select: { id: true, icd10Code: true },
  });

  let linked = 0;
  for (const diagnosis of diagnosisCodes) {
    const concept = await prisma.terminologyConcept.findUnique({
      where: {
        system_code: {
          system: TerminologySystem.ICD10,
          code: diagnosis.icd10Code!,
        },
      },
      select: { id: true },
    });
    if (!concept) continue;

    await prisma.diagnosisCode.update({
      where: { id: diagnosis.id },
      data: { terminologyConceptId: concept.id },
    });
    linked++;
  }

  return linked;
}

async function backfillProductLinks() {
  const products = await prisma.product.findMany({
    where: { terminologyConceptId: null },
    select: { id: true, rxNormCode: true, genericName: true },
  });

  let linked = 0;
  for (const product of products) {
    const concept = product.rxNormCode
      ? await prisma.terminologyConcept.findFirst({
          where: {
            isActive: true,
            OR: [
              { system: TerminologySystem.RXNORM, code: product.rxNormCode },
              {
                system: TerminologySystem.ATC,
                display: {
                  equals: product.genericName ?? '',
                  mode: 'insensitive',
                },
              },
            ],
          },
          select: { id: true },
        })
      : await prisma.terminologyConcept.findFirst({
          where: {
            isActive: true,
            system: TerminologySystem.ATC,
            display: {
              equals: product.genericName ?? '',
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });

    if (!concept) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { terminologyConceptId: concept.id },
    });
    linked++;
  }

  return linked;
}

async function main() {
  console.log('🔄 Backfilling terminology references...');
  const diagnosisLinked = await backfillDiagnosisLinks();
  const productsLinked = await backfillProductLinks();
  console.log(`✅ Diagnosis linked: ${diagnosisLinked}`);
  console.log(`✅ Products linked: ${productsLinked}`);
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
