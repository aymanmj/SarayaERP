import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  AssetStatus,
  MaintenanceType,
  TicketStatus,
  AccountingSourceModule,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  // -------------------------------------------------------
  // 1. إدارة الأصول (Register Assets)
  // -------------------------------------------------------

  async registerAsset(data: {
    hospitalId: number;
    name: string;
    tagNumber: string; // Barcode
    serialNumber?: string;
    purchaseDate: Date;
    purchaseCost: number;
    usefulLifeYears: number;
    salvageValue?: number;
    departmentId?: number;
    roomId?: number;
  }) {
    // التحقق من صحة التكلفة والخردة والعمر الإنتاجي
    const purchaseCostDec = Money.decimal(data.purchaseCost);
    const salvageValueDec = Money.decimal(data.salvageValue ?? 0);
    if (
      purchaseCostDec.lt(0) ||
      salvageValueDec.lt(0) ||
      salvageValueDec.gt(purchaseCostDec)
    ) {
      throw new BadRequestException(
        'تكلفة الشراء وقيمة الخردة يجب أن تكون غير سالبة ولا تتجاوز الخردة تكلفة الأصل.',
      );
    }
    if (!Number.isInteger(data.usefulLifeYears) || data.usefulLifeYears <= 0) {
      throw new BadRequestException(
        'العمر الإنتاجي للأصل يجب أن يكون عدداً صحيحاً موجباً.',
      );
    }

    // التحقق من تكرار الكود
    const exists = await this.prisma.asset.findUnique({
      where: { tagNumber: data.tagNumber },
    });
    if (exists)
      throw new BadRequestException('كود الأصل (Tag Number) مستخدم مسبقاً.');

    const purchaseCostDb = Money.toDbString(purchaseCostDec);
    const salvageValueDb = Money.toDbString(salvageValueDec);

    return this.prisma.asset.create({
      data: {
        hospitalId: data.hospitalId,
        name: data.name,
        tagNumber: data.tagNumber,
        serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate,
        purchaseCost: purchaseCostDb,
        usefulLifeYears: data.usefulLifeYears,
        salvageValue: salvageValueDb,

        // القيمة الأولية تساوي تكلفة الشراء
        currentValue: purchaseCostDb,

        departmentId: data.departmentId,
        roomId: data.roomId,
        status: AssetStatus.IN_SERVICE,
      },
    });
  }

  async getAssets(hospitalId: number, search?: string) {
    return this.prisma.asset.findMany({
      where: {
        hospitalId,
        OR: search
          ? [
              { name: { contains: search, mode: 'insensitive' } },
              { tagNumber: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { department: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -------------------------------------------------------
  // 2. محرك الإهلاك (Depreciation Engine) 🔥
  // -------------------------------------------------------

  async runDepreciationForPeriod(
    hospitalId: number,
    userId: number,
    date: Date,
  ) {
    // 1. تحديد السنة والفترة المالية
    const { fy: financialYear, period } =
      await this.accounting.getOpenPeriodForDate(hospitalId, date);

    // 2. جلب حسابات الإهلاك (يجب أن تكون معرفة في النظام)
    // سنفترض أكواد ثابتة أو يجب عليك إضافتها في SystemAccountKey لاحقاً
    // 530000 = مصروف الإهلاك
    // 160000 = مجمع الإهلاك (أصل سالب)
    const expenseAccount = await this.prisma.account.findFirst({
      where: { hospitalId, code: { startsWith: '530' } },
    });
    const accumulatedAccount = await this.prisma.account.findFirst({
      where: { hospitalId, code: { startsWith: '160' } },
    });

    if (!expenseAccount || !accumulatedAccount) {
      throw new BadRequestException(
        'حسابات الإهلاك (المصروف أو المجمع) غير معرفة في الدليل المحاسبي.',
      );
    }

    // 3. جلب الأصول المؤهلة للإهلاك
    // الشرط: في الخدمة + قيمتها الحالية أكبر من قيمة الخردة
    const assets = await this.prisma.asset.findMany({
      where: {
        hospitalId,
        status: AssetStatus.IN_SERVICE,
        currentValue: { gt: this.prisma.asset.fields.salvageValue }, // Current > Salvage
      },
    });

    let processedCount = 0;
    const errors: string[] = [];

    // تنفيذ العملية لكل أصل
    for (const asset of assets) {
      // التحقق: هل تم عمل إهلاك لهذا الأصل في هذه الفترة مسبقاً؟
      const alreadyRun = await this.prisma.assetDepreciation.findFirst({
        where: {
          assetId: asset.id,
          financialYearId: financialYear.id,
          periodId: period.id,
        },
      });

      if (alreadyRun) continue;

      try {
        await this.prisma.$transaction(async (tx) => {
          if (typeof tx.$queryRaw === 'function') {
            await tx.$queryRaw`
              SELECT id FROM "Asset"
              WHERE id = ${asset.id} AND "hospitalId" = ${hospitalId}
              FOR UPDATE
            `;
          }

          const duplicate = await tx.assetDepreciation.findFirst({
            where: {
              assetId: asset.id,
              financialYearId: financialYear.id,
              periodId: period.id,
            },
            select: { id: true },
          });
          if (duplicate) return;

          const lockedAsset = await tx.asset.findFirst({
            where: { id: asset.id, hospitalId, status: AssetStatus.IN_SERVICE },
          });
          if (!lockedAsset) return;

          // معادلة القسط الثابت (Straight Line) بدقة Money (ROUND_HALF_EVEN)
          // القسط الشهري = (التكلفة - الخردة) / (العمر * 12)
          const costDec = Money.decimal(lockedAsset.purchaseCost);
          const salvageDec = Money.decimal(lockedAsset.salvageValue);
          const years = lockedAsset.usefulLifeYears;

          if (years <= 0) return; // حماية من القسمة على صفر

          const depreciableBaseDec = Money.subtractDecimal(costDec, salvageDec);
          if (!depreciableBaseDec.gt(0)) return;

          const monthlyDepreciationDec = Money.divide(
            depreciableBaseDec,
            years * 12,
          );

          // التأكد أننا لا نخصم أكثر من القيمة المتبقية
          const currentValDec = Money.decimal(lockedAsset.currentValue);
          const remainingDepreciableDec = Money.subtractDecimal(
            currentValDec,
            salvageDec,
          );
          if (!remainingDepreciableDec.gt(0)) return;

          const actualDeductionDec = Money.roundDecimal(
            Money.minDecimal(monthlyDepreciationDec, remainingDepreciableDec),
            3,
          );

          if (!actualDeductionDec.gt(0)) return; // الأصل تم إهلاكه بالكامل

          const newBookValueDec = Money.subtractDecimal(
            currentValDec,
            actualDeductionDec,
          );
          const actualDeductionDb = Money.toDbString(actualDeductionDec);
          const newBookValueDb = Money.toDbString(newBookValueDec);

          // أ) تحديث قيمة الأصل
          await tx.asset.update({
            where: { id: lockedAsset.id },
            data: { currentValue: newBookValueDb },
          });

          // ب) إنشاء قيد محاسبي محمي بمفتاح عدم تكرار
          const entry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
              entryDate: date,
              description: `إهلاك أصل ثابت: ${lockedAsset.name} (${lockedAsset.tagNumber})`,
              sourceModule: AccountingSourceModule.MANUAL,
              sourceId: lockedAsset.id,
              postingKey: `asset-depreciation:${hospitalId}:${lockedAsset.id}:${financialYear.id}:${period.id}`,
              createdById: userId,
              lines: {
                create: [
                  {
                    accountId: expenseAccount.id,
                    debit: actualDeductionDb,
                    credit: '0.000',
                    description: 'مصروف إهلاك شهري',
                  },
                  {
                    accountId: accumulatedAccount.id,
                    debit: '0.000',
                    credit: actualDeductionDb,
                    description: 'مجمع إهلاك',
                  },
                ],
              },
            },
          });

          // ج) تسجيل سجل الإهلاك التاريخي
          await tx.assetDepreciation.create({
            data: {
              hospitalId,
              assetId: lockedAsset.id,
              financialYearId: financialYear.id,
              periodId: period.id,
              amount: actualDeductionDb,
              bookValueAfter: newBookValueDb,
              accountingEntryId: entry.id,
              createdById: userId,
            },
          });

          processedCount++;
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error depreciating asset ${asset.id}`, err);
        errors.push(`Asset #${asset.tagNumber}: ${message}`);
      }
    }

    return {
      success: true,
      processedCount,
      totalAssets: assets.length,
      errors,
    };
  }

  // -------------------------------------------------------
  // 3. إدارة الصيانة (Maintenance)
  // -------------------------------------------------------

  async createMaintenanceTicket(data: {
    hospitalId: number;
    userId: number;
    assetId: number;
    type: MaintenanceType;
    priority: string;
    issueDescription: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: data.assetId, hospitalId: data.hospitalId },
        select: { id: true },
      });
      if (!asset) {
        throw new NotFoundException('الأصل غير موجود ضمن هذه المنشأة.');
      }

      // تغيير حالة الأصل إلى "تحت الصيانة"
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.UNDER_MAINTENANCE },
      });

      return tx.maintenanceTicket.create({
        data: {
          hospitalId: data.hospitalId,
          assetId: asset.id,
          requestedBy: data.userId,
          type: data.type,
          priority: data.priority,
          issueDescription: data.issueDescription,
          status: TicketStatus.OPEN,
        },
      });
    });
  }

  async getTickets(hospitalId: number, status?: TicketStatus) {
    return this.prisma.maintenanceTicket.findMany({
      where: { hospitalId, status: status || undefined },
      include: {
        asset: { select: { name: true, tagNumber: true } },
        requester: { select: { fullName: true } },
        technician: { select: { fullName: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async resolveTicket(params: {
    hospitalId: number;
    userId: number; // الفني أو المدير
    ticketId: number;
    notes: string;
    cost: number;
    newStatus: TicketStatus; // RESOLVED or CLOSED
  }) {
    const { hospitalId, ticketId, notes, cost, newStatus } = params;
    const costDec = Money.decimal(cost ?? 0);
    if (costDec.lt(0)) {
      throw new BadRequestException('تكلفة الصيانة لا يمكن أن تكون سالبة.');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.maintenanceTicket.findFirst({
        where: { id: ticketId, hospitalId },
      });
      if (!ticket) {
        throw new NotFoundException('التذكرة غير موجودة ضمن هذه المنشأة');
      }

      // تحديث التذكرة بدقة Money
      const updated = await tx.maintenanceTicket.update({
        where: { id: ticket.id },
        data: {
          status: newStatus,
          technicianNotes: notes,
          cost: Money.toDbString(costDec),
          completedAt: new Date(),
          assignedTo: params.userId, // الذي قام بالحل
        },
      });

      // إذا أغلقت التذكرة، نعيد الأصل للخدمة ضمن نفس المنشأة
      if (
        newStatus === TicketStatus.CLOSED ||
        newStatus === TicketStatus.RESOLVED
      ) {
        await tx.asset.updateMany({
          where: { id: ticket.assetId, hospitalId },
          data: { status: AssetStatus.IN_SERVICE },
        });
      }

      return updated;
    });
  }
}
