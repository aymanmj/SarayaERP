import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseService {
  constructor(private prisma: PrismaService) {}

  async createWarehouse(
    hospitalId: number,
    data: { name: string; code?: string; isActive?: boolean },
  ) {
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const code =
      typeof data?.code === 'string' && data.code.trim()
        ? data.code.trim()
        : undefined;
    if (!name || name.length > 200) {
      throw new BadRequestException('اسم المستودع مطلوب وبطول صالح');
    }

    const existing = await this.prisma.warehouse.findUnique({
      where: { hospitalId_name: { hospitalId, name } },
    });
    if (existing) throw new ConflictException('مستودع بهذا الاسم موجود مسبقاً');

    return this.prisma.warehouse.create({
      data: {
        hospitalId,
        name,
        code,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateWarehouse(
    hospitalId: number,
    warehouseId: number,
    data: { name?: string; code?: string; isActive?: boolean },
  ) {
    const existing = await this.getWarehouse(hospitalId, warehouseId);
    const nextName =
      data?.name !== undefined ? String(data.name).trim() : existing.name;
    if (!nextName || nextName.length > 200) {
      throw new BadRequestException('اسم المستودع مطلوب وبطول صالح');
    }

    if (nextName !== existing.name) {
      const dup = await this.prisma.warehouse.findUnique({
        where: { hospitalId_name: { hospitalId, name: nextName } },
      });
      if (dup && dup.id !== warehouseId) {
        throw new ConflictException('مستودع بهذا الاسم موجود مسبقاً');
      }
    }

    if (existing.isActive && data?.isActive === false) {
      const [
        positiveStocks,
        activeCounts,
        inTransitIssues,
        openRequests,
        consumptionPolicies,
        pharmacyPolicies,
        surgeryPolicies,
      ] = await Promise.all([
        this.prisma.productStock.count({
          where: { hospitalId, warehouseId, quantity: { gt: 0 } },
        }),
        this.prisma.inventoryCount.count({
          where: {
            hospitalId,
            warehouseId,
            status: { in: ['DRAFT', 'IN_PROGRESS', 'REVIEW'] },
          },
        }),
        this.prisma.stockIssue.count({
          where: {
            hospitalId,
            status: 'ISSUED',
            OR: [
              { issuedFromId: warehouseId },
              { materialRequest: { requestingWarehouseId: warehouseId } },
            ],
          },
        }),
        this.prisma.materialRequest.count({
          where: {
            hospitalId,
            status: {
              in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED'],
            },
            OR: [
              { requestingWarehouseId: warehouseId },
              { fulfillingWarehouseId: warehouseId },
            ],
          },
        }),
        this.prisma.consumptionWarehousePolicy.count({
          where: { hospitalId, warehouseId },
        }),
        this.prisma.pharmacyWarehousePolicy.count({
          where: { hospitalId, warehouseId },
        }),
        this.prisma.surgeryWarehousePolicy.count({
          where: { hospitalId, warehouseId },
        }),
      ]);

      if (
        positiveStocks +
          activeCounts +
          inTransitIssues +
          openRequests +
          consumptionPolicies +
          pharmacyPolicies +
          surgeryPolicies >
        0
      ) {
        throw new ConflictException(
          'لا يمكن تعطيل المستودع لوجود أرصدة مخزنية أو عمليات جرد أو تحويلات نشطة أو سياسات صرف مرتبطة به',
        );
      }
    }

    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: nextName,
        ...(data.code !== undefined
          ? { code: data.code ? String(data.code).trim() : null }
          : {}),
        ...(data.isActive !== undefined
          ? { isActive: Boolean(data.isActive) }
          : {}),
      },
    });
  }

  async getWarehouse(hospitalId: number, warehouseId: number) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, hospitalId },
      include: {
        zones: {
          include: {
            bins: true,
          },
        },
      },
    });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');
    return warehouse;
  }

  async listWarehouses(hospitalId: number) {
    return this.prisma.warehouse.findMany({
      where: { hospitalId },
      include: {
        _count: {
          select: { zones: true, productStocks: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // --- ZONES ---
  async createZone(
    hospitalId: number,
    warehouseId: number,
    data: { code: string; name: string; description?: string },
  ) {
    await this.getWarehouse(hospitalId, warehouseId);
    const existing = await this.prisma.warehouseZone.findUnique({
      where: { warehouseId_code: { warehouseId, code: data.code } },
    });
    if (existing)
      throw new ConflictException(
        'منطقة بهذا الكود موجودة مسبقاً في هذا المستودع',
      );

    return this.prisma.warehouseZone.create({
      data: {
        warehouseId,
        ...data,
      },
    });
  }

  async updateZone(
    hospitalId: number,
    zoneId: number,
    data: {
      name?: string;
      code?: string;
      description?: string;
      isActive?: boolean;
    },
  ) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: zoneId, warehouse: { hospitalId } },
    });
    if (!zone) throw new NotFoundException('المنطقة غير موجودة');

    return this.prisma.warehouseZone.update({
      where: { id: zoneId },
      data,
    });
  }

  async deleteZone(hospitalId: number, zoneId: number) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: zoneId, warehouse: { hospitalId } },
      include: { bins: true },
    });
    if (!zone) throw new NotFoundException('المنطقة غير موجودة');
    if (zone.bins.length > 0)
      throw new ConflictException(
        'لا يمكن حذف المنطقة لأنها تحتوي على رفوف/أماكن تخزين',
      );

    return this.prisma.warehouseZone.delete({ where: { id: zoneId } });
  }

  // --- BINS ---
  async createBin(
    hospitalId: number,
    zoneId: number,
    data: { code: string; name: string; description?: string },
  ) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: zoneId, warehouse: { hospitalId } },
    });
    if (!zone) throw new NotFoundException('المنطقة غير موجودة');

    const existing = await this.prisma.warehouseBin.findUnique({
      where: { zoneId_code: { zoneId, code: data.code } },
    });
    if (existing)
      throw new ConflictException('رف بهذا الكود موجود مسبقاً في هذه المنطقة');

    return this.prisma.warehouseBin.create({
      data: {
        zoneId,
        ...data,
      },
    });
  }

  async updateBin(
    hospitalId: number,
    binId: number,
    data: {
      name?: string;
      code?: string;
      description?: string;
      isActive?: boolean;
    },
  ) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id: binId, zone: { warehouse: { hospitalId } } },
    });
    if (!bin) throw new NotFoundException('الرف غير موجود');

    return this.prisma.warehouseBin.update({
      where: { id: binId },
      data,
    });
  }

  async deleteBin(hospitalId: number, binId: number) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id: binId, zone: { warehouse: { hospitalId } } },
      include: { _count: { select: { productStocks: true } } },
    });
    if (!bin) throw new NotFoundException('الرف غير موجود');
    if (bin._count.productStocks > 0)
      throw new ConflictException('لا يمكن حذف الرف لأنه يحتوي على مخزون');

    return this.prisma.warehouseBin.delete({ where: { id: binId } });
  }
}
