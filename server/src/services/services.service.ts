import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceType } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number, type?: ServiceType) {
    return this.prisma.serviceItem.findMany({
      where: {
        hospitalId,
        isActive: true,
        type: type || undefined, // فلترة حسب النوع لو وجد
      },
      include: {
        category: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    hospitalId: number,
    data: {
      code: string;
      name: string;
      type: ServiceType;
      defaultPrice: number;
      categoryId?: number;
    },
  ) {
    // التحقق من تكرار الكود
    const exists = await this.prisma.serviceItem.findFirst({
      where: { hospitalId, code: data.code },
    });
    if (exists) {
      throw new BadRequestException('كود الخدمة موجود مسبقاً.');
    }

    return this.prisma.serviceItem.create({
      data: {
        hospitalId,
        code: data.code,
        name: data.name,
        type: data.type,
        defaultPrice: data.defaultPrice,
        categoryId: data.categoryId,
        isActive: true,
        isBillable: true,
      },
    });
  }

  async update(
    hospitalId: number,
    id: number,
    data: {
      name?: string;
      defaultPrice?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.serviceItem.update({
      where: { id },
      data: {
        name: data.name,
        defaultPrice: data.defaultPrice,
        isActive: data.isActive,
      },
    });
  }

  async findAllCategories(hospitalId: number) {
    return this.prisma.serviceCategory.findMany({
      where: {
        hospitalId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}
