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
  Prisma,
} from '@prisma/client';

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
    // التحقق من تكرار الكود
    const exists = await this.prisma.asset.findUnique({
      where: { tagNumber: data.tagNumber },
    });
    if (exists)
      throw new BadRequestException('كود الأصل (Tag Number) مستخدم مسبقاً.');

    return this.prisma.asset.create({
      data: {
        hospitalId: data.hospitalId,
        name: data.name,
        tagNumber: data.tagNumber,
        serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate,
        purchaseCost: data.purchaseCost,
        usefulLifeYears: data.usefulLifeYears,
        salvageValue: data.salvageValue ?? 0,

        // القيمة الأولية تساوي تكلفة الشراء
        currentValue: data.purchaseCost,

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
          // معادلة القسط الثابت (Straight Line)
          // القسط الشهري = (التكلفة - الخردة) / (العمر * 12)
          const cost = Number(asset.purchaseCost);
          const salvage = Number(asset.salvageValue);
          const years = asset.usefulLifeYears;

          if (years === 0) return; // حماية من القسمة على صفر

          const monthlyDepreciation = (cost - salvage) / (years * 12);

          // التأكد أننا لا نخصم أكثر من القيمة المتبقية
          const currentVal = Number(asset.currentValue);
          const actualDeduction = Math.min(
            monthlyDepreciation,
            currentVal - salvage,
          );

          if (actualDeduction <= 0) return; // الأصل تم إهلاكه بالكامل

          const newBookValue = currentVal - actualDeduction;

          // أ) تحديث قيمة الأصل
          await tx.asset.update({
            where: { id: asset.id },
            data: { currentValue: newBookValue },
          });

          // ب) إنشاء قيد محاسبي
          const entry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
              entryDate: date,
              description: `إهلاك أصل ثابت: ${asset.name} (${asset.tagNumber})`,
              sourceModule: AccountingSourceModule.MANUAL, // أو نضيف ASSETS للـ Enum
              createdById: userId,
              lines: {
                create: [
                  {
                    accountId: expenseAccount.id,
                    debit: actualDeduction,
                    credit: 0,
                    description: 'مصروف إهلاك شهري',
                  },
                  {
                    accountId: accumulatedAccount.id,
                    debit: 0,
                    credit: actualDeduction,
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
              assetId: asset.id,
              financialYearId: financialYear.id,
              periodId: period.id,
              amount: actualDeduction,
              bookValueAfter: newBookValue,
              accountingEntryId: entry.id,
              createdById: userId,
            },
          });

          processedCount++;
        });
      } catch (err: any) {
        this.logger.error(`Error depreciating asset ${asset.id}`, err);
        errors.push(`Asset #${asset.tagNumber}: ${err.message}`);
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
    // تغيير حالة الأصل إلى "تحت الصيانة"
    await this.prisma.asset.update({
      where: { id: data.assetId },
      data: { status: AssetStatus.UNDER_MAINTENANCE },
    });

    return this.prisma.maintenanceTicket.create({
      data: {
        hospitalId: data.hospitalId,
        assetId: data.assetId,
        requestedBy: data.userId,
        type: data.type,
        priority: data.priority,
        issueDescription: data.issueDescription,
        status: TicketStatus.OPEN,
      },
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
    const { ticketId, notes, cost, newStatus } = params;

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.maintenanceTicket.findUnique({
        where: { id: ticketId },
      });
      if (!ticket) throw new NotFoundException('التذكرة غير موجودة');

      // تحديث التذكرة
      const updated = await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus,
          technicianNotes: notes,
          cost,
          completedAt: new Date(),
          assignedTo: params.userId, // الذي قام بالحل
        },
      });

      // إذا أغلقت التذكرة، نعيد الأصل للخدمة
      if (
        newStatus === TicketStatus.CLOSED ||
        newStatus === TicketStatus.RESOLVED
      ) {
        await tx.asset.update({
          where: { id: ticket.assetId },
          data: { status: AssetStatus.IN_SERVICE },
        });
      }

      // إذا كان هناك تكلفة، يمكننا إنشاء قيد مصروف صيانة هنا (اختياري)
      // ... (code for maintenance expense entry) ...

      return updated;
    });
  }
}
