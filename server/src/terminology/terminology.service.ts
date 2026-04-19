import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TerminologySystem } from '@prisma/client';

@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * البحث عن مصطلح طبي في نظام تكويد معين (مثل ICD-10 للتشخيصات أو LOINC للمختبرات)
   */
  async searchConcepts(system: TerminologySystem, query: string, limit = 50) {
    return this.prisma.terminologyConcept.findMany({
      where: {
        system,
        isActive: true,
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { display: { contains: query, mode: 'insensitive' } },
          { displayAr: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { code: 'asc' },
    });
  }

  /**
   * استرجاع كود معين مباشرة (مثلاً للتحقق العكسي)
   */
  async getConceptByCode(system: TerminologySystem, code: string) {
    return this.prisma.terminologyConcept.findUnique({
      where: {
        system_code: { system, code },
      },
    });
  }
}
