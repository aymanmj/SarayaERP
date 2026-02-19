import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChargeSource,
  PrescriptionStatus,
  InvoiceStatus,
  MedicationRoute,
  MedicationFrequency,
  ProductType,
  StockTransactionType,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispenseCompletedEvent } from './events/dispense-completed.event';
import { AccountingService } from '../accounting/accounting.service'; // Fixed relative import
import { CDSSService } from '../cdss/cdss.service';

@Injectable()
export class PharmacyService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private accounting: AccountingService,
    @Inject(forwardRef(() => CDSSService))
    private cdssService: CDSSService,
  ) {}

  private async getPharmacyWarehouseId(hospitalId: number): Promise<number> {
    const wh = await this.prisma.warehouse.findFirst({
      where: {
        hospitalId,
        isActive: true,
        name: { contains: 'harmacy', mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (wh) return wh.id;

    const anyWh = await this.prisma.warehouse.findFirst({
      where: { hospitalId, isActive: true },
      select: { id: true },
    });
    if (anyWh) return anyWh.id;

    throw new BadRequestException('لا يوجد مخزن معرف للصيدلية للصرف منه.');
  }

  // ... (allocateStockFEFO implementation omitted for brevity) ...
  // ⚡ خوارزمية FEFO مع الاستعداد للقفل التفاؤلي (Optimistic Locking)
  private async allocateStockFEFO(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    productId: number,
    requestedQty: number,
    productName: string,
  ) {
    const stocks = await tx.productStock.findMany({
      where: {
        warehouseId,
        productId,
        quantity: { gt: 0 },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });

    const totalAvailable = stocks.reduce(
      (sum, s) => sum + Number(s.quantity),
      0,
    );

    if (totalAvailable < requestedQty) {
      throw new BadRequestException(
        `رصيد غير كافٍ للصنف "${productName}". المتاح: ${totalAvailable}، المطلوب: ${requestedQty}.`,
      );
    }

    const allocation: {
      stockId: number;
      batchNumber: string | null;
      expiryDate: Date | null;
      quantity: number;
      currentVersion: number;
    }[] = [];

    let remainingToPick = requestedQty;

    for (const stock of stocks) {
      if (remainingToPick <= 0) break;
      const availableInBatch = Number(stock.quantity);
      const swallow = Math.min(remainingToPick, availableInBatch);

      allocation.push({
        stockId: stock.id,
        batchNumber: stock.batchNumber,
        expiryDate: stock.expiryDate,
        quantity: swallow,
        currentVersion: stock.version,
      });

      remainingToPick -= swallow;
    }

    return allocation;
  }

  async getWorklist(hospitalId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [prescriptions, totalCount] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
      where: {
        hospitalId,
        status: PrescriptionStatus.ACTIVE,
        dispenses: { none: {} },
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        doctor: { select: { id: true, fullName: true } },
        encounter: { select: { id: true, type: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
      this.prisma.prescription.count({
        where: {
          hospitalId,
          status: PrescriptionStatus.ACTIVE,
          dispenses: { none: {} },
        }
      })
    ]);

    const mapped = prescriptions.map((p) => ({
      id: p.id,
      status: p.status,
      createdAt: p.createdAt,
      encounterId: p.encounter?.id ?? null,
      encounter: p.encounter
        ? { id: p.encounter.id, type: p.encounter.type }
        : null,
      patient: p.patient,
      doctor: p.doctor,
      items: p.items.map((it) => ({
        id: it.id,
        dose: it.dose,
        route: it.route,
        frequency: it.frequency,
        durationDays: it.durationDays,
        quantity: it.quantity,
        notes: it.notes,
        drugItem: it.product
          ? {
              id: it.product.id,
              code: it.product.code,
              name: it.product.name,
              genericName: it.product.genericName,
              strength: it.product.strength,
              form: it.product.form,
              unitPrice: Number(it.product.sellPrice ?? 0),
            }
          : null,
      })),
    }));

    return {
      data: mapped,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      }
    };
  }

  async getEncounterPrescriptions(hospitalId: number, encounterId: number) {
    const list = await this.prisma.prescription.findMany({
      where: { hospitalId, encounterId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        doctor: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
      },
    });

    return list.map((p) => ({
      ...p,
      items: p.items.map((it) => ({
        ...it,
        drugItem: it.product,
      })),
    }));
  }

  async getDrugCatalog(hospitalId: number, q?: string) {
    return this.prisma.product.findMany({
      where: {
        hospitalId,
        type: ProductType.DRUG,
        isActive: true,
        isDeleted: false,
        ...(q && q.trim().length > 0
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { genericName: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        genericName: true,
        strength: true,
        form: true,
        sellPrice: true,
        rxNormCode: true, // ✅ Add RxNorm
      },
    });
  }



  // ✅ [UPDATED] إنشاء وصفة مع فحص الأمان (Safety Check)
  async createPrescriptionForEncounter(params: {
    hospitalId: number;
    encounterId: number;
    doctorId: number;
    notes?: string;
    overrideSafety?: boolean; // 👈 إضافة خيار تجاوز التحذيرات
    items: {
      drugItemId: number;
      dose: string;
      route: string;
      frequency: string;
      durationDays: number;
      quantity: number;
      notes?: string;
    }[];
  }) {
    const { hospitalId, encounterId, doctorId, notes, items } = params;

    if (!items || items.length === 0)
      throw new BadRequestException('لا توجد أدوية.');

    // 1. جلب بيانات المريض والحساسيات
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: {
          include: { allergies: true }, // 👈 جلب الحساسيات
        },
      },
    });

    if (!encounter || encounter.hospitalId !== hospitalId)
      throw new BadRequestException('الحالة غير صحيحة.');

    const allergies = encounter.patient.allergies;

    const productIds = items.map((i: any) => i.drugItemId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    // 2. فحص كل دواء مقابل الحساسيات
    if (allergies.length > 0) {
      for (const prod of products) {
        // فحص الاسم العلمي والاسم التجاري (بحث نصي بسيط)
        const drugName = prod.name.toLowerCase();
        const generic = (prod.genericName || '').toLowerCase();

        for (const allergy of allergies) {
          const allergen = allergy.allergen.toLowerCase();

          // إذا كان اسم الدواء أو الاسم العلمي يحتوي على مادة التحسس
          if (
            drugName.includes(allergen) ||
            (generic && generic.includes(allergen))
          ) {
            throw new BadRequestException(
              `⚠️ تحذير سلامة: المريض لديه حساسية من "${allergy.allergen}"، وهذا يتعارض مع الدواء "${prod.name}".`,
            );
          }
        }
      }
    }

    // 3. فحص التداخلات الدوائية (Clinical Safety) via CDSS
    const drugNames = products.map((p) => p.name);

    // Call CDSS Service
    const interactions = await this.cdssService.checkDrugInteractions(drugNames);

    if (interactions.length > 0 && !params.overrideSafety) {
      throw new BadRequestException({
        message: '⚠️ تحذير: توجد تداخلات دوائية محتملة.',
        code: 'SAFETY_WARNING',
        interactions,
      });
    }

    // 4. إنشاء الوصفة (إذا اجتازت الفحص أو تم التجاوز)
    return this.prisma.$transaction(async (tx) => {
      const pres = await tx.prescription.create({
        data: {
          hospitalId,
          encounterId,
          patientId: encounter.patientId,
          doctorId,
          status: PrescriptionStatus.ACTIVE,
          notes,
        },
      });

      for (const item of items) {
        await tx.prescriptionItem.create({
          data: {
            prescriptionId: pres.id,
            productId: item.drugItemId,
            dose: item.dose,
            route: (item.route as MedicationRoute) || MedicationRoute.OTHER,
            frequency:
              (item.frequency as MedicationFrequency) ||
              MedicationFrequency.OTHER,
            durationDays: item.durationDays,
            quantity: item.quantity,
            notes: item.notes,
          },
        });
      }
      return pres;
    });
  }

  // -----------------------------------------------------------------------
  // 🟢 عمليات الصرف (Dispense) - ✅ تحديث القفل التفاؤلي
  // -----------------------------------------------------------------------

  async dispensePrescription(params: {
    hospitalId: number;
    prescriptionId: number;
    pharmacistId: number;
    notes?: string;
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[];
  }) {
    const { hospitalId, prescriptionId, pharmacistId, notes, items } = params;
    const warehouseId = await this.getPharmacyWarehouseId(hospitalId);
    let calculatedTotalCost = 0;

    // سنحاول العملية، إذا فشلت بسبب التزامن، الفرونت إند يجب أن يعيد المحاولة أو يظهر رسالة
    const result = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: { include: { product: true } },
          encounter: true,
        },
      });

      if (!prescription) throw new NotFoundException('الوصفة غير موجودة.');
      if (
        prescription.status === PrescriptionStatus.COMPLETED ||
        prescription.status === PrescriptionStatus.CANCELLED
      ) {
        throw new BadRequestException('حالة الوصفة لا تسمح بالصرف.');
      }

      const existingDispense = await tx.dispenseRecord.findFirst({
        where: { prescriptionId: prescription.id },
      });
      if (existingDispense) {
        throw new BadRequestException('تم صرف هذه الوصفة مسبقاً.');
      }

      const overrides = new Map<
        number,
        { quantity?: number; dispensedProductId?: number }
      >();
      if (items) {
        for (const it of items) {
          overrides.set(it.prescriptionItemId, {
            quantity: Number(it.quantity),
            dispensedProductId: it.dispensedDrugItemId,
          });
        }
      }

      const dispense = await tx.dispenseRecord.create({
        data: {
          hospitalId,
          prescriptionId: prescription.id,
          dispensedById: pharmacistId,
          notes: notes ?? null,
        },
      });

      let totalSalesAmount = 0;

      for (const item of prescription.items) {
        if (!item.product) continue;
        const ov = overrides.get(item.id);
        const qtyToDispense =
          ov?.quantity !== undefined ? ov.quantity : Number(item.quantity);
        if (qtyToDispense <= 0) continue;

        let productToDispense = item.product;
        if (
          ov?.dispensedProductId &&
          ov.dispensedProductId !== item.product.id
        ) {
          const alt = await tx.product.findUnique({
            where: { id: ov.dispensedProductId },
          });
          if (alt) productToDispense = alt;
        }

        // 1. تحديد الكميات والتشغيلات المطلوبة
        const allocations = await this.allocateStockFEFO(
          tx,
          warehouseId,
          productToDispense.id,
          qtyToDispense,
          productToDispense.name,
        );

        const unitPrice = Number(productToDispense.sellPrice ?? 0);
        const costPrice = Number(productToDispense.costPrice ?? 0);

        for (const alloc of allocations) {
          const lineTotal = unitPrice * alloc.quantity;
          const lineCost = costPrice * alloc.quantity;
          totalSalesAmount += lineTotal;
          calculatedTotalCost += lineCost;

          await tx.dispenseItem.create({
            data: {
              dispenseRecordId: dispense.id,
              prescriptionItemId: item.id,
              productId: productToDispense.id,
              quantity: alloc.quantity,
              unitPrice,
              totalAmount: lineTotal,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
            },
          });

          // 2. 🛡️ تحديث المخزون مع Optimistic Lock
          const updateResult = await tx.productStock.updateMany({
            where: {
              id: alloc.stockId,
              version: alloc.currentVersion, // يجب أن تطابق النسخة التي قرأناها
            },
            data: {
              quantity: { decrement: alloc.quantity },
              version: { increment: 1 }, // زيادة النسخة
            },
          });

          if (updateResult.count === 0) {
            // إذا كان العدد 0، فهذا يعني أن السجل تغير بواسطة شخص آخر في هذه اللحظة
            throw new ConflictException(
              `حدث تغيير في مخزون الصنف "${productToDispense.name}" (تشغيلة ${alloc.batchNumber}) أثناء العملية. يرجى إعادة المحاولة.`,
            );
          }

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: productToDispense.id,
              type: StockTransactionType.OUT,
              quantity: alloc.quantity,
              unitCost: costPrice,
              totalCost: lineCost,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              referenceType: 'DISPENSE',
              referenceId: dispense.id,
              dispenseRecordId: dispense.id,
              createdById: pharmacistId,
            },
          });
        }

        // تحديث المنتج الرئيسي (يمكن إضافة version هنا أيضاً إذا كان التزامن حرجاً جداً في السعر)
        await tx.product.update({
          where: { id: productToDispense.id },
          data: { stockOnHand: { decrement: qtyToDispense } },
        });
      }

      const pharmacyServiceItem = await tx.serviceItem.findFirst({
        where: { hospitalId, code: 'PHARMACY-DRUGS' },
      });

      if (pharmacyServiceItem && totalSalesAmount > 0) {
        await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: prescription.encounterId,
            serviceItemId: pharmacyServiceItem.id,
            sourceType: ChargeSource.PHARMACY,
            sourceId: dispense.id,
            quantity: 1,
            unitPrice: totalSalesAmount,
            totalAmount: totalSalesAmount,
          },
        });
      }

      await tx.prescription.update({
        where: { id: prescription.id },
        data: { status: PrescriptionStatus.COMPLETED },
      });

      return { dispense, totalAmount: totalSalesAmount };
    });

    if (calculatedTotalCost > 0) {
      this.eventEmitter.emit(
        'pharmacy.dispense_completed',
        new DispenseCompletedEvent(
          result.dispense.id,
          hospitalId,
          pharmacistId,
          calculatedTotalCost,
        ),
      );
    }

    return result;
  }


  // -----------------------------------------------------------------------
  // 🟢 عمليات الصرف المباشر (POS) - ✅ تحديث القفل التفاؤلي
  // -----------------------------------------------------------------------

  async dispenseAndPay(params: {
    hospitalId: number;
    prescriptionId: number;
    pharmacistId: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
    notes?: string;
    items?: {
      prescriptionItemId: number;
      quantity: number;
      dispensedDrugItemId?: number;
    }[];
  }) {
    const {
      hospitalId,
      prescriptionId,
      pharmacistId,
      paymentMethod,
      amountPaid,
      notes,
      items,
    } = params;

    const warehouseId = await this.getPharmacyWarehouseId(hospitalId);
    let calculatedTotalCost = 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: { include: { product: true } },
          encounter: true,
          patient: true,
        },
      });

      if (!prescription) throw new NotFoundException('الوصفة غير موجودة.');
      if (prescription.status === PrescriptionStatus.COMPLETED) {
        throw new BadRequestException('تم صرف هذه الوصفة مسبقاً.');
      }

      const overrides = new Map<
        number,
        { quantity?: number; dispensedProductId?: number }
      >();
      if (items) {
        for (const it of items) {
          overrides.set(it.prescriptionItemId, {
            quantity: Number(it.quantity),
            dispensedProductId: it.dispensedDrugItemId
              ? Number(it.dispensedDrugItemId)
              : undefined,
          });
        }
      }

      const dispense = await tx.dispenseRecord.create({
        data: {
          hospitalId,
          prescriptionId,
          dispensedById: pharmacistId,
          notes: notes ?? 'صرف مباشر (POS)',
        },
      });

      let invoiceTotal = 0;

      for (const item of prescription.items) {
        if (!item.product) continue;

        const ov = overrides.get(item.id);
        const qtyToDispense =
          ov?.quantity !== undefined ? ov.quantity : Number(item.quantity);

        if (qtyToDispense <= 0) continue;

        let productToDispense = item.product;
        if (
          ov?.dispensedProductId &&
          ov.dispensedProductId !== item.product.id
        ) {
          const alt = await tx.product.findUnique({
            where: { id: ov.dispensedProductId },
          });
          if (alt) productToDispense = alt;
        }

        const allocations = await this.allocateStockFEFO(
          tx,
          warehouseId,
          productToDispense.id,
          qtyToDispense,
          productToDispense.name,
        );

        const unitPrice = Number(productToDispense.sellPrice);
        const costPrice = Number(productToDispense.costPrice);

        for (const alloc of allocations) {
          const lineTotal = unitPrice * alloc.quantity;
          const lineCost = costPrice * alloc.quantity;
          invoiceTotal += lineTotal;
          calculatedTotalCost += lineCost;

          await tx.dispenseItem.create({
            data: {
              dispenseRecordId: dispense.id,
              prescriptionItemId: item.id,
              productId: productToDispense.id,
              quantity: alloc.quantity,
              unitPrice: unitPrice,
              totalAmount: lineTotal,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
            },
          });

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: productToDispense.id,
              type: StockTransactionType.OUT,
              quantity: alloc.quantity,
              unitCost: costPrice,
              totalCost: lineCost,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              referenceType: 'DISPENSE_POS',
              referenceId: dispense.id,
              dispenseRecordId: dispense.id,
              createdById: pharmacistId,
            },
          });

          // 🛡️ تحديث المخزون مع Optimistic Lock
          const updateResult = await tx.productStock.updateMany({
            where: {
              id: alloc.stockId,
              version: alloc.currentVersion, // الشرط الحاسم
            },
            data: {
              quantity: { decrement: alloc.quantity },
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException(
              `حدث تغيير في مخزون الصنف "${productToDispense.name}" أثناء العملية. يرجى إعادة المحاولة.`,
            );
          }
        }

        await tx.product.update({
          where: { id: productToDispense.id },
          data: { stockOnHand: { decrement: qtyToDispense } },
        });
      }

      if (Math.abs(invoiceTotal - 0) < 0.001)
        throw new BadRequestException('لا توجد أصناف للصرف.');

      const invoice = await tx.invoice.create({
        data: {
          hospitalId,
          patientId: prescription.patientId,
          encounterId: prescription.encounterId,
          status: InvoiceStatus.PAID,
          totalAmount: invoiceTotal,
          paidAmount: amountPaid,
          currency: 'LYD',
        },
      });

      const payment = await tx.payment.create({
        data: {
          hospitalId,
          invoiceId: invoice.id,
          amount: amountPaid,
          method: paymentMethod,
          paidAt: new Date(),
          cashierId: pharmacistId,
        },
      });

      const pharmacyServiceItem = await tx.serviceItem.findFirst({
        where: { hospitalId, code: 'PHARMACY-DRUGS' },
      });

      if (pharmacyServiceItem) {
        await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: prescription.encounterId,
            serviceItemId: pharmacyServiceItem.id,
            sourceType: ChargeSource.PHARMACY,
            sourceId: dispense.id,
            quantity: 1,
            unitPrice: invoiceTotal,
            totalAmount: invoiceTotal,
            invoiceId: invoice.id,
          },
        });
      }

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: PrescriptionStatus.COMPLETED },
      });

      return { invoice, payment, dispense };
    });

    await this.accounting.recordInvoiceEntry({
      invoiceId: result.invoice.id,
      hospitalId,
      userId: pharmacistId,
    });

    await this.accounting.recordPaymentEntry({
      paymentId: result.payment.id,
      hospitalId,
      userId: pharmacistId,
    });

    if (calculatedTotalCost > 0) {
      this.eventEmitter.emit(
        'pharmacy.dispense_completed',
        new DispenseCompletedEvent(
          result.dispense.id,
          hospitalId,
          pharmacistId,
          calculatedTotalCost,
        ),
      );
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // 🟢 إدارة المخزون اليدوية (Manual Stock & Reporting)
  // -----------------------------------------------------------------------

  async getDrugStockList(hospitalId: number, q?: string) {
    return this.prisma.product
      .findMany({
        where: {
          hospitalId,
          type: ProductType.DRUG,
          isActive: true,
          isDeleted: false,
          ...(q && q.trim().length > 0
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { genericName: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          genericName: true,
          strength: true,
          form: true,
          sellPrice: true,
          stockOnHand: true,
        },
      })
      .then((list) =>
        list.map((d) => ({
          ...d,
          unitPrice: Number(d.sellPrice ?? 0),
          stockOnHand: Number(d.stockOnHand ?? 0),
        })),
      );
  }

  // ✅ [CORRECTED] Manual Stock Transaction
  async createManualStockTransaction(params: {
    hospitalId: number;
    userId: number;
    drugItemId: number;
    type: 'IN' | 'ADJUST';
    quantity: number;
    unitCost?: number;
    batchNumber?: string;
    expiryDate?: Date;
  }) {
    const {
      hospitalId,
      userId,
      drugItemId,
      type,
      quantity,
      unitCost,
      batchNumber,
      expiryDate,
    } = params;

    let txnType: StockTransactionType = StockTransactionType.IN;
    if (type === 'ADJUST') txnType = StockTransactionType.ADJUST;

    const warehouseId = await this.getPharmacyWarehouseId(hospitalId);
    const batchNo = batchNumber || 'GENERAL';

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: drugItemId },
      });
      if (!product || product.hospitalId !== hospitalId)
        throw new NotFoundException('المنتج غير موجود.');

      const cost =
        unitCost !== undefined ? unitCost : Number(product.costPrice ?? 0);
      const totalCost = cost * quantity;

      // ✅ [FIXED KEY] استخدام warehouseId_productId_batchNumber
      const currentStockRec = await tx.productStock.findUnique({
        where: {
          warehouseId_productId_batchNumber: {
            warehouseId,
            productId: product.id,
            batchNumber: batchNo,
          },
        },
      });

      // الرصيد الحالي للتشغيلة
      const currentVal = Number(currentStockRec?.quantity ?? 0);

      // تحديد كمية التعديل
      let qtyChange = quantity;

      // ✅ [FIXED KEY] استخدام warehouseId_productId_batchNumber في Upsert
      await tx.productStock.upsert({
        where: {
          warehouseId_productId_batchNumber: {
            warehouseId,
            productId: product.id,
            batchNumber: batchNo,
          },
        },
        update: {
          quantity: { increment: qtyChange },
          // في التعديل اليدوي، لا بأس من عدم استخدام Optimistic Lock هنا للتبسيط،
          // أو يمكن إضافته إذا كان التعديل يتم عبر واجهة متعددة المستخدمين بكثافة.
          ...(expiryDate ? { expiryDate } : {}),
        },
        create: {
          hospitalId,
          warehouseId,
          productId: product.id,
          batchNumber: batchNo,
          expiryDate: expiryDate,
          quantity: qtyChange,
        },
      });

      // تحديث الرصيد العام
      await tx.product.update({
        where: { id: product.id },
        data: { stockOnHand: { increment: qtyChange } },
      });

      return tx.stockTransaction.create({
        data: {
          hospitalId,
          warehouseId,
          productId: product.id,
          type: txnType,
          quantity: Math.abs(qtyChange),
          unitCost: cost,
          totalCost: Math.abs(totalCost),
          batchNumber: batchNo,
          expiryDate: expiryDate,
          referenceType: 'MANUAL',
          createdById: userId,
        },
      });
    });
  }

  async getStockTransactionsReport(params: {
    hospitalId: number;
    from?: Date;
    to?: Date;
    drugItemId?: number;
    type?: StockTransactionType;
  }) {
    const { hospitalId, from, to, drugItemId, type } = params;
    const where: any = { hospitalId };
    if (drugItemId) where.productId = drugItemId;
    if (type) where.type = type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    const txns = await this.prisma.stockTransaction.findMany({
      where,
      include: {
        product: true,
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return txns.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      type: t.type,
      quantity: Number(t.quantity),
      unitCost: Number(t.unitCost),
      totalCost: Number(t.totalCost),
      batchNumber: t.batchNumber,
      expiryDate: t.expiryDate,
      drug: {
        id: t.product.id,
        code: t.product.code,
        name: t.product.name,
        strength: t.product.strength,
        form: t.product.form,
      },
      createdBy: t.createdBy,
      dispenseRecordId: t.dispenseRecordId,
    }));
  }

  async getEncounterDispensesSummary(hospitalId: number, encounterId: number) {
    const records = await this.prisma.dispenseRecord.findMany({
      where: { hospitalId, prescription: { encounterId } },
      include: {
        items: {
          include: {
            product: true,
            prescriptionItem: { include: { product: true } },
          },
        },
        prescription: { include: { doctor: true } },
      },
      orderBy: { dispensedAt: 'asc' },
    });
    return records.map((r) => ({
      id: r.id,
      createdAt: r.dispensedAt,
      notes: r.notes,
      doctor: r.prescription?.doctor,
      totalAmount: r.items.reduce((sum, it) => sum + Number(it.totalAmount), 0),
      items: r.items.map((it) => ({
        id: it.id,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        totalAmount: Number(it.totalAmount),
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        dispensedDrug: it.product,
        originalDrug: it.prescriptionItem?.product,
        isSubstitute:
          it.productId !== (it.prescriptionItem?.productId ?? it.productId),
      })),
    }));
  }
}
