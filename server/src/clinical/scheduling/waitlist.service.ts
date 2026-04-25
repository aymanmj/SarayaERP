import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WaitlistService {
  constructor(private prisma: PrismaService) {}

  async joinWaitlist(data: {
    hospitalId: number;
    patientId: number;
    departmentId?: number;
    doctorId?: number;
    priority?: number;
    notes?: string;
  }) {
    return this.prisma.waitlist.create({
      data: {
        ...data,
        requestedDate: new Date(),
        status: 'WAITING',
      },
    });
  }

  async getWaitlistForHospital(hospitalId: number) {
    return this.prisma.waitlist.findMany({
      where: { hospitalId, status: 'WAITING' },
      orderBy: [
        { priority: 'asc' }, // Priority 1 is highest
        { requestedDate: 'asc' }, // Then by oldest request
      ],
      include: { patient: true, department: true, doctor: true },
    });
  }

  async updateWaitlistStatus(id: number, status: string) {
    const entry = await this.prisma.waitlist.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Waitlist entry ${id} not found`);

    return this.prisma.waitlist.update({
      where: { id },
      data: { status },
    });
  }

  async removeFromWaitlist(id: number) {
    return this.updateWaitlistStatus(id, 'CANCELLED');
  }
}
