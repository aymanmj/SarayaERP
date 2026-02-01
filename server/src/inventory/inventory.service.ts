// src/inventory/inventory.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException, // 👈
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockTransactionType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // 🔔 فحص تنبيهات المخزون (نقص الكمية + قرب انتهاء الصلاحية)
  async monitorStockLevels(hospitalId: number) {
    // 1. فحص المنتجات التي وصلت لحد الطلب
    // نجمع الكميات من كل المخازن لهذا المنتج
    const lowStockProducts = await this.prisma.product.findMany({
      where: {
        hospitalId,
        isActive: true,
        // مقارنة المخزون الكلي مع الحد الأدنى
        // ملاحظة: Prisma لا تدعم مقارنة الحقول ببعضها مباشرة في where بسهولة إلا بـ Raw Query أو تصفية JS
        // هنا سنجلب المنتجات التي لديها minStock > 0 ثم نفحصها
        minStock: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        stockOnHand: true, // الكمية الكلية (المحسوبة)
        minStock: true,
      },
    });

    const lowStockAlerts = lowStockProducts
      .filter((p) => Number(p.stockOnHand) <= Number(p.minStock))
      .map((p) => ({
        type: 'LOW_STOCK',
        productId: p.id,
        productName: p.name,
        currentStock: Number(p.stockOnHand),
        minStock: Number(p.minStock),
        message: `الرصيد الحالي (${Number(p.stockOnHand)}) أقل من أو يساوي حد الطلب (${Number(p.minStock)})`,
      }));

    // 2. فحص المواد قريبة انتهاء الصلاحية (مثلاً خلال 3 أشهر)
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const expiringBatches = await this.prisma.productStock.findMany({
      where: {
        hospitalId,
        quantity: { gt: 0 }, // فقط الكميات الموجودة
        expiryDate: {
          lte: threeMonthsFromNow,
          gte: new Date(), // لم تنتهِ بعد
        },
      },
      include: {
        product: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });

    const expiryAlerts = expiringBatches.map((b) => ({
      type: 'EXPIRY_SOON',
      productId: b.productId,
      productName: b.product.name,
      warehouseName: b.warehouse.name,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      daysRemaining: Math.ceil(
        (new Date(b.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    }));

    // 3. فحص المواد المنتهية الصلاحية (Expired)
    const expiredBatches = await this.prisma.productStock.findMany({
      where: {
        hospitalId,
        quantity: { gt: 0 },
        expiryDate: { lt: new Date() },
      },
      include: {
        product: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });

    const expiredAlerts = expiredBatches.map((b) => ({
      type: 'EXPIRED',
      productId: b.productId,
      productName: b.product.name,
      warehouseName: b.warehouse.name,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      message: 'المنتج منتهي الصلاحية!',
    }));

    return {
      lowStock: lowStockAlerts,
      expiringSoon: expiryAlerts,
      expired: expiredAlerts,
    };
  }

  async listWarehouses(hospitalId: number) {
    return this.prisma.warehouse.findMany({
      where: { hospitalId, isActive: true },
      select: { id: true, name: true, code: true },
    });
  }

  async getWarehouseStock(
    hospitalId: number,
    warehouseId: number,
    search?: string,
  ) {
    return this.prisma.productStock.findMany({
      where: {
        hospitalId,
        warehouseId,
        product: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            sellPrice: true,
            costPrice: true,
            strength: true,
            form: true,
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
  }

  // إجراء تحويل مخزني - ✅ تحديث القفل التفاؤلي
  async transferStock(params: {
    hospitalId: number;
    userId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    items: { productId: number; quantity: number }[];
    notes?: string;
  }) {
    const { hospitalId, userId, fromWarehouseId, toWarehouseId, items, notes } =
      params;

    if (fromWarehouseId === toWarehouseId) {
      throw new BadRequestException('لا يمكن التحويل لنفس المخزن.');
    }

    if (!items.length) {
      throw new BadRequestException('يجب اختيار صنف واحد على الأقل.');
    }

    return this.prisma.$transaction(async (tx) => {
      const fromWh = await tx.warehouse.findUnique({
        where: { id: fromWarehouseId },
      });
      const toWh = await tx.warehouse.findUnique({
        where: { id: toWarehouseId },
      });

      if (!fromWh || !toWh) {
        throw new NotFoundException('أحد المخازن غير موجود.');
      }

      const transferRefId = Math.floor(Date.now() / 1000);

      for (const item of items) {
        const qty = Number(item.quantity);
        if (qty <= 0) continue;

        // للتبسيط في التحويل اليدوي، نستخدم 'GENERAL' أو نبحث عن أول تشغيلة
        const batchNo = 'GENERAL';

        const sourceStock = await tx.productStock.findUnique({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: fromWarehouseId,
              productId: item.productId,
              batchNumber: batchNo,
            },
          },
          include: { product: true },
        });

        if (!sourceStock || Number(sourceStock.quantity) < qty) {
          const prodName = sourceStock?.product?.name
            ? sourceStock.product.name
            : ((await tx.product.findUnique({ where: { id: item.productId } }))
                ?.name ?? 'Unknown');

          throw new BadRequestException(
            `رصيد غير كافٍ للمنتج ${prodName} (تشغيلة: ${batchNo}) في المخزن المصدر.`,
          );
        }

        const costPrice = Number(sourceStock.product.costPrice ?? 0);

        // 🛡️ 3. خصم من المصدر مع Optimistic Lock
        const updateResult = await tx.productStock.updateMany({
          where: {
            id: sourceStock.id,
            version: sourceStock.version, // 👈 الشرط الحاسم
          },
          data: {
            quantity: { decrement: qty },
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            `فشل التحويل: تغير رصيد المنتج "${sourceStock.product.name}" أثناء العملية.`,
          );
        }

        // تسجيل حركة خروج (OUT) - Transfer Out
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: fromWarehouseId,
            productId: item.productId,
            type: StockTransactionType.OUT,
            quantity: qty,
            unitCost: costPrice,
            totalCost: costPrice * qty,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            referenceType: 'TRANSFER_OUT',
            referenceId: transferRefId,
            notes: `تحويل إلى ${toWh.name} - ${notes ?? ''}`,
            createdById: userId,
          },
        });

        // 4. إضافة للمستلم (Upsert) - هنا لا نحتاج optimistic lock لأننا نزيد
        // لكن إذا كان السجل موجود، يفضل قراءته وتحديثه بنفس الطريقة لضمان الـ version
        // للتبسيط، Upsert مقبول هنا لأن الزيادة أقل خطورة من الخصم (لن تسبب رصيد سالب)
        // ولكن الأفضل هو الاتساق.

        await tx.productStock.upsert({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: toWarehouseId,
              productId: item.productId,
              batchNumber: batchNo,
            },
          },
          update: {
            quantity: { increment: qty },
            // version: { increment: 1 } // Prisma Upsert updates atomically
          },
          create: {
            hospitalId,
            warehouseId: toWarehouseId,
            productId: item.productId,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            quantity: qty,
            version: 1,
          },
        });

        // تسجيل حركة دخول (IN) - Transfer In
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: toWarehouseId,
            productId: item.productId,
            type: StockTransactionType.IN,
            quantity: qty,
            unitCost: costPrice,
            totalCost: costPrice * qty,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            referenceType: 'TRANSFER_IN',
            referenceId: transferRefId,
            notes: `تحويل من ${fromWh.name} - ${notes ?? ''}`,
            createdById: userId,
          },
        });
      }

      return { success: true, transferRefId };
    });
  }
}

