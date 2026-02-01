import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitsService {
  constructor(private prisma: PrismaService) {}

  async createVisit(data: {
    encounterId: number;
    doctorId: number;
    notes?: string;
    diagnosisText?: string;
  }) {
    // تأكد أن الـ Encounter موجود ومفتوح
    const enc = await this.prisma.encounter.findUnique({
      where: { id: data.encounterId },
    });

    if (!enc) {
      throw new NotFoundException('Encounter غير موجود');
    }

    if (enc.status !== 'OPEN') {
      throw new ForbiddenException('لا يمكن إضافة زيارة لـ Encounter مغلق');
    }

    // نقدر لاحقًا نضيف تحقق أن الطبيب من نفس المستشفى إلخ

    return this.prisma.visit.create({
      data: {
        encounterId: data.encounterId,
        doctorId: data.doctorId,
        notes: data.notes ?? null,
        diagnosisText: data.diagnosisText ?? null,
      },
    });
  }

  async listForEncounter(encounterId: number) {
    return this.prisma.visit.findMany({
      where: { encounterId },
      orderBy: { visitDate: 'asc' },
    });
  }
}
