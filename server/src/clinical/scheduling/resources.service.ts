import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  constructor(private prisma: PrismaService) {}

  async createResource(data: any) {
    return this.prisma.resource.create({ data });
  }

  async getAllResources(hospitalId: number) {
    return this.prisma.resource.findMany({
      where: { hospitalId },
      include: { department: true },
    });
  }

  async getResourceById(id: number) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: { department: true, bookings: true },
    });
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    return resource;
  }

  async updateResource(id: number, data: any) {
    return this.prisma.resource.update({
      where: { id },
      data,
    });
  }

  async deleteResource(id: number) {
    return this.prisma.resource.delete({
      where: { id },
    });
  }
}