// // src/inventory/inventory.service.ts

// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { StockTransactionType } from '@prisma/client';

// @Injectable()
// export class InventoryService {
//   constructor(private prisma: PrismaService) {}

//   // عرض قائمة المخازن
//   async listWarehouses(hospitalId: number) {
//     return this.prisma.warehouse.findMany({
//       where: { hospitalId, isActive: true },
//       select: { id: true, name: true, code: true },
//     });
//   }

//   // عرض رصيد مخزن معين
//   async getWarehouseStock(
//     hospitalId: number,
//     warehouseId: number,
//     search?: string,
//   ) {
//     return this.prisma.productStock.findMany({
//       where: {
//         hospitalId,
//         warehouseId,
//         product: search
//           ? {
//               OR: [
//                 { name: { contains: search, mode: 'insensitive' } },
//                 { code: { contains: search, mode: 'insensitive' } },
//               ],
//             }
//           : undefined,
//       },
//       include: {
//         product: {
//           select: {
//             id: true,
//             name: true,
//             code: true,
//             type: true,
//             sellPrice: true,
//             costPrice: true,
//             strength: true,
//             form: true,
//           },
//         },
//       },
//       orderBy: { product: { name: 'asc' } },
//     });
//   }

//   // إجراء تحويل مخزني
//   async transferStock(params: {
//     hospitalId: number;
//     userId: number;
//     fromWarehouseId: number;
//     toWarehouseId: number;
//     items: { productId: number; quantity: number }[];
//     notes?: string;
//   }) {
//     const { hospitalId, userId, fromWarehouseId, toWarehouseId, items, notes } =
//       params;

