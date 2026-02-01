// src/accounting/cost-centers.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CostCentersService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number) {
    return this.prisma.costCenter.findMany({
      where: { hospitalId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async create(
    hospitalId: number,
    data: { name: string; code: string; type: string; description?: string },
  ) {
    // التحقق من الكود
    const exists = await this.prisma.costCenter.findFirst({
      where: { hospitalId, code: data.code },
    });
    if (exists) throw new BadRequestException('كود مركز التكلفة موجود مسبقاً.');

    return this.prisma.costCenter.create({
      data: {
        hospitalId,
        ...data,
      },
    });
  }

  async update(hospitalId: number, id: number, data: any) {
    return this.prisma.costCenter.update({
      where: { id },
      data,
    });
  }
}
