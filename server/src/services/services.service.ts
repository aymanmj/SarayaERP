import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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

  // جلب خدمة واحدة مع كل العلاقات (المواد المرتبطة + الحزمة الفرعية)
  async findOne(hospitalId: number, id: number) {
    const service = await this.prisma.serviceItem.findFirst({
      where: { id, hospitalId },
      include: {
        category: true,
        materialMappings: {
          include: {
            product: {
              select: { id: true, name: true, code: true, stockOnHand: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        bundleChildren: {
          include: {
            childService: {
              select: {
                id: true,
                name: true,
                cptCode: true,
                defaultPrice: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        bundleParents: {
          include: {
            parentService: { select: { id: true, name: true, cptCode: true } },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('الخدمة غير موجودة.');
    }
    return service;
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
      categoryId?: number | null;
      isActive?: boolean;
    },
  ) {
    return this.prisma.serviceItem.update({
      where: { id },
      data: {
        name: data.name,
        defaultPrice: data.defaultPrice,
        categoryId: data.categoryId,
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

  async createCategory(
    hospitalId: number,
    data: { name: string; description?: string },
  ) {
    return this.prisma.serviceCategory.create({
      data: {
        hospitalId,
        name: data.name,
        isActive: true,
      },
    });
  }

  // =====================================================================
  // ربط الخدمات بالمواد المخزنية (Service-to-Item Mapping)
  // =====================================================================

  async getMaterialMappings(serviceItemId: number) {
    return this.prisma.serviceItemProduct.findMany({
      where: { serviceItemId },
      include: {
        product: {
          select: { id: true, name: true, code: true, stockOnHand: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMaterialMapping(
    serviceItemId: number,
    data: { productId: number; quantity: number; isMandatory?: boolean },
  ) {
    // التحقق من عدم التكرار
    const exists = await this.prisma.serviceItemProduct.findUnique({
      where: {
        serviceItemId_productId: { serviceItemId, productId: data.productId },
      },
    });
    if (exists) {
      throw new BadRequestException('هذا المنتج مرتبط بالخدمة بالفعل.');
    }

    return this.prisma.serviceItemProduct.create({
      data: {
        serviceItemId,
        productId: data.productId,
        quantity: data.quantity,
        isMandatory: data.isMandatory ?? true,
      },
      include: {
        product: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateMaterialMapping(
    mappingId: number,
    data: { quantity?: number; isMandatory?: boolean },
  ) {
    return this.prisma.serviceItemProduct.update({
      where: { id: mappingId },
      data: {
        quantity: data.quantity,
        isMandatory: data.isMandatory,
      },
      include: {
        product: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async removeMaterialMapping(mappingId: number) {
    await this.prisma.serviceItemProduct.delete({ where: { id: mappingId } });
    return { success: true };
  }

  // =====================================================================
  // ربط الخدمات المجمعة (Charge Explosion / Service Bundling)
  // =====================================================================

  async getBundleItems(parentServiceId: number) {
    return this.prisma.serviceBundleItem.findMany({
      where: { parentServiceId },
      include: {
        childService: {
          select: { id: true, name: true, cptCode: true, defaultPrice: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addBundleItem(
    parentServiceId: number,
    data: { childServiceId: number; quantity?: number },
  ) {
    // منع ربط الخدمة بنفسها
    if (parentServiceId === data.childServiceId) {
      throw new BadRequestException('لا يمكن ربط الخدمة بنفسها.');
    }

    // التحقق من عدم التكرار
    const exists = await this.prisma.serviceBundleItem.findUnique({
      where: {
        parentServiceId_childServiceId: {
          parentServiceId,
          childServiceId: data.childServiceId,
        },
      },
    });
    if (exists) {
      throw new BadRequestException(
        'هذه الخدمة الفرعية مرتبطة بالخدمة الأم بالفعل.',
      );
    }

    // التحقق من عدم وجود حلقة (الخدمة الفرعية هي أم لهذه الخدمة)
    const reverseExists = await this.prisma.serviceBundleItem.findUnique({
      where: {
        parentServiceId_childServiceId: {
          parentServiceId: data.childServiceId,
          childServiceId: parentServiceId,
        },
      },
    });
    if (reverseExists) {
      throw new BadRequestException(
        'هذا الربط سيُنشئ حلقة دائرية. الخدمة الفرعية هي خدمة أم لهذه الخدمة.',
      );
    }

    return this.prisma.serviceBundleItem.create({
      data: {
        parentServiceId,
        childServiceId: data.childServiceId,
        quantity: data.quantity ?? 1,
      },
      include: {
        childService: {
          select: { id: true, name: true, cptCode: true, defaultPrice: true },
        },
      },
    });
  }

  async removeBundleItem(bundleItemId: number) {
    await this.prisma.serviceBundleItem.delete({ where: { id: bundleItemId } });
    return { success: true };
  }

  // =====================================================================
  // Charge Explosion: تفجير خدمة مركبة إلى بنود فوترة فرعية
  // =====================================================================

  /**
   * عند إضافة خدمة إلى الـ Encounter، نتحقق هل هي خدمة مركبة (لها bundleChildren).
   * - إذا نعم → نفجّرها ونُرجع الخدمات الفرعية بأسعارها.
   * - إذا لا → نُرجع الخدمة نفسها.
   *
   * الاستخدام: عند إنشاء EncounterCharge، استدعِ هذه الدالة أولاً.
   */
  async explodeServiceCharges(
    hospitalId: number,
    serviceItemId: number,
    policyId: number | null,
  ): Promise<
    Array<{
      serviceItemId: number;
      quantity: number;
      name: string;
      cptCode: string | null;
    }>
  > {
    const bundleItems = await this.prisma.serviceBundleItem.findMany({
      where: { parentServiceId: serviceItemId },
      include: {
        childService: {
          select: { id: true, name: true, cptCode: true, defaultPrice: true },
        },
      },
    });

    // لا توجد حزمة → أرجع الخدمة الأصلية
    if (bundleItems.length === 0) {
      const original = await this.prisma.serviceItem.findUnique({
        where: { id: serviceItemId },
        select: { id: true, name: true, cptCode: true },
      });
      if (!original) throw new NotFoundException('الخدمة غير موجودة.');
      return [
        {
          serviceItemId: original.id,
          quantity: 1,
          name: original.name,
          cptCode: original.cptCode,
        },
      ];
    }

    // تفجير الحزمة
    return bundleItems.map((bi) => ({
      serviceItemId: bi.childService.id,
      quantity: bi.quantity,
      name: bi.childService.name,
      cptCode: bi.childService.cptCode,
    }));
  }
}