//     if (fromWarehouseId === toWarehouseId) {
//       throw new BadRequestException('لا يمكن التحويل لنفس المخزن.');
//     }

//     if (!items.length) {
//       throw new BadRequestException('يجب اختيار صنف واحد على الأقل.');
//     }

//     return this.prisma.$transaction(async (tx) => {
//       // 1. التأكد من المخازن
//       const fromWh = await tx.warehouse.findUnique({
//         where: { id: fromWarehouseId },
//       });
//       const toWh = await tx.warehouse.findUnique({
//         where: { id: toWarehouseId },
//       });

//       if (!fromWh || !toWh) {
//         throw new NotFoundException('أحد المخازن غير موجود.');
//       }

//       // معرف مجموعة التحويل (referenceId) لربط الحركات ببعضها
//       const transferRefId = Math.floor(Date.now() / 1000);

//       for (const item of items) {
//         const qty = Number(item.quantity);
//         if (qty <= 0) continue;

//         // ✅ [FIXED] استخدام المفتاح الجديد للبحث عن الرصيد
//         // سنفترض هنا أننا ننقل من "GENERAL" ما لم يتم تحديد غير ذلك، أو نبحث عن أول تشغيلة متاحة
//         // للتبسيط في التحويل اليدوي الحالي، سنستخدم 'GENERAL'
//         const batchNo = 'GENERAL';

//         const sourceStock = await tx.productStock.findUnique({
//           where: {
//             warehouseId_productId_batchNumber: {
//               warehouseId: fromWarehouseId,
//               productId: item.productId,
//               batchNumber: batchNo,
//             },
//           },
//           include: { product: true },
//         });

//         // التحقق من الرصيد
//         if (!sourceStock || Number(sourceStock.quantity) < qty) {
//           // جلب اسم المنتج للخطأ في حال عدم وجود sourceStock
//           const prodName = sourceStock?.product?.name
//             ? sourceStock.product.name
//             : ((await tx.product.findUnique({ where: { id: item.productId } }))
//                 ?.name ?? 'Unknown');

//           throw new BadRequestException(
//             `رصيد غير كافٍ للمنتج ${prodName} (تشغيلة: ${batchNo}) في المخزن المصدر.`,
//           );
//         }

//         const costPrice = Number(sourceStock.product.costPrice ?? 0);

//         // 3. خصم من المصدر
//         await tx.productStock.update({
//           where: { id: sourceStock.id },
//           data: { quantity: { decrement: qty } },
//         });

