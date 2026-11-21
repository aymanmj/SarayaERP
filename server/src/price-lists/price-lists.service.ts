import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';

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
    const service = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!service) throw new BadRequestException('الخدمة غير موجودة');

    const roundedPrice = Money.toDb(price);

    return this.prisma.priceListItem.upsert({
      where: {
        priceListId_serviceItemId: {
          priceListId,
          serviceItemId,
        },
      },
      update: { price: roundedPrice },
      create: {
        priceListId,
        serviceItemId,
        price: roundedPrice,
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
    const service = await this.prisma.serviceItem.findFirst({
      where: { id: serviceItemId, hospitalId },
      select: { defaultPrice: true },
    });

    if (!service) return 0;
    const finalPrice = Money.fromPrisma(service.defaultPrice);

    // 2. إذا كان هناك بوليصة تأمين، نبحث عن قائمة الأسعار المرتبطة بها
    if (insurancePolicyId) {
      const policy = await this.prisma.insurancePolicy.findUnique({
        where: { id: insurancePolicyId },
        select: { priceListId: true },
      });

      if (policy && policy.priceListId) {
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
          return Money.fromPrisma(customPrice.price);
        }
      }
    } else {
      // 3. إذا لم يكن هناك تأمين (نقدي)، نتحقق من قائمة الأسعار الافتراضية للمستشفى إن وجدت
      const defaultPriceList = await this.prisma.priceList.findFirst({
        where: { hospitalId, isDefault: true, isActive: true },
        select: { id: true },
      });

      if (defaultPriceList) {
        const customCashPrice = await this.prisma.priceListItem.findUnique({
          where: {
            priceListId_serviceItemId: {
              priceListId: defaultPriceList.id,
              serviceItemId,
            },
          },
          select: { price: true },
        });

        if (customCashPrice) {
          return Money.fromPrisma(customCashPrice.price);
        }
      }
    }

    return finalPrice;
  }
}
