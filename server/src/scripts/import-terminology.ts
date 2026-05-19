import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function importTerminology() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Terminology Import Script                              ║');
  console.log('║   Imports concepts into TerminologyConcept from a CSV    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('❌ Error: Please provide the path to the CSV file.');
    console.log(
      'Usage: npx ts-node src/scripts/import-terminology.ts <path-to-csv>',
    );
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  console.log(`📊 Reading terminology data from: ${absolutePath}`);

  const fileStream = fs.createReadStream(absolutePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let importedCount = 0;
  let skippedCount = 0;
  let headers: string[] = [];

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      // Parse headers
      headers = line.split(',').map((h) => h.trim().toLowerCase());
      continue;
    }

    // Basic CSV parsing (not handling quoted commas for simplicity in this basic importer)
    const values = line.split(',').map((v) => v.trim());
    if (values.length < 3) continue; // Minimum: system, code, display

    let systemStr = '';
    let code = '';
    let display = '';
    let displayAr = '';
    let parentCode = '';
    let version = '';

    // Map according to headers
    headers.forEach((header, index) => {
      const val = values[index] || '';
      if (header === 'system') systemStr = val;
      if (header === 'code') code = val;
      if (header === 'display') display = val;
      if (header === 'displayar') displayAr = val;
      if (header === 'parentcode') parentCode = val;
      if (header === 'version') version = val;
    });

    // Fallback if headers are generic
    if (!systemStr && values[0]) systemStr = values[0];
    if (!code && values[1]) code = values[1];
    if (!display && values[2]) display = values[2];

    if (!systemStr || !code || !display) {
      skippedCount++;
      continue;
    }

    // Map System String to Enum
    let systemEnum: any;
    switch (systemStr.toUpperCase()) {
      case 'ICD10':
      case 'ICD-10':
        systemEnum = 'ICD10';
        break;
      case 'SNOMED_CT':
      case 'SNOMED':
        systemEnum = 'SNOMED_CT';
        break;
      case 'LOINC':
        systemEnum = 'LOINC';
        break;
      case 'ATC':
        systemEnum = 'ATC';
        break;
      case 'RXNORM':
        systemEnum = 'RXNORM';
        break;
      default:
        systemEnum = 'LOCAL';
        break;
    }

    try {
      await prisma.terminologyConcept.upsert({
        where: {
          system_code: {
            system: systemEnum,
            code: code,
          },
        },
        update: {
          display,
          displayAr: displayAr || null,
          parentCode: parentCode || null,
          version: version || null,
        },
        create: {
          system: systemEnum,
          code,
          display,
          displayAr: displayAr || null,
          parentCode: parentCode || null,
          version: version || null,
        },
      });
      importedCount++;
      if (importedCount % 1000 === 0) {
        console.log(`✅ Imported ${importedCount} concepts...`);
      }
    } catch (err) {
      console.error(
        `❌ Failed to import code ${code}: ${(err as Error).message}`,
      );
      skippedCount++;
    }
  }

  console.log('\n✅ Import Completed.');
  console.log(`📊 Total Imported: ${importedCount}`);
  console.log(`⏭️  Skipped/Errors: ${skippedCount}`);
}

importTerminology()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