//         // تسجيل حركة خروج (OUT) - Transfer Out
//         await tx.stockTransaction.create({
//           data: {
//             hospitalId,
//             warehouseId: fromWarehouseId,
//             productId: item.productId,
//             type: StockTransactionType.OUT,
//             quantity: qty,
//             unitCost: costPrice,
//             totalCost: costPrice * qty,

//             // ✅ إضافة بيانات التشغيلة
//             batchNumber: batchNo,
//             expiryDate: sourceStock.expiryDate,

//             referenceType: 'TRANSFER_OUT',
//             referenceId: transferRefId,
//             notes: `تحويل إلى ${toWh.name} - ${notes ?? ''}`,
//             createdById: userId,
//           },
//         });

//         // 4. إضافة للمستلم (Upsert)
//         await tx.productStock.upsert({
//           where: {
//             warehouseId_productId_batchNumber: {
//               warehouseId: toWarehouseId,
//               productId: item.productId,
//               batchNumber: batchNo,
//             },
//           },
//           update: { quantity: { increment: qty } },
//           create: {
//             hospitalId,
//             warehouseId: toWarehouseId,
//             productId: item.productId,
//             batchNumber: batchNo,
//             expiryDate: sourceStock.expiryDate, // نقل نفس تاريخ الصلاحية
//             quantity: qty,
//           },
//         });

//         // تسجيل حركة دخول (IN) - Transfer In
//         await tx.stockTransaction.create({
//           data: {
//             hospitalId,
//             warehouseId: toWarehouseId,
//             productId: item.productId,
//             type: StockTransactionType.IN,
//             quantity: qty,
//             unitCost: costPrice,
//             totalCost: costPrice * qty,

//             // ✅ إضافة بيانات التشغيلة
//             batchNumber: batchNo,
//             expiryDate: sourceStock.expiryDate,

//             referenceType: 'TRANSFER_IN',
//             referenceId: transferRefId,
//             notes: `تحويل من ${fromWh.name} - ${notes ?? ''}`,
//             createdById: userId,
//           },
//         });
//       }

//       return { success: true, transferRefId };
//     });
//   }
// }

// // // src/inventory/inventory.service.ts

// // import {
// //   BadRequestException,
// //   Injectable,
// //   NotFoundException,
// // } from '@nestjs/common';
// // import { PrismaService } from '../prisma/prisma.service';
// // import { StockTransactionType } from '@prisma/client';

// // @Injectable()
// // export class InventoryService {
// //   constructor(private prisma: PrismaService) {}

// //   // عرض قائمة المخازن
// //   async listWarehouses(hospitalId: number) {
// //     return this.prisma.warehouse.findMany({
// //       where: { hospitalId, isActive: true },
// //       select: { id: true, name: true, code: true },
// //     });
// //   }

// //   // عرض رصيد مخزن معين
// //   async getWarehouseStock(
// //     hospitalId: number,
// //     warehouseId: number,
// //     search?: string,
// //   ) {
// //     return this.prisma.productStock.findMany({
// //       where: {
// //         hospitalId,
// //         warehouseId,
// //         product: search
// //           ? {
// //               OR: [
// //                 { name: { contains: search, mode: 'insensitive' } },
// //                 { code: { contains: search, mode: 'insensitive' } },
// //               ],
// //             }
// //           : undefined,
// //       },
// //       include: {
// //         product: {
// //           select: {
// //             id: true,
// //             name: true,
// //             code: true,
// //             type: true,
// //             // ✅ [CORRECTED] تم إزالة unitPrice لأنه غير موجود
// //             sellPrice: true,
// //             costPrice: true, // يمكن إضافته إذا أردت عرضه
// //             strength: true, // مفيد للعرض
// //             form: true, // مفيد للعرض
// //           },
// //         },
// //       },
// //       orderBy: { product: { name: 'asc' } },
// //     });
// //   }

