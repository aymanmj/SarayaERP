import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  // 1. إدارة القوائم
  async findAll(hospitalId: number) {
    return this.prisma.priceList.findMany({
      where: { hospitalId, isActive: true },
      include: { _count: { select: { items: true } } },
    });
  }

  async create(
    hospitalId: number,
    data: { name: string; code?: string; isDefault?: boolean },
  ) {
    if (data.isDefault) {
      // إلغاء الافتراضي عن البقية
      await this.prisma.priceList.updateMany({
        where: { hospitalId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.priceList.create({
      data: {
        hospitalId,
        ...data,
      },
    });
  }

  // 2. إدارة الأسعار داخل القائمة
  async upsertServicePrice(
    priceListId: number,
    serviceItemId: number,
    price: number,
  ) {
    // التحقق من أن serviceItem موجود
    const service = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!service) throw new BadRequestException('الخدمة غير موجودة');

    return this.prisma.priceListItem.upsert({
      where: {
        priceListId_serviceItemId: {
          priceListId,
          serviceItemId,
        },
      },
      update: { price },
      create: {
        priceListId,
        serviceItemId,
        price,
      },
    });
  }

  async getListItems(priceListId: number) {
    return this.prisma.priceListItem.findMany({
      where: { priceListId },
      include: { serviceItem: true },
      orderBy: { serviceItem: { name: 'asc' } },
    });
  }

  // ------------------------------------------------------------------
  // 🔥 المحرك الأساسي: تحديد السعر (The Pricing Engine)
  // ------------------------------------------------------------------
  async getServicePrice(
    hospitalId: number,
    serviceItemId: number,
    insurancePolicyId?: number | null,
  ): Promise<number> {
    // 1. السعر الأساسي (Fallback)
    const service = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
      select: { defaultPrice: true },
    });

    if (!service) return 0;
    let finalPrice = Number(service.defaultPrice);

    // 2. إذا كان هناك بوليصة تأمين، نبحث عن قائمة الأسعار المرتبطة بها
    if (insurancePolicyId) {
      const policy = await this.prisma.insurancePolicy.findUnique({
        where: { id: insurancePolicyId },
        select: { priceListId: true },
      });

      if (policy && policy.priceListId) {
        // البحث عن السعر في القائمة الخاصة بالبوليصة
        const customPrice = await this.prisma.priceListItem.findUnique({
          where: {
            priceListId_serviceItemId: {
              priceListId: policy.priceListId,
              serviceItemId,
            },
          },
          select: { price: true },
        });

        if (customPrice) {
          return Number(customPrice.price); // ✅ وجدنا سعراً خاصاً
        }
      }
    } else {
      // 3. إذا لم يكن هناك تأمين (كاش)، هل هناك قائمة أسعار افتراضية للكاش غير السعر الأساسي؟
      // (مثلاً قائمة أسعار مسائية أو عطلات - يمكن تطوير هذا لاحقاً)
      // حالياً سنكتفي بالسعر الافتراضي للخدمة
    }

    return finalPrice;
  }
}
