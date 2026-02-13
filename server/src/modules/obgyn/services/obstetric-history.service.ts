import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateObstetricHistoryDto } from '../dto/create-obstetric-history.dto';
import { UpdateObstetricHistoryDto } from '../dto/update-obstetric-history.dto';

@Injectable()
export class ObstetricHistoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateObstetricHistoryDto) {
    const patientId = Number(dto.patientId);

    // Check if history already exists for this patient
    const existing = await this.prisma.obstetricHistory.findUnique({
      where: { patientId },
    });

    if (existing) {
      return this.updateByPatientId(patientId, dto);
    }

    // Sanitize input
    const data = {
        patientId,
        gravida: Number(dto.gravida || 0),
        para: Number(dto.para || 0),
        abortion: Number(dto.abortion || 0),
        prevCSCount: Number(dto.prevCSCount || 0),
        lastDeliveryDate: dto.lastDeliveryDate ? new Date(dto.lastDeliveryDate).toISOString() : null, // Ensure string or Date object
        bloodGroup: dto.bloodGroup?.toString(),
        riskFactors: dto.riskFactors?.toString(),
        notes: dto.notes?.toString(),
    };

    return this.prisma.obstetricHistory.create({
      data,
    });
  }

  async findOneByPatientId(patientId: number) {
    const history = await this.prisma.obstetricHistory.findUnique({
      where: { patientId },
      include: { patient: true },
    });
    return history;
  }

  async updateByPatientId(patientId: number, dto: UpdateObstetricHistoryDto) {
    // Upsert logic: create if not exists
    // Sanitize input for update as well
    const updateData: any = { ...dto };
    if (dto.gravida !== undefined) updateData.gravida = Number(dto.gravida);
    if (dto.para !== undefined) updateData.para = Number(dto.para);
    if (dto.abortion !== undefined) updateData.abortion = Number(dto.abortion);
    if (dto.prevCSCount !== undefined) updateData.prevCSCount = Number(dto.prevCSCount);

    return this.prisma.obstetricHistory.upsert({
      where: { patientId },
      update: updateData,
      create: {
        patientId,
        gravida: Number(dto.gravida || 0),
        para: Number(dto.para || 0),
        abortion: Number(dto.abortion || 0),
        prevCSCount: Number(dto.prevCSCount || 0),
        lastDeliveryDate: dto.lastDeliveryDate,
        bloodGroup: dto.bloodGroup,
        riskFactors: dto.riskFactors,
        notes: dto.notes,
      },
    });
  }
}
