// server/src/specialties/specialties.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpecialtiesService {
  constructor(private prisma: PrismaService) {}

  // التخصصات عادة لا ترتبط بمستشفى محدد (Global) في بعض الأنظمة،
  // لكن هنا سنجعلها عامة أو مرتبطة بالمستشفى حسب الـ Schema.
  // في الـ Schema الحالية Specialty لا تملك hospitalId، فهي Global.
  // سنقوم بتعديل بسيط: سنعرض كل التخصصات المتاحة.

  async findAll() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { doctors: true } },
      },
    });
  }

  async create(data: { name: string; code?: string }) {
    return this.prisma.specialty.create({
      data: {
        name: data.name,
        code: data.code || null,
        isActive: true,
      },
    });
  }

  async update(
    id: number,
    data: { name?: string; code?: string; isActive?: boolean },
  ) {
    return this.prisma.specialty.update({
      where: { id },
      data: {
        ...data,
        code: data.code || null,
      },
    });
  }
}
