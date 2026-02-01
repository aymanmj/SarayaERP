// server/src/departments/departments.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number) {
    return this.prisma.department.findMany({
      where: { hospitalId, isDeleted: false },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true } }, // عدد الموظفين في القسم
      },
    });
  }

  async create(hospitalId: number, data: { name: string; type?: string }) {
    return this.prisma.department.create({
      data: {
        hospitalId,
        name: data.name,
        type: data.type,
        isActive: true,
      },
    });
  }

  async update(
    hospitalId: number,
    id: number,
    data: { name?: string; type?: string; isActive?: boolean },
  ) {
    const dept = await this.prisma.department.findFirst({
      where: { id, hospitalId },
    });
    if (!dept) throw new NotFoundException('القسم غير موجود');

    return this.prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        isActive: data.isActive,
      },
    });
  }

  async delete(hospitalId: number, id: number, userId: number) {
    // Soft delete
    return this.prisma.department.update({
      where: { id, hospitalId },
      data: { isDeleted: true, deletedById: userId, deletedAt: new Date() },
    });
  }
}