// //   // إجراء تحويل مخزني
// //   async transferStock(params: {
// //     hospitalId: number;
// //     userId: number;
// //     fromWarehouseId: number;
// //     toWarehouseId: number;
// //     items: { productId: number; quantity: number }[];
// //     notes?: string;
// //   }) {
// //     const { hospitalId, userId, fromWarehouseId, toWarehouseId, items, notes } =
// //       params;

// //     if (fromWarehouseId === toWarehouseId) {
// //       throw new BadRequestException('لا يمكن التحويل لنفس المخزن.');
// //     }

// //     if (!items.length) {
// //       throw new BadRequestException('يجب اختيار صنف واحد على الأقل.');
// //     }

// //     return this.prisma.$transaction(async (tx) => {
// //       // 1. التأكد من المخازن
// //       const fromWh = await tx.warehouse.findUnique({
// //         where: { id: fromWarehouseId },
// //       });
// //       const toWh = await tx.warehouse.findUnique({
// //         where: { id: toWarehouseId },
// //       });

// //       if (!fromWh || !toWh) {
// //         throw new NotFoundException('أحد المخازن غير موجود.');
// //       }

// //       // معرف مجموعة التحويل (referenceId) لربط الحركات ببعضها
// //       const transferRefId = Math.floor(Date.now() / 1000);

// //       for (const item of items) {
// //         const qty = Number(item.quantity);
// //         if (qty <= 0) continue;

// //         // 2. التحقق من الرصيد في المخزن المصدر
// //         const sourceStock = await tx.productStock.findUnique({
// //           where: {
// //             warehouseId_productId: {
// //               warehouseId: fromWarehouseId,
// //               productId: item.productId,
// //             },
// //           },
// //           include: { product: true },
// //         });

// //         if (!sourceStock || Number(sourceStock.quantity) < qty) {
// //           throw new BadRequestException(
// //             `رصيد غير كافٍ للمنتج ${sourceStock?.product.name ?? item.productId} في المخزن المصدر.`,
// //           );
// //         }

// //         const costPrice = Number(sourceStock.product.costPrice ?? 0);

// //         // 3. خصم من المصدر
// //         await tx.productStock.update({
// //           where: { id: sourceStock.id },
// //           data: { quantity: { decrement: qty } },
// //         });

// //         // تسجيل حركة خروج (OUT) - Transfer Out
// //         await tx.stockTransaction.create({
// //           data: {
// //             hospitalId,
// //             warehouseId: fromWarehouseId,
// //             productId: item.productId,
// //             type: StockTransactionType.OUT,
// //             quantity: qty,
// //             unitCost: costPrice,
// //             totalCost: costPrice * qty,
// //             referenceType: 'TRANSFER_OUT',
// //             referenceId: transferRefId,
// //             notes: `تحويل إلى ${toWh.name} - ${notes ?? ''}`,
// //             createdById: userId,
// //           },
// //         });

// //         // 4. إضافة للمستلم (Upsert)
// //         await tx.productStock.upsert({
// //           where: {
// //             warehouseId_productId: {
// //               warehouseId: toWarehouseId,
// //               productId: item.productId,
// //             },
// //           },
// //           update: { quantity: { increment: qty } },
// //           create: {
// //             hospitalId,
// //             warehouseId: toWarehouseId,
// //             productId: item.productId,
// //             quantity: qty,
// //           },
// //         });

// //         // تسجيل حركة دخول (IN) - Transfer In
// //         await tx.stockTransaction.create({
// //           data: {
// //             hospitalId,
// //             warehouseId: toWarehouseId,
// //             productId: item.productId,
// //             type: StockTransactionType.IN,
// //             quantity: qty,
// //             unitCost: costPrice,
// //             totalCost: costPrice * qty,
// //             referenceType: 'TRANSFER_IN',
// //             referenceId: transferRefId,
// //             notes: `تحويل من ${fromWh.name} - ${notes ?? ''}`,
// //             createdById: userId,
// //           },
// //         });
// //       }

// //       return { success: true, transferRefId };
// //     });
// //   }
// // }
