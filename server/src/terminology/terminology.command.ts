import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { TerminologySystem } from '@prisma/client';

@Injectable()
export class TerminologyCommand {
  private readonly logger = new Logger(TerminologyCommand.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import bulk terminology data safely in batches
   * File expected to be CSV without headers: SYSTEM, CODE, DISPLAY_EN, DISPLAY_AR(optional)
   * Example: ICD10,A00,"Cholera","كوليرا"
   */
  async importBulkData(filePath: string, batchSize = 5000) {
    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      return;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let batch: Array<{
      system: TerminologySystem;
      code: string;
      display: string;
      displayAr: string | null;
      isActive: boolean;
      version: string;
    }> = [];
    let count = 0;

    for await (const line of rl) {
      if (!line.trim() || line.startsWith('SYSTEM')) continue; // Skip empty/header

      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        let systemTypeStr = parts[0].toUpperCase();
        if (systemTypeStr === 'SNOMED') systemTypeStr = 'SNOMED_CT';
        if (!Object.values(TerminologySystem).includes(systemTypeStr as any)) continue;

        batch.push({
          system: systemTypeStr as TerminologySystem,
          code: parts[1],
          display: parts[2],
          displayAr: parts[3] || null,
          isActive: true,
          version: 'bulk-import',
        });

        count++;

        if (batch.length >= batchSize) {
          await this.flushBatch(batch);
          batch = []; // clear
          this.logger.log(`Inserted ${count} concepts so far...`);
        }
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      await this.flushBatch(batch);
      this.logger.log(`Finished processing. Total: ${count} concepts.`);
    }
  }

  private async flushBatch(batch: any[]) {
    // using createMany to insert fast. 
    // skipDuplicates handles already existing codes
    await this.prisma.terminologyConcept.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }
}
