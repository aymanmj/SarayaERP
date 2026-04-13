// src/accounting/accounting.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Prisma,
  AccountingSourceModule,
  PaymentMethod,
  AccountType,
  FinancialYearStatus,
  InvoiceStatus,
  ServiceType, // 👈 جديد
  SystemAccountKey, // 👈 جديد
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerResponseDto, LedgerLineDto } from './dto/ledger.dto';
import type { SaveOpeningBalancesDto } from './dto/opening-balance.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import type { CreateManualEntryDto } from './dto/manual-entry.dto';
import {
  IncomeStatementDto,
  IncomeStatementRowDto,
} from './dto/income-statement.dto';

import {
  CloseFinancialYearDto,
  CloseFinancialYearResultDto,
} from './dto/close-financial-year.dto';

import {
  JournalEntrySummaryDto,
  JournalEntryDetailDto,
  JournalEntryLineDto,
} from './dto/journal-entry.dto';

const ACCOUNT_CODES = {
  CASH_MAIN: '100100', // صندوق الكاشير
  BANK_MAIN: '101100', // حساب بنك رئيسي
  AR_PATIENTS: '120100', // ذمم المرضى
  AR_INSURANCE: '120200', // ذمم شركات التأمين
  REVENUE_MEDICAL: '400100', // إيرادات خدمات طبية
  DISCOUNT_ALLOWED: '400200', // خصومات مسموح بها
  RETAINED_EARNINGS: '300200', // أرباح/خسائر مرحّلة
  CURRENT_YEAR_PROFIT: '300300', // صافي الربح/الخسارة للسنة الحالية
  VAT_INPUT: '140100', // ضريبة مدخلات قابلة للاسترداد (Asset)
  AP_SUPPLIERS: '200100', // دائنون موردون (حالياً نستخدم 200100)
  SALES_RETURNS: '400900', // مردودات مبيعات
} as const;

type SampleAccountDef = {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
};

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

type AutoOpeningResult = {
  fromFinancialYearId: number;
  fromFinancialYearCode: string | null;
  toFinancialYearId: number;
  toFinancialYearCode: string | null;
  openingEntryId: number;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
};

const SAMPLE_COA: SampleAccountDef[] = [
  // ===== الأصول =====
  { code: '100000', name: 'الأصول المتداولة', type: 'ASSET' },

  {
    code: ACCOUNT_CODES.CASH_MAIN,
    name: 'صندوق الخزينة الرئيسي',
    type: 'ASSET',
    parentCode: '100000',
  },
  {
    code: '100200',
    name: 'صندوق المصروفات النثرية',
    type: 'ASSET',
    parentCode: '100000',
  },

  {
    code: '101000',
    name: 'البنوك',
    type: 'ASSET',
    parentCode: '100000',
  },
  {
    code: ACCOUNT_CODES.BANK_MAIN,
    name: 'حساب البنك الرئيسي',
    type: 'ASSET',
    parentCode: '101000',
  },
  {
    code: '101200',
    name: 'حساب بنك آخر',
    type: 'ASSET',
    parentCode: '101000',
  },

  {
    code: '120000',
    name: 'الذمم المدينة',
    type: 'ASSET',
    parentCode: '100000',
  },
  {
    code: ACCOUNT_CODES.AR_PATIENTS,
    name: 'ذمم المرضى',
    type: 'ASSET',
    parentCode: '120000',
  },
  {
    code: ACCOUNT_CODES.AR_INSURANCE,
    name: 'ذمم شركات التأمين',
    type: 'ASSET',
    parentCode: '120000',
  },

  {
    code: '130000',
    name: 'المخزون',
    type: 'ASSET',
    parentCode: '100000',
  },
  {
    code: '130100',
    name: 'مخزون أدوية',
    type: 'ASSET',
    parentCode: '130000',
  },
  {
    code: '130200',
    name: 'مخزون مستلزمات طبية',
    type: 'ASSET',
    parentCode: '130000',
  },

  { code: '140000', name: 'أصول متداولة أخرى', type: 'ASSET' },
  {
    code: ACCOUNT_CODES.VAT_INPUT,
    name: 'ضريبة قيمة مضافة - مدخلات (قابلة للاسترداد)',
    type: 'ASSET',
    parentCode: '140000',
  },

  { code: '150000', name: 'الأصول الثابتة', type: 'ASSET' },
  {
    code: '150100',
    name: 'أجهزة ومعدات طبية',
    type: 'ASSET',
    parentCode: '150000',
  },
  {
    code: '150200',
    name: 'أثاث وتجهيزات طبية',
    type: 'ASSET',
    parentCode: '150000',
  },
  {
    code: '150300',
    name: 'أثاث ومعدات مكتبية',
    type: 'ASSET',
    parentCode: '150000',
  },

  { code: '160000', name: 'مجمع الإهلاك', type: 'CONTRA_ASSET' },
  {
    code: '160100',
    name: 'مجمع إهلاك أجهزة ومعدات طبية',
    type: 'CONTRA_ASSET',
    parentCode: '160000',
  },
  {
    code: '160200',
    name: 'مجمع إهلاك الأثاث والتجهيزات',
    type: 'CONTRA_ASSET',
    parentCode: '160000',
  },

  // ===== الالتزامات =====
  { code: '200000', name: 'الالتزامات المتداولة', type: 'LIABILITY' },
  {
    code: '200100',
    name: 'دائنون - موردو الأدوية',
    type: 'LIABILITY',
    parentCode: '200000',
  },
  {
    code: '200200',
    name: 'دائنون - موردو المستلزمات',
    type: 'LIABILITY',
    parentCode: '200000',
  },
  {
    code: '200300',
    name: 'رواتب وأجور مستحقة',
    type: 'LIABILITY',
    parentCode: '200000',
  },
  {
    code: '200400',
    name: 'ضرائب ورسوم مستحقة',
    type: 'LIABILITY',
    parentCode: '200000',
  },

  // ===== حقوق الملكية =====
  { code: '300000', name: 'حقوق الملكية', type: 'EQUITY' },
  {
    code: '300100',
    name: 'رأس المال',
    type: 'EQUITY',
    parentCode: '300000',
  },
  {
    code: '300200',
    name: 'أرباح/خسائر مرحّلة',
    type: 'EQUITY',
    parentCode: '300000',
  },
  {
    code: '300300',
    name: 'صافي الربح/الخسارة للسنة الحالية',
    type: 'EQUITY',
    parentCode: '300000',
  },

  // ===== الإيرادات =====
  { code: '400000', name: 'إيرادات التشغيل', type: 'REVENUE' },
  {
    code: ACCOUNT_CODES.REVENUE_MEDICAL,
    name: 'إيرادات خدمات طبية',
    type: 'REVENUE',
    parentCode: '400000',
  },
  {
    code: '400300',
    name: 'إيرادات المختبر',
    type: 'REVENUE',
    parentCode: '400000',
  },
  {
    code: '400400',
    name: 'إيرادات الأشعة',
    type: 'REVENUE',
    parentCode: '400000',
  },
  {
    code: '400500',
    name: 'إيرادات الصيدلية',
    type: 'REVENUE',
    parentCode: '400000',
  },

  {
    code: '402000',
    name: 'خصومات على الإيرادات',
    type: 'CONTRA_REVENUE',
  },
  {
    code: ACCOUNT_CODES.DISCOUNT_ALLOWED,
    name: 'خصومات مسموح بها',
    type: 'CONTRA_REVENUE',
    parentCode: '402000',
  },
  {
    code: ACCOUNT_CODES.SALES_RETURNS,
    name: 'مردودات المبيعات (مرتجعات)',
    type: 'CONTRA_REVENUE',
    parentCode: '402000',
  },

  // ===== المصروفات =====
  { code: '500000', name: 'مصروفات تشغيلية', type: 'EXPENSE' },
  {
    code: '500100',
    name: 'رواتب وأجور',
    type: 'EXPENSE',
    parentCode: '500000',
  },
  {
    code: '500200',
    name: 'مصروف أدوية',
    type: 'EXPENSE',
    parentCode: '500000',
  },
  {
    code: '500300',
    name: 'مصروف مستلزمات طبية',
    type: 'EXPENSE',
    parentCode: '500000',
  },
  {
    code: '500400',
    name: 'مصروف مواد مختبرية',
    type: 'EXPENSE',
    parentCode: '500000',
  },
  {
    code: '500500',
    name: 'مصروف مواد أشعة',
    type: 'EXPENSE',
    parentCode: '500000',
  },

  { code: '510000', name: 'مصروفات إدارية وعمومية', type: 'EXPENSE' },
  {
    code: '510100',
    name: 'إيجار',
    type: 'EXPENSE',
    parentCode: '510000',
  },
  {
    code: '510200',
    name: 'كهرباء ومياه',
    type: 'EXPENSE',
    parentCode: '510000',
  },
  {
    code: '510300',
    name: 'اتصالات وإنترنت',
    type: 'EXPENSE',
    parentCode: '510000',
  },
  {
    code: '510400',
    name: 'قرطاسية ولوازم مكتبية',
    type: 'EXPENSE',
    parentCode: '510000',
  },
  {
    code: '510500',
    name: 'صيانة وتجهيزات',
    type: 'EXPENSE',
    parentCode: '510000',
  },
];

// نوع الحساب في الميزانية
export type BalanceSheetAccountDto = {
  accountId: number;
  code: string;
  name: string;
  type: AccountType;
  balance: number; // مدين - دائن
};

export type BalanceSheetResponseDto = {
  asOfDate: string;
  assets: {
    total: number;
    accounts: BalanceSheetAccountDto[];
  };
  liabilities: {
    total: number;
    accounts: BalanceSheetAccountDto[];
  };
  equity: {
    total: number;
    accounts: BalanceSheetAccountDto[];
  };
  totals: {
    assets: number;
    liabilitiesAndEquity: number;
    difference: number; // لو صفر → الميزانية متوازنة
  };
};

// ✅ تطبيع أي Date إلى بداية اليوم UTC (تجاهل الوقت تماماً)
function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function addDaysUtc(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private prisma: PrismaService) {}

  async getSystemAccountOrThrow(
    hospitalId: number,
    key: SystemAccountKey,
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.db(tx);

    const mapping = await db.systemAccountMapping.findFirst({
      where: { hospitalId, key, isActive: true },
      include: { account: true },
    });

    if (!mapping || !mapping.account) {
      throw new BadRequestException(
        `لم يتم إعداد الحساب النظامي للمفتاح ${key} لهذه المنشأة.`,
      );
    }
    return mapping.account;
  }

  private mapServiceTypeToRevenueKey(
    type: ServiceType | null,
  ): SystemAccountKey {
    if (!type) {
      return SystemAccountKey.REVENUE_OUTPATIENT; // افتراضي حاليًا
    }

    switch (type) {
      case ServiceType.PHARMACY:
        return SystemAccountKey.REVENUE_PHARMACY;

      // لاحقًا نوسع:
      // case ServiceType.LAB:
      //   return SystemAccountKey.REVENUE_LAB;
      // case ServiceType.RADIOLOGY:
      //   return SystemAccountKey.REVENUE_RADIOLOGY;
      // ... إلخ

      default:
        return SystemAccountKey.REVENUE_OUTPATIENT;
    }
  }

  /** تأكد أن للمستشفى دليل حسابات نموذجي (يُحدّث أو ينشئ حسب الكود) */
  private async ensureDefaultAccounts(hospitalId: number) {
    await this.prisma.$transaction(async (tx) => {
      // نجيب كل الحسابات الحالية للمستشفى
      const existing = await tx.account.findMany({
        where: { hospitalId },
        select: { id: true, code: true },
      });

      const codeToId = new Map<string, number>();
      for (const acc of existing) {
        codeToId.set(acc.code, acc.id);
      }

      for (const def of SAMPLE_COA) {
        const parentId =
          def.parentCode && codeToId.has(def.parentCode)
            ? codeToId.get(def.parentCode)!
            : null;

        const existingAcc = existing.find((a) => a.code === def.code);

        if (existingAcc) {
          const updated = await tx.account.update({
            where: { id: existingAcc.id },
            data: {
              name: def.name,
              type: def.type,
              parentId,
              isActive: true,
            },
          });
          codeToId.set(def.code, updated.id);
        } else {
          const created = await tx.account.create({
            data: {
              hospitalId,
              code: def.code,
              name: def.name,
              type: def.type,
              parentId,
              isActive: true,
            },
          });
          codeToId.set(def.code, created.id);
        }
      }

      // 🔹 بعد ما تأكدنا من دليل الحسابات، نضبط المابات النظامية الأساسية
      const systemMappings: { key: SystemAccountKey; code: string }[] = [
        { key: SystemAccountKey.CASH_MAIN, code: ACCOUNT_CODES.CASH_MAIN },
        { key: SystemAccountKey.BANK_MAIN, code: ACCOUNT_CODES.BANK_MAIN },
        {
          key: SystemAccountKey.RECEIVABLE_PATIENTS,
          code: ACCOUNT_CODES.AR_PATIENTS,
        },
        {
          key: SystemAccountKey.REVENUE_OUTPATIENT,
          code: ACCOUNT_CODES.REVENUE_MEDICAL,
        },
        {
          key: SystemAccountKey.REVENUE_PHARMACY,
          code: '400500', // إيرادات الصيدلية من SAMPLE_COA
        },
        {
          key: SystemAccountKey.DISCOUNT_ALLOWED,
          code: ACCOUNT_CODES.DISCOUNT_ALLOWED,
        },
        {
          key: SystemAccountKey.SALES_RETURNS,
          code: ACCOUNT_CODES.SALES_RETURNS,
        },
      ];

      for (const m of systemMappings) {
        const accountId = codeToId.get(m.code);
        if (!accountId) continue; // لو الحساب مش موجود لأي سبب

        const existingMap = await tx.systemAccountMapping.findFirst({
          where: {
            hospitalId,
            key: m.key,
          },
        });

        if (!existingMap) {
          // إنشاء مابات جديدة
          await tx.systemAccountMapping.create({
            data: {
              hospitalId,
              key: m.key,
              accountId,
              isActive: true,
            },
          });
        } else if (
          existingMap.accountId !== accountId ||
          existingMap.isActive === false
        ) {
          // تحديث المابات لو كان مربوط بحساب آخر أو غير مفعّل
          await tx.systemAccountMapping.update({
            where: { id: existingMap.id },
            data: {
              accountId,
              isActive: true,
            },
          });
        }
      }
    });

    this.logger.log(
      `Ensured sample chart of accounts for hospital ${hospitalId}`,
    );
  }

  // ✅ Public wrapper: يُستخدم من الخدمات الأخرى
  async ensureDefaultAccountsForHospital(hospitalId: number) {
    await this.ensureDefaultAccounts(hospitalId);
  }

  private db(tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma) as typeof this.prisma;
  }

  // helper صغير لتوليد رقم القيد لو ما عندك حقل جاهز
  private formatEntryNumber(entry: {
    id: number;
    entryNumber?: string | null;
  }): string {
    if (entry.entryNumber) return entry.entryNumber;
    return entry.id.toString().padStart(6, '0');
  }

  private getNormalSide(type: AccountType): 'DEBIT' | 'CREDIT' {
    switch (type) {
      // رصيدها الطبيعي مدين
      case AccountType.ASSET:
      case AccountType.EXPENSE:
      case AccountType.CONTRA_REVENUE: // خصم الإيرادات يكون مدين
        return 'DEBIT';

      // رصيدها الطبيعي دائن
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
      case AccountType.CONTRA_ASSET: // مثل مجمع الإهلاك
        return 'CREDIT';

      default:
        return 'DEBIT';
    }
  }

  // ✅ طبيعة الحساب: مدين أو دائن
  private getAccountNature(type: AccountType): 'DEBIT' | 'CREDIT' {
    switch (type) {
      case AccountType.ASSET: // أصول
      case AccountType.EXPENSE: // مصروفات
      case AccountType.CONTRA_REVENUE: // خصومات المبيعات
        // طبيعتها مدينة
        return 'DEBIT';

      case AccountType.LIABILITY: // التزامات
      case AccountType.EQUITY: // حقوق ملكية
      case AccountType.REVENUE: // إيرادات
      case AccountType.CONTRA_ASSET: // مجمع اهلاك... إلخ
        // طبيعتها دائنة
        return 'CREDIT';

      default:
        // احتياطاً لو ظهر نوع جديد مستقبلاً
        return 'DEBIT';
    }
  }

  // ✅ حساب رصيد موقَّع حسب طبيعة الحساب
  private calcSignedBalance(
    nature: 'DEBIT' | 'CREDIT',
    debit: Prisma.Decimal | null | undefined,
    credit: Prisma.Decimal | null | undefined,
  ): Prisma.Decimal {
    const d = debit ?? new Prisma.Decimal(0);
    const c = credit ?? new Prisma.Decimal(0);

    // حسابات طبيعتها مدينة: الرصيد = مدين - دائن
    // حسابات طبيعتها دائنة: الرصيد = دائن - مدين
    return nature === 'DEBIT' ? d.minus(c) : c.minus(d);
  }

  async getLedger(
    hospitalId: number,
    accountId: number,
    params: { from: Date; to: Date },
  ): Promise<LedgerResponseDto> {
    const { from, to } = params;

    if (
      !(from instanceof Date) ||
      Number.isNaN(from.getTime()) ||
      !(to instanceof Date) ||
      Number.isNaN(to.getTime())
    ) {
      throw new BadRequestException('صيغة التاريخ غير صحيحة.');
    }

    if (to < from) {
      throw new BadRequestException(
        'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.',
      );
    }

    // 1) جلب معلومات الحساب
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        hospitalId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    });

    if (!account) {
      throw new NotFoundException('الحساب غير موجود أو لا ينتمي لهذه المنشأة.');
    }

    const normalSide = this.getNormalSide(account.type);

    // 2) رصيد افتتاحي = مجموع الحركات قبل بداية الفترة
    //    (يشمل أي قيود للأرصدة الافتتاحية طالما مسجلة كقيود عادية)
    const prevAgg = await this.prisma.accountingEntryLine.aggregate({
      where: {
        accountId,
        entry: {
          hospitalId,
          entryDate: {
            lt: from,
          },
          // لو عندك حقل status للقيود (POSTED فقط) يمكن تضيفه هنا
          // status: 'POSTED',
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const prevDebit = Number(prevAgg._sum?.debit ?? 0);
    const prevCredit = Number(prevAgg._sum?.credit ?? 0);

    // رصيد موجه حسب الطبيعة (مدين/دائن)
    let openingBalance =
      normalSide === 'DEBIT' ? prevDebit - prevCredit : prevCredit - prevDebit;

    // 3) جلب القيود داخل الفترة
    const linesDb = await this.prisma.accountingEntryLine.findMany({
      where: {
        accountId,
        entry: {
          hospitalId,
          entryDate: {
            gte: from,
            lte: to,
          },
        },
      },
      include: {
        entry: true,
      },
      orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
    });

    const lines: LedgerLineDto[] = [];

    // 🧮 نبدأ الرصيد التراكمي من الرصيد الافتتاحي
    let running = openingBalance;

    // 4) إضافة سطر "رصيد سابق" في بداية الكشف (لو في رصيد فعلاً)
    if (openingBalance !== 0) {
      lines.push({
        id: 0, // رقم وهمي للسطر الافتتاحي
        entryDate: from,
        description: `رصيد سابق حتى ${from.toISOString().substring(0, 10)}`,
        reference: null,
        sourceModule: null,
        sourceId: null,
        debit: 0,
        credit: 0,
        balance: running,
        isOpening: true,
      });
    }

    // 5) بناء سطور القيود الحقيقية + تجميع إجمالي مدين/دائن
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of linesDb) {
      const debit = Number((line as any).debit ?? 0);
      const credit = Number((line as any).credit ?? 0);
      const entry: any = line.entry;

      if (normalSide === 'DEBIT') {
        running += debit - credit;
      } else {
        running += credit - debit;
      }

      totalDebit += debit;
      totalCredit += credit;

      lines.push({
        id: line.id,
        entryDate: entry.entryDate,
        description: entry.description ?? null,
        reference: entry.reference ?? null,
        sourceModule: entry.sourceModule ?? null,
        sourceId: entry.sourceId ?? null,
        debit,
        credit,
        balance: running,
      });
    }

    // 6) رصيد إغلاق الفترة
    const closingBalance =
      normalSide === 'DEBIT'
        ? openingBalance + totalDebit - totalCredit
        : openingBalance + totalCredit - totalDebit;

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      from,
      to,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      lines,
    };
  }

  private async getAccountByCode(hospitalId: number, code: string) {
    const acc = await this.prisma.account.findFirst({
      where: { hospitalId, code },
    });
    if (!acc) {
      throw new Error(
        `Account with code ${code} not found for hospital ${hospitalId}. تأكد من وجود دليل الحسابات الافتراضي.`,
      );
    }
    return acc;
  }

  /**
   * قيد فاتورة مريض:
   *
   * Debit  ذمم المرضى (Receivable Patients)        = netReceivable
   * Debit  خصومات مسموح بها (Discount Allowed)    = discountAmount (لو > 0)
   * Credit إيرادات (حسب نوع الخدمة)               = totalAmount (مجمعة من Charges)
   *
   * netReceivable = totalAmount - discountAmount
   */
  async recordInvoiceEntry(params: {
    invoiceId: number;
    hospitalId: number;
    userId?: number;
    // ✅ باراميترات جديدة لدعم التقسيم
    patientShare?: number;
    insuranceShare?: number;
    insuranceProviderId?: number;
  }) {
    const { invoiceId, hospitalId, userId } = params;

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId,
      },
      include: {
        charges: { include: { serviceItem: true } },
        insuranceProvider: { include: { account: true } }, // ✅ جلب حساب شركة التأمين
      },
    });

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة.');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('لا يمكن تسجيل قيد لفتورة ملغاة.');
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      this.logger.log(
        `Skipping accounting entry for draft invoice #${invoice.id}`,
      );
      return;
    }

    const totalAmount = Number(invoice.totalAmount ?? 0);

    // ✅ تحديد القيم (إما من الباراميترز أو من الفاتورة المخزنة)
    const pShare = params.patientShare ?? Number(invoice.patientShare);
    const iShare = params.insuranceShare ?? Number(invoice.insuranceShare);
    const iProvId = params.insuranceProviderId ?? invoice.insuranceProviderId;

    if (totalAmount <= 0) {
      throw new BadRequestException(
        'قيمة الفاتورة المحاسبية يجب أن تكون أكبر من صفر.',
      );
    }

    const entryDate =
      (invoice as any).issueDate ??
      (invoice as any).invoiceDate ??
      invoice.createdAt;

    const { financialYear, period } = await this.ensureOpenFinancialPeriod(
      hospitalId,
      entryDate as Date,
    );
    const fyId = financialYear.id;
    const fpId = period.id;

    // 1) تجميع الإيرادات (الجانب الدائن)
    const revenueMap = new Map<SystemAccountKey, number>();

    if (invoice.charges && invoice.charges.length > 0) {
      for (const ch of invoice.charges) {
        const lineAmount = Number(ch.totalAmount ?? 0);
        if (!lineAmount) continue;

        let key: SystemAccountKey = SystemAccountKey.REVENUE_OUTPATIENT;

        if (ch.serviceItem) {
          key = this.mapServiceTypeToRevenueKey(
            (ch.serviceItem.type as ServiceType) ?? null,
          );
        }
        revenueMap.set(key, (revenueMap.get(key) ?? 0) + lineAmount);
      }
    } else {
      revenueMap.set(SystemAccountKey.REVENUE_OUTPATIENT, totalAmount);
    }

    // معالجة الفروق البسيطة
    let revSum = 0;
    for (const amount of revenueMap.values()) revSum += amount;
    const diff = totalAmount - revSum;
    if (Math.abs(diff) > 0.0001) {
      revenueMap.set(
        SystemAccountKey.REVENUE_OUTPATIENT,
        (revenueMap.get(SystemAccountKey.REVENUE_OUTPATIENT) ?? 0) + diff,
      );
    }

    // 2) إعداد الجانب المدين (Debit Side)
    const debitLines: Prisma.AccountingEntryLineCreateManyInput[] = [];

    // أ) ذمم المرضى
    if (pShare > 0) {
      const arPatientAcc = await this.getSystemAccountOrThrow(
        hospitalId,
        SystemAccountKey.RECEIVABLE_PATIENTS,
      );
      debitLines.push({
        // سيتم ملء entryId لاحقاً
        entryId: 0,
        accountId: arPatientAcc.id,
        debit: new Prisma.Decimal(pShare),
        credit: new Prisma.Decimal(0),
        description: 'استحقاق على المريض - فاتورة',
      });
    }

    // ب) ذمم التأمين
    if (iShare > 0) {
      let insuranceAccId: number;

      // نحاول استخدام الحساب الخاص بالشركة إذا وجد
      if (invoice.insuranceProvider?.accountId) {
        insuranceAccId = invoice.insuranceProvider.accountId;
      } else {
        // وإلا نستخدم حساب ذمم التأمين العام
        const generalInsAcc = await this.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.RECEIVABLE_INSURANCE,
        );
        insuranceAccId = generalInsAcc.id;
      }

      debitLines.push({
        entryId: 0,
        accountId: insuranceAccId,
        debit: new Prisma.Decimal(iShare),
        credit: new Prisma.Decimal(0),
        description: `استحقاق تأمين (${invoice.insuranceProvider?.name})`,
      });
    }

    // 3) إعداد الجانب الدائن (Credit Side - Revenues)
    const creditLines: Prisma.AccountingEntryLineCreateManyInput[] = [];
    for (const [key, amount] of revenueMap.entries()) {
      const acc = await this.getSystemAccountOrThrow(hospitalId, key);
      creditLines.push({
        entryId: 0,
        accountId: acc.id,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(amount),
        description: 'إيرادات خدمات طبية',
      });
    }

    // 4) الحفظ في قاعدة البيانات
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.accountingEntry.findFirst({
        where: {
          hospitalId,
          sourceModule: AccountingSourceModule.BILLING,
          sourceId: invoiceId,
        },
      });

      let entryId: number;

      if (existing) {
        entryId = existing.id;
        await this.validateEntryModification(entryId, hospitalId, tx);
        await tx.accountingEntryLine.deleteMany({ where: { entryId } });
      } else {
        const created = await tx.accountingEntry.create({
          data: {
            hospitalId,
            financialYearId: fyId!,
            financialPeriodId: fpId!,
            entryDate,
            description: `قيد فاتورة رقم ${invoice.id} ${iShare > 0 ? '(تأمين)' : ''}`,
            sourceModule: AccountingSourceModule.BILLING,
            sourceId: invoice.id,
            createdById: userId ?? null,
          },
        });
        entryId = created.id;
      }

      // دمج السطور وتحديث رقم القيد
      const allLines = [...debitLines, ...creditLines].map((l) => ({
        ...l,
        entryId,
      }));

      if (allLines.length > 0) {
        await tx.accountingEntryLine.createMany({ data: allLines });
      }
    });
  }

  /**
   * قيد تحصيل دفعة على فاتورة:
   *
   * لو الدفع نقدًا:
   *   Debit  الصندوق الرئيسي (CASH_MAIN)
   *   Credit ذمم المرضى (RECEIVABLE_PATIENTS)
   *
   * لو الدفع بطاقة / تحويل:
   *   Debit  البنك الرئيسي (BANK_MAIN)
   *   Credit ذمم المرضى
   */
  async recordPaymentEntry(params: {
    paymentId: number;
    hospitalId: number;
    userId: number;
  }) {
    const { paymentId, hospitalId, userId } = params;

    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        hospitalId,
      },
      include: {
        invoice: true,
      },
    });

    if (!payment || !payment.invoice) {
      throw new NotFoundException(
        'الدفعة أو الفاتورة المرتبطة بها غير موجودة.',
      );
    }

    const invoice = payment.invoice;
    const amount = Number(payment.amount ?? 0);

    if (amount <= 0) {
      throw new BadRequestException(
        'قيمة الدفعة يجب أن تكون أكبر من صفر لتسجيل قيد محاسبي.',
      );
    }

    // ✅ نعتمد على تاريخ الدفعة نفسه، ونتأكد أنه داخل سنة/فترة مفتوحة
    const entryDate = payment.paidAt ?? new Date();
    const { financialYear, period } = await this.ensureOpenFinancialPeriod(
      hospitalId,
      entryDate,
    );

    const arAccount = await this.getSystemAccountOrThrow(
      hospitalId,
      SystemAccountKey.RECEIVABLE_PATIENTS,
    );

    let debitKey: SystemAccountKey;

    switch (payment.method) {
      case PaymentMethod.CASH:
        debitKey = SystemAccountKey.CASH_MAIN;
        break;

      case PaymentMethod.CARD:
      case PaymentMethod.TRANSFER:
        debitKey = SystemAccountKey.BANK_MAIN;
        break;

      default:
        // INSURANCE / OTHER حالياً نعتبرها نقدية، ويمكن تخصيصها لاحقاً
        debitKey = SystemAccountKey.CASH_MAIN;
        break;
    }

    const debitAccount = await this.getSystemAccountOrThrow(
      hospitalId,
      debitKey,
    );

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.accountingEntry.findFirst({
        where: {
          hospitalId,
          sourceModule: AccountingSourceModule.BILLING, // 👈 استبدال CASHIER بـ BILLING
          sourceId: paymentId,
        },
      });

      let entryId: number;

      if (existing) {
        entryId = existing.id;
        await tx.accountingEntryLine.deleteMany({
          where: { entryId },
        });
      } else {
        const created = await tx.accountingEntry.create({
          data: {
            hospitalId,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
            entryDate,
            description: `تحصيل دفعة على الفاتورة رقم ${invoice.id}`,
            sourceModule: AccountingSourceModule.BILLING,
            sourceId: payment.id,
            createdById: userId,
          },
        });
        entryId = created.id;
      }

      const lines: Prisma.AccountingEntryLineCreateManyInput[] = [
        {
          entryId,
          accountId: debitAccount.id,
          debit: amount,
          credit: 0,
          description: 'تحصيل نقدي/بنكي من المريض',
        },
        {
          entryId,
          accountId: arAccount.id,
          debit: 0,
          credit: amount,
          description: 'تسوية ذمم المرضى',
        },
      ];

      await tx.accountingEntryLine.createMany({
        data: lines,
      });
    });
  }

  // ==============================
  //  عرض القيود المحاسبية (دفتر اليومية)
  // ==============================
  async listEntries(params: {
    hospitalId: number;
    fromDate?: string;
    toDate?: string;
    sourceModule?: AccountingSourceModule;
    page?: number; // 👈 نستخدم page بدلاً من offset
    limit?: number;
  }) {
    const {
      hospitalId,
      fromDate,
      toDate,
      sourceModule,
      page = 1,
      limit = 30,
    } = params;

    const skip = (page - 1) * limit; // حساب السجلات المطلوب تخطيها

    const where: Prisma.AccountingEntryWhereInput = {
      hospitalId,
    };

    // فلتر التاريخ الاحترافي
    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (!Number.isNaN(d.getTime())) {
        dateFilter.gte = startOfDayUtc(d);
      }
    }
    if (toDate) {
      const d = new Date(toDate);
      if (!Number.isNaN(d.getTime())) {
        const next = addDaysUtc(d, 1);
        dateFilter.lt = startOfDayUtc(next);
      }
    }

    if (dateFilter.gte || dateFilter.lt) {
      where.entryDate = dateFilter;
    }

    if (sourceModule) {
      where.sourceModule = sourceModule;
    }

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.accountingEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
        skip, // 👈 استخدام skip المحسوب
        take: limit,
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      }),
      this.prisma.accountingEntry.count({ where }),
    ]);

    // إرجاع الهيكلية الموحدة للنظام
    return {
      items,
      meta: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  // ==============================
  //  ميزان المراجعة (Trial Balance)
  // ==============================
  async getTrialBalance(params: {
    hospitalId: number;
    fromDate?: Date;
    toDate?: Date;
    costCenterId?: number;
  }) {
    const { hospitalId, costCenterId } = params;
    let { fromDate, toDate } = params;

    await this.ensureDefaultAccounts(hospitalId);

    const entryWhere: Prisma.AccountingEntryWhereInput = {
      hospitalId,
    };

    if (fromDate || toDate) {
      const df: Prisma.DateTimeFilter = {};
      if (fromDate) {
        df.gte = startOfDayUtc(fromDate);
      }
      if (toDate) {
        const next = addDaysUtc(toDate, 1);
        df.lt = startOfDayUtc(next); // ⬅️ حتى نهاية اليوم
      }
      entryWhere.entryDate = df;
    }

    // Filter by CostCenter on the LINE level if provided
    const lineWhere: Prisma.AccountingEntryLineWhereInput = {
      entry: entryWhere,
    };

    if (costCenterId) {
      lineWhere.costCenterId = costCenterId;
    }

    const grouped = await this.prisma.accountingEntryLine.groupBy({
      by: ['accountId'],
      where: lineWhere,
      _sum: {
        debit: true,
        credit: true,
      },
    });

    if (grouped.length === 0) {
      return {
        rows: [],
        totals: {
          totalDebit: 0,
          totalCredit: 0,
        },
      };
    }

    const accountIds = grouped.map((g) => g.accountId);

    const accounts = await this.prisma.account.findMany({
      where: {
        hospitalId,
        id: { in: accountIds },
      },
    });

    const rows = grouped.map((g) => {
      const acc = accounts.find((a) => a.id === g.accountId);
      const debit = Number(g._sum.debit ?? 0);
      const credit = Number(g._sum.credit ?? 0);
      const balance = debit - credit;

      return {
        accountId: g.accountId,
        code: acc?.code ?? '',
        name: acc?.name ?? '',
        type: acc?.type ?? '',
        debit,
        credit,
        balance,
      };
    });

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

    return {
      rows,
      totals: {
        totalDebit,
        totalCredit,
      },
    };
  }

  // async getAccountLedger(params: {
  //   hospitalId: number;
  //   accountId: number;
  //   fromDate?: Date;
  //   toDate?: Date;
  // }): Promise<LedgerResponseDto> {
  //   const { hospitalId, accountId } = params;
  //   let { fromDate, toDate } = params;

  //   const account = await this.prisma.account.findFirst({
  //     where: { id: accountId, hospitalId },
  //     select: { id: true, code: true, name: true, type: true },
  //   });

  //   if (!account) {
  //     throw new NotFoundException('الحساب غير موجود في هذه المؤسسة.');
  //   }

  //   if (!toDate) {
  //     toDate = new Date();
  //   }

  //   const lines = await this.prisma.accountingEntryLine.findMany({
  //     where: {
  //       accountId,
  //       entry: {
  //         hospitalId,
  //         entryDate: { lte: toDate },
  //       },
  //     },
  //     include: {
  //       entry: true,
  //     },
  //     orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
  //   });

  //   if (!fromDate) {
  //     fromDate =
  //       lines[0]?.entry.entryDate ?? new Date(toDate.getFullYear(), 0, 1);
  //   }

  //   const before: {
  //     date: Date;
  //     debit: Prisma.Decimal;
  //     credit: Prisma.Decimal;
  //   }[] = [];

  //   const insideRaw: {
  //     date: Date;
  //     entryId: number;
  //     description?: string | null;
  //     debit: Prisma.Decimal;
  //     credit: Prisma.Decimal;
  //   }[] = [];

  //   for (const l of lines) {
  //     const row = {
  //       date: l.entry.entryDate,
  //       entryId: l.entryId,
  //       description: l.description ?? l.entry.description,
  //       debit: l.debit,
  //       credit: l.credit,
  //     };

  //     if (row.date < fromDate) {
  //       before.push({
  //         date: row.date,
  //         debit: row.debit,
  //         credit: row.credit,
  //       });
  //     } else {
  //       insideRaw.push(row);
  //     }
  //   }

  //   let openingBalance = before.reduce(
  //     (acc, r) => acc.plus(r.debit).minus(r.credit),
  //     new Prisma.Decimal(0),
  //   );

  //   let runningBalance = openingBalance;
  //   let totalDebit = new Prisma.Decimal(0);
  //   let totalCredit = new Prisma.Decimal(0);

  //   const linesDto: LedgerLineDto[] = insideRaw.map((r) => {
  //     runningBalance = runningBalance.plus(r.debit).minus(r.credit);
  //     totalDebit = totalDebit.plus(r.debit);
  //     totalCredit = totalCredit.plus(r.credit);

  //     return {
  //       date: r.date.toISOString(),
  //       entryId: r.entryId,
  //       description: r.description ?? undefined,
  //       debit: Number(r.debit),
  //       credit: Number(r.credit),
  //       balance: Number(runningBalance),
  //     };
  //   });

  //   const result: LedgerResponseDto = {
  //     account: {
  //       id: account.id,
  //       code: account.code,
  //       name: account.name,
  //       type: account.type,
  //     },
  //     fromDate: fromDate.toISOString(),
  //     toDate: toDate.toISOString(),
  //     openingBalance: Number(openingBalance),
  //     closingBalance: Number(runningBalance),
  //     totalDebit: Number(totalDebit),
  //     totalCredit: Number(totalCredit),
  //     lines: linesDto,
  //   };

  //   return result;
  // }

  async saveOpeningBalances(params: {
    hospitalId: number;
    userId?: number;
    dto: SaveOpeningBalancesDto;
  }) {
    const { hospitalId, userId, dto } = params;
    const { financialYearId, entryDate, lines } = dto;

    if (!lines || lines.length === 0) {
      throw new BadRequestException(
        'يجب إدخال سطر واحد على الأقل للأرصدة الافتتاحية.',
      );
    }

    // 1) التأكد من أن السنة المالية موجودة وتتبع نفس المستشفى
    const year = await this.prisma.financialYear.findFirst({
      where: { id: financialYearId, hospitalId },
    });

    if (!year) {
      throw new NotFoundException('السنة المالية غير موجودة لهذه المؤسسة.');
    }

    // ✅ لا نسمح بأرصدة افتتاحية لسنة غير مفتوحة
    if (year.status !== FinancialYearStatus.OPEN) {
      throw new BadRequestException(
        'لا يمكن إدخال أرصدة افتتاحية لسنة غير مفتوحة.',
      );
    }

    // ✅ نضمن أن التاريخ داخل حدود السنة ونستعمل startOfDayUtc
    const rawEntryDate = entryDate ? new Date(entryDate) : year.startDate;
    if (Number.isNaN(rawEntryDate.getTime())) {
      throw new BadRequestException('تاريخ القيد الافتتاحي غير صالح.');
    }
    if (rawEntryDate < year.startDate || rawEntryDate > year.endDate) {
      throw new BadRequestException(
        'تاريخ الأرصدة الافتتاحية يجب أن يكون داخل حدود السنة المالية.',
      );
    }

    // 2) التاريخ: إما من الطلب أو startDate للسنة
    const entryDateObj = startOfDayUtc(rawEntryDate);

    // 3) التحقق من الحسابات
    const accountIds = [...new Set(lines.map((l) => l.accountId))];

    const accounts = await this.prisma.account.findMany({
      where: {
        hospitalId,
        id: { in: accountIds },
        isActive: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        'بعض الحسابات غير موجودة أو غير فعالة في هذه المؤسسة.',
      );
    }

    // (اختياري) السماح فقط بحسابات الميزانية: أصول / التزامات / حقوق ملكية
    const allowedTypes: AccountType[] = [
      AccountType.ASSET,
      AccountType.LIABILITY,
      AccountType.EQUITY,
      AccountType.CONTRA_ASSET,
    ];

    const invalidAccounts = accounts.filter(
      (a) => !allowedTypes.includes(a.type),
    );
    if (invalidAccounts.length > 0) {
      throw new BadRequestException(
        'يُفضّل استخدام الأصول والالتزامات وحقوق الملكية فقط في الأرصدة الافتتاحية.',
      );
    }

    // 4) التحقق من توازن القيد (مجموع المدين = مجموع الدائن)
    const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
    const totalCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(
        'إجمالي المدين يجب أن يساوي إجمالي الدائن في الأرصدة الافتتاحية.',
      );
    }

    // 5) داخل Transaction:
    //    - حذف أي قيد افتتاحي سابق لهذه السنة
    //    - إنشاء قيد جديد مع السطور
    const result = await this.prisma.$transaction(async (tx) => {
      // حذف قيد افتتاحي قديم
      const existing = await tx.accountingEntry.findFirst({
        where: {
          hospitalId,
          financialYearId,
          sourceModule: AccountingSourceModule.OPENING,
        },
      });

      if (existing) {
        await tx.accountingEntryLine.deleteMany({
          where: { entryId: existing.id },
        });
        await tx.accountingEntry.delete({ where: { id: existing.id } });
      }

      // إنشاء القيد الجديد
      const entry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          entryDate: entryDateObj,
          description: `أرصدة افتتاحية للسنة المالية ${year.code}`,
          sourceModule: AccountingSourceModule.OPENING,
          sourceId: null,
          financialYearId: year.id,
          financialPeriodId: null, // أو أول فترة في السنة لو حابب تربطها
          createdById: userId,
          lines: {
            create: lines.map((l) => ({
              accountId: l.accountId,
              debit: new Prisma.Decimal(l.debit || 0),
              credit: new Prisma.Decimal(l.credit || 0),
              description: l.description || 'رصيد افتتاحي',
            })),
          },
        },
        include: {
          lines: true,
        },
      });

      return entry;
    });

    return {
      success: true,
      entryId: result.id,
      totalDebit,
      totalCredit,
      linesCount: result.lines.length,
    };
  }

  /**
   * توليد أرصدة افتتاحية تلقائياً لسنة جديدة من آخر سنة مغلقة قبلها.
   *
   * الفكرة:
   *  - نحدد السنة الهدف (الجديدة) ويجب أن تكون OPEN.
   *  - نبحث عن آخر سنة مغلقة (CLOSED) لنفس المستشفى تنتهي قبل بداية السنة الجديدة.
   *  - نجمع أرصدة حسابات الميزانية (أصول / التزامات / حقوق ملكية / Contra Asset)
   *    من قيود السنة المغلقة.
   *  - نولّد قيد افتتاحي واحد في السنة الجديدة بنفس الرصيد لكل حساب.
   *  - نستخدم saveOpeningBalances داخلياً حتى لا نكرر منطق التحقق.
   */
  async generateOpeningBalancesFromLastClosedYear(params: {
    hospitalId: number;
    userId?: number;
    targetFinancialYearId: number;
    entryDate?: string; // اختياري، لو لم يُرسل نستخدم startDate للسنة الجديدة
  }): Promise<AutoOpeningResult> {
    const { hospitalId, userId, targetFinancialYearId, entryDate } = params;

    // 1) جلب السنة الهدف (الجديدة)
    const targetYear = await this.prisma.financialYear.findFirst({
      where: {
        id: targetFinancialYearId,
        hospitalId,
        deletedAt: null,
      },
    });

    if (!targetYear) {
      throw new NotFoundException(
        'السنة المالية الهدف غير موجودة لهذه المؤسسة.',
      );
    }

    if (targetYear.status !== FinancialYearStatus.OPEN) {
      throw new BadRequestException(
        'يجب أن تكون السنة المالية الهدف في حالة OPEN لإدخال الأرصدة الافتتاحية.',
      );
    }

    // 2) إيجاد آخر سنة مغلقة قبل بداية السنة الهدف
    const sourceYear = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        status: FinancialYearStatus.CLOSED,
        endDate: {
          lt: targetYear.startDate,
        },
      },
      orderBy: {
        endDate: 'desc',
      },
    });

    if (!sourceYear) {
      throw new BadRequestException(
        'لا توجد سنة مالية مغلقة سابقة قبل السنة الهدف لترحيل الأرصدة منها.',
      );
    }

    // 3) تجميع أرصدة حسابات الميزانية في السنة المغلقة
    const balanceSheetTypes: AccountType[] = [
      AccountType.ASSET,
      AccountType.LIABILITY,
      AccountType.EQUITY,
      AccountType.CONTRA_ASSET,
    ];

    const grouped = await this.prisma.accountingEntryLine.groupBy({
      by: ['accountId', 'costCenterId'],
      where: {
        entry: {
          hospitalId,
          financialYearId: sourceYear.id,
        },
        account: {
          type: {
            in: balanceSheetTypes,
          },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    if (!grouped.length) {
      throw new BadRequestException(
        'لا توجد أرصدة لحسابات الميزانية في السنة المغلقة لترحيلها.',
      );
    }

    const accountIds = Array.from(new Set(grouped.map((g) => g.accountId)));

    const accounts = await this.prisma.account.findMany({
      where: {
        hospitalId,
        id: { in: accountIds },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    });

    const accMap = new Map<number, (typeof accounts)[number]>();
    for (const a of accounts) {
      accMap.set(a.id, a);
    }

    // 4) بناء سطور الأرصدة الافتتاحية (debit/credit) لكل حساب
    const openingLines: {
      accountId: number;
      costCenterId?: number | null;
      debit: number;
      credit: number;
      description: string;
    }[] = [];

    let totalDebit = 0;
    let totalCredit = 0;

    for (const g of grouped) {
      const acc = accMap.get(g.accountId);
      if (!acc) continue;

      const debit = Number(g._sum.debit ?? 0);
      const credit = Number(g._sum.credit ?? 0);
      const costCenterId = g.costCenterId;

      // الرصيد = مدين - دائن
      const net = debit - credit;

      // نتجاهل الحسابات التي أصبحت صفر
      if (Math.abs(net) < 0.000001) continue;

      let openDebit = 0;
      let openCredit = 0;

      if (net > 0) {
        // رصيد مدين
        openDebit = net;
      } else if (net < 0) {
        // رصيد دائن
        openCredit = Math.abs(net);
      }

      if (openDebit === 0 && openCredit === 0) continue;

      openingLines.push({
        accountId: acc.id,
        costCenterId,
        debit: openDebit,
        credit: openCredit,
        description: `رصيد افتتاحي مرحّل من السنة ${sourceYear.code ?? sourceYear.name ?? ''}`,
      });

      totalDebit += openDebit;
      totalCredit += openCredit;
    }

    if (!openingLines.length) {
      throw new BadRequestException(
        'لا توجد أرصدة غير صفرية لحسابات الميزانية لترحيلها.',
      );
    }

    // للتأكد فقط (يفترض أن يكون متوازنًا دائمًا)
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      this.logger.error(
        `عدم توازن في قيد الأرصدة الافتتاحية: Debit=${totalDebit}, Credit=${totalCredit}`,
      );
      throw new BadRequestException(
        'قيد الأرصدة الافتتاحية الناتج غير متوازن. تحقق من البيانات.',
      );
    }

    // 5) تجهيز DTO واستخدام saveOpeningBalances حتى نستفيد من منطق التحقق الموجود
    const openingDto: SaveOpeningBalancesDto = {
      financialYearId: targetYear.id,
      entryDate: entryDate ?? targetYear.startDate.toISOString(),
      lines: openingLines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    };

    const result = await this.saveOpeningBalances({
      hospitalId,
      userId,
      dto: openingDto,
    });

    // 6) نُرجع معلومات مفيدة عن العملية
    return {
      fromFinancialYearId: sourceYear.id,
      fromFinancialYearCode:
        (sourceYear as any).code ?? sourceYear.name ?? null,
      toFinancialYearId: targetYear.id,
      toFinancialYearCode: (targetYear as any).code ?? targetYear.name ?? null,
      openingEntryId: result.entryId,
      totalDebit: result.totalDebit,
      totalCredit: result.totalCredit,
      linesCount: result.linesCount,
    };
  }

  /**
   * جلب السنة المالية الحالية المفتوحة + الفترة (الشهر) المفتوح لهذا التاريخ
   * نفس منطق FinancialYearsService.getOpenPeriodForDate لكن داخل AccountingService
   */
  async getOpenPeriodForDate(hospitalId: number, date: Date) {
    // 1) نجيب السنة المالية الحالية المفتوحة
    const fy = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        status: FinancialYearStatus.OPEN,
        isCurrent: true,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    if (!fy) {
      throw new BadRequestException(
        'لا توجد سنة مالية حالية مفتوحة تشمل هذا التاريخ.',
      );
    }

    // 2) نجيب كل الفترات المفتوحة لهذه السنة
    const periods = await this.prisma.financialPeriod.findMany({
      where: {
        financialYearId: fy.id,
        deletedAt: null,
        isOpen: true, // نترك شرط الفتح، فقط نغيّر منطق التاريخ
      },
      orderBy: { periodIndex: 'asc' },
    });

    if (!periods.length) {
      throw new BadRequestException(
        'لا توجد فترات (أشهر) مفتوحة في هذه السنة المالية.',
      );
    }

    // 3) نطبع التاريخ إلى "تاريخ فقط" بدون وقت
    const target = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    // 4) نبحث يدويًا عن الفترة التي يغطيها هذا التاريخ
    let match = periods.find((p) => {
      const start = new Date(
        p.monthStartDate.getFullYear(),
        p.monthStartDate.getMonth(),
        p.monthStartDate.getDate(),
      );
      const end = new Date(
        p.monthEndDate.getFullYear(),
        p.monthEndDate.getMonth(),
        p.monthEndDate.getDate(),
      );
      return target >= start && target <= end;
    });

    // 5) لو لأي سبب ما لقيناش فترة، نختار آخر فترة كحل احتياطي
    if (!match) {
      match = periods[periods.length - 1];
    }

    return { fy, period: match };
  }

  // ✅ الدالة الجديدة: تسجيل قيد تكلفة البضاعة المباعة (COGS)
  async recordCogsEntry(params: {
    sourceId: number; // DispenseRecordId or InvoiceId
    hospitalId: number;
    userId: number;
    totalCost: number;
    module: 'PHARMACY' | 'INVENTORY';
  }) {
    const { sourceId, hospitalId, userId, totalCost, module } = params;

    // تكلفة صفرية أو سالبة لا تحتاج لقيد
    if (totalCost <= 0.0001) return;

    // 1. تحديد الحسابات (Debit: COGS, Credit: Inventory)
    let inventoryKey: SystemAccountKey;
    let cogsKey: SystemAccountKey;

    if (module === 'PHARMACY') {
      inventoryKey = SystemAccountKey.INVENTORY_DRUGS; // دائن (نقص أصل)
      cogsKey = SystemAccountKey.COGS_DRUGS; // مدين (مصروف)
    } else {
      // افتراضياً للمستلزمات
      inventoryKey = SystemAccountKey.INVENTORY_SUPPLIES;
      cogsKey = SystemAccountKey.COGS_SUPPLIES;
    }

    const inventoryAccount = await this.getSystemAccountOrThrow(
      hospitalId,
      inventoryKey,
    );
    const cogsAccount = await this.getSystemAccountOrThrow(hospitalId, cogsKey);

    // 2. تحديد الفترة المالية
    // نستخدم تاريخ اليوم كتاريخ للقيد (أو مرر التاريخ في الـ params لو أردت دقة أكبر)
    const entryDate = new Date();
    const { fy, period } = await this.getOpenPeriodForDate(
      hospitalId,
      entryDate,
    );

    // 3. إنشاء القيد
    await this.prisma.accountingEntry.create({
      data: {
        hospitalId,
        entryDate,
        description: `إثبات تكلفة البضاعة المباعة (COGS) - ${
          module === 'PHARMACY' ? 'صرف دواء' : 'صرف مخزني'
        } رقم ${sourceId}`,
        sourceModule: AccountingSourceModule.INVENTORY, // نعتبرها حركة مخزنية
        sourceId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: cogsAccount.id,
              debit: new Prisma.Decimal(totalCost),
              credit: new Prisma.Decimal(0),
              description: 'ت. بضاعة مباعة (COGS)',
            },
            {
              accountId: inventoryAccount.id,
              debit: new Prisma.Decimal(0),
              credit: new Prisma.Decimal(totalCost),
              description: 'نقص مخزون (Inventory)',
            },
          ],
        },
      },
    });

    this.logger.log(
      `COGS Entry created for ${module} #${sourceId}, Cost: ${totalCost}`,
    );
  }

  // ==============================
  //  إنشاء قيد يدوي (Manual Journal Entry)
  // ==============================
  async createManualEntry(params: {
    hospitalId: number;
    userId?: number;
    dto: CreateManualEntryDto;
  }) {
    const { hospitalId, userId, dto } = params;
    const { entryDate, description, lines } = dto;

    if (!lines || lines.length === 0) {
      throw new BadRequestException('يجب إدخال سطر واحد على الأقل في القيد.');
    }

    if (!entryDate) {
      throw new BadRequestException('يجب تحديد تاريخ القيد.');
    }

    const dateObj = new Date(entryDate);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException('تاريخ القيد غير صالح.');
    }

    // ✅ الحماية الجديدة: التحقق من أن الفترة مفتوحة
    // لاحظ: هذه الدالة ترجع الـ Period و Year، نستخدمهم لربط القيد
    const { financialYear, period } = await this.validateDateInOpenPeriod(
      hospitalId,
      dateObj,
    );

    // ✅ نطبّع التاريخ ونتأكد من سنة/فترة مفتوحة
    const normalizedDate = startOfDayUtc(dateObj);
    // const { financialYear, period } = await this.ensureOpenFinancialPeriod(
    //   hospitalId,
    //   normalizedDate,
    // );

    const accountIds = [...new Set(lines.map((l) => l.accountId))];

    const accounts = await this.prisma.account.findMany({
      where: {
        hospitalId,
        id: { in: accountIds },
        isActive: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        'بعض الحسابات غير موجودة أو غير فعالة في هذه المؤسسة.',
      );
    }

    const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
    const totalCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(
        'إجمالي المدين يجب أن يساوي إجمالي الدائن في القيد.',
      );
    }

    const entry = await this.prisma.accountingEntry.create({
      data: {
        hospitalId,
        entryDate: normalizedDate,
        description: description || 'قيد يدوي',
        sourceModule: AccountingSourceModule.MANUAL,
        sourceId: null,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        createdById: userId ?? null,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: new Prisma.Decimal(l.debit || 0),
            credit: new Prisma.Decimal(l.credit || 0),
            description: l.description || null,
            costCenterId: l.costCenterId || null,
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    this.logger.log(
      `Created manual accounting entry #${entry.id} for hospital ${hospitalId}`,
    );

    return {
      success: true,
      entryId: entry.id,
      totalDebit,
      totalCredit,
      linesCount: entry.lines.length,
    };
  }

  // ==============================
  //  قائمة مبسّطة بالحسابات (id + code + name)
  //  لاستخدامها في الأرصدة الافتتاحية وغيرها
  // ==============================
  async listAccountsLite(hospitalId: number) {
    return this.prisma.account.findMany({
      where: {
        hospitalId,
        isActive: true,
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }

  // ==============================
  //  دليل الحسابات
  // ==============================

  async listAccounts(hospitalId: number) {
    return this.prisma.account.findMany({
      where: { hospitalId },
      orderBy: [{ code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createAccount(hospitalId: number, dto: CreateAccountDto) {
    // التأكد من عدم تكرار الكود في نفس المستشفى
    const existingCode = await this.prisma.account.findFirst({
      where: { hospitalId, code: dto.code },
    });
    if (existingCode) {
      throw new BadRequestException('يوجد حساب آخر بنفس الكود في هذه المؤسسة.');
    }

    if (dto.parentId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: dto.parentId, hospitalId },
      });
      if (!parent) {
        throw new BadRequestException('الحساب الأب غير موجود في هذه المؤسسة.');
      }
    }

    return this.prisma.account.create({
      data: {
        hospitalId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
        isActive: true,
      },
    });
  }

  async updateAccount(
    hospitalId: number,
    accountId: number,
    dto: UpdateAccountDto,
  ) {
    const acc = await this.prisma.account.findFirst({
      where: { id: accountId, hospitalId },
    });

    if (!acc) {
      throw new NotFoundException('الحساب غير موجود في هذه المؤسسة.');
    }

    // لو فيه تغيير للكود، تأكد من عدم التكرار
    if (dto.code && dto.code !== acc.code) {
      const dup = await this.prisma.account.findFirst({
        where: { hospitalId, code: dto.code },
      });
      if (dup) {
        throw new BadRequestException(
          'يوجد حساب آخر بنفس الكود في هذه المؤسسة.',
        );
      }
    }

    // التحقق من الأب
    if (dto.parentId) {
      if (dto.parentId === acc.id) {
        throw new BadRequestException('لا يمكن أن يكون الحساب أبًا لنفسه.');
      }
      const parent = await this.prisma.account.findFirst({
        where: { id: dto.parentId, hospitalId },
      });
      if (!parent) {
        throw new BadRequestException('الحساب الأب غير موجود في هذه المؤسسة.');
      }
    }

    // (اختياري) منع تغيير نوع الحساب لو عليه قيود
    if (dto.type && dto.type !== acc.type) {
      const linesCount = await this.prisma.accountingEntryLine.count({
        where: { accountId: acc.id },
      });
      if (linesCount > 0) {
        throw new BadRequestException(
          'لا يمكن تغيير نوع الحساب لأنه مستخدم في قيود محاسبية.',
        );
      }
    }

    return this.prisma.account.update({
      where: { id: acc.id },
      data: {
        code: dto.code ?? acc.code,
        name: dto.name ?? acc.name,
        type: dto.type ?? acc.type,
        parentId: dto.parentId ?? acc.parentId,
      },
    });
  }

  async toggleAccountActive(hospitalId: number, accountId: number) {
    const acc = await this.prisma.account.findFirst({
      where: { id: accountId, hospitalId },
    });

    if (!acc) {
      throw new NotFoundException('الحساب غير موجود في هذه المؤسسة.');
    }

    // لو نحاول تعطيل حساب عليه قيود، هذا مقبول غالبًا (نمنع فقط الحذف)
    return this.prisma.account.update({
      where: { id: acc.id },
      data: {
        isActive: !acc.isActive,
      },
    });
  }

  // /**
  //  * إقفال سنة مالية:
  //  * - يجمع حركات الإيرادات والمصروفات لتلك السنة
  //  * - ينشئ قيد إقفال إلى حساب صافي الربح/الخسارة
  //  * - ينشئ قيد ترحيل صافي الربح/الخسارة إلى الأرباح المرحلة
  //  * - يحدّث حالة السنة إلى CLOSED
  //  */
  // async closeFinancialYear(params: {
  //   hospitalId: number;
  //   financialYearId: number;
  //   userId?: number;
  // }) {
  //   const { hospitalId, financialYearId, userId } = params;

  //   // 1) التحقق من وجود السنة وأنها OPEN وتتبع نفس المستشفى
  //   const year = await this.prisma.financialYear.findFirst({
  //     where: {
  //       id: financialYearId,
  //       hospitalId,
  //       deletedAt: null,
  //     },
  //   });

  //   if (!year) {
  //     throw new NotFoundException('السنة المالية غير موجودة لهذه المؤسسة.');
  //   }

  //   if (year.status !== FinancialYearStatus.OPEN) {
  //     throw new BadRequestException('لا يمكن إقفال سنة غير مفتوحة.');
  //   }

  //   // 2) التحقق من أن كل الفترات (الأشهر) مقفلة
  //   const openPeriods = await this.prisma.financialPeriod.count({
  //     where: {
  //       financialYearId,
  //       deletedAt: null,
  //       isOpen: true,
  //     },
  //   });

  //   if (openPeriods > 0) {
  //     throw new BadRequestException(
  //       'يوجد فترات مالية (أشهر) مفتوحة. يجب إقفالها قبل إقفال السنة.',
  //     );
  //   }

  //   // 3) التأكد من عدم وجود قيد إقفال سابق لهذه السنة
  //   const existingClosing = await this.prisma.accountingEntry.findFirst({
  //     where: {
  //       hospitalId,
  //       financialYearId,
  //       sourceModule: AccountingSourceModule.CLOSING,
  //     },
  //   });

  //   if (existingClosing) {
  //     throw new BadRequestException(
  //       'تم تنفيذ قيد إقفال لهذه السنة المالية مسبقاً.',
  //     );
  //   }

  //   // 4) حساب أرصدة حسابات الإيرادات والمصروفات لهذه السنة
  //   const incomeTypes: AccountType[] = [
  //     AccountType.REVENUE,
  //     AccountType.EXPENSE,
  //     AccountType.CONTRA_REVENUE,
  //   ];

  //   const grouped = await this.prisma.accountingEntryLine.groupBy({
  //     by: ['accountId'],
  //     where: {
  //       account: {
  //         hospitalId,
  //         type: { in: incomeTypes },
  //       },
  //       entry: {
  //         hospitalId,
  //         financialYearId,
  //       },
  //     },
  //     _sum: {
  //       debit: true,
  //       credit: true,
  //     },
  //   });

  //   if (grouped.length === 0) {
  //     throw new BadRequestException(
  //       'لا توجد حركات إيرادات أو مصروفات لهذه السنة لإقفالها.',
  //     );
  //   }

  //   const accountIds = grouped.map((g) => g.accountId);

  //   const accounts = await this.prisma.account.findMany({
  //     where: {
  //       hospitalId,
  //       id: { in: accountIds },
  //     },
  //     select: { id: true, code: true, name: true, type: true },
  //   });

  //   // حساب صافي الربح/الخسارة في حساب 300300
  //   const profitAccount = await this.getAccountByCode(
  //     hospitalId,
  //     ACCOUNT_CODES.CURRENT_YEAR_PROFIT,
  //   );
  //   const retainedEarningsAccount = await this.getAccountByCode(
  //     hospitalId,
  //     ACCOUNT_CODES.RETAINED_EARNINGS,
  //   );

  //   const linesData: {
  //     accountId: number;
  //     debit: Prisma.Decimal;
  //     credit: Prisma.Decimal;
  //     description: string;
  //   }[] = [];
  //   let totalProfitDebit = 0;
  //   let totalProfitCredit = 0;

  //   for (const g of grouped) {
  //     const acc = accounts.find((a) => a.id === g.accountId);
  //     if (!acc) continue;

  //     const debit = Number(g._sum.debit ?? 0);
  //     const credit = Number(g._sum.credit ?? 0);
  //     const balance = debit - credit; // مدين - دائن

  //     if (balance === 0) continue;

  //     const absAmount = Math.abs(balance);

  //     if (balance > 0) {
  //       // رصيد مدين (مصروف غالباً) -> نقفله بدائن
  //       linesData.push({
  //         accountId: acc.id,
  //         debit: new Prisma.Decimal(0),
  //         credit: new Prisma.Decimal(absAmount),
  //         description: `إقفال حساب ${acc.name}`,
  //       });
  //       totalProfitDebit += absAmount;
  //     } else {
  //       // رصيد دائن (إيراد غالباً) -> نقفله بمدين
  //       linesData.push({
  //         accountId: acc.id,
  //         debit: new Prisma.Decimal(absAmount),
  //         credit: new Prisma.Decimal(0),
  //         description: `إقفال حساب ${acc.name}`,
  //       });
  //       totalProfitCredit += absAmount;
  //     }
  //   }

  //   if (linesData.length === 0) {
  //     throw new BadRequestException(
  //       'كل حسابات الإيرادات والمصروفات مغلقة بالفعل لهذه السنة.',
  //     );
  //   }

  //   // سطر تجميعي لحساب صافي الربح/الخسارة
  //   if (totalProfitDebit > 0 || totalProfitCredit > 0) {
  //     linesData.push({
  //       accountId: profitAccount.id,
  //       debit: new Prisma.Decimal(totalProfitDebit),
  //       credit: new Prisma.Decimal(totalProfitCredit),
  //       description: 'إقفال حسابات الإيرادات والمصروفات في صافي الربح/الخسارة',
  //     });
  //   }

  //   const netProfit = totalProfitCredit - totalProfitDebit; // >0 ربح، <0 خسارة
  //   const closingDate = year.endDate;

  //   const result = await this.prisma.$transaction(async (tx) => {
  //     // 5) إنشاء قيد الإقفال
  //     const closingEntry = await tx.accountingEntry.create({
  //       data: {
  //         hospitalId,
  //         entryDate: closingDate,
  //         description: `قيد إقفال السنة المالية ${year.code}`,
  //         sourceModule: AccountingSourceModule.CLOSING,
  //         sourceId: null,
  //         financialYearId: year.id,
  //         financialPeriodId: null,
  //         createdById: userId ?? null,
  //         lines: {
  //           create: linesData,
  //         },
  //       },
  //     });

  //     // 6) ترحيل صافي الربح/الخسارة إلى الأرباح المرحلة
  //     let transferEntry: { id: number } | null = null;

  //     if (netProfit !== 0) {
  //       const amount = Math.abs(netProfit);

  //       if (netProfit > 0) {
  //         // ربح -> مدين صافي الربح، دائن أرباح مرحلة
  //         transferEntry = await tx.accountingEntry.create({
  //           data: {
  //             hospitalId,
  //             entryDate: closingDate,
  //             description: `ترحيل صافي الربح للسنة ${year.code} إلى الأرباح المرحلة`,
  //             sourceModule: AccountingSourceModule.CLOSING,
  //             sourceId: closingEntry.id,
  //             financialYearId: year.id,
  //             financialPeriodId: null,
  //             createdById: userId ?? null,
  //             lines: {
  //               create: [
  //                 {
  //                   accountId: profitAccount.id,
  //                   debit: new Prisma.Decimal(amount),
  //                   credit: new Prisma.Decimal(0),
  //                   description: 'إقفال حساب صافي الربح/الخسارة',
  //                 },
  //                 {
  //                   accountId: retainedEarningsAccount.id,
  //                   debit: new Prisma.Decimal(0),
  //                   credit: new Prisma.Decimal(amount),
  //                   description: 'ترحيل صافي الربح إلى الأرباح المرحلة',
  //                 },
  //               ],
  //             },
  //           },
  //         });
  //       } else {
  //         // خسارة -> مدين أرباح مرحلة، دائن صافي الربح
  //         transferEntry = await tx.accountingEntry.create({
  //           data: {
  //             hospitalId,
  //             entryDate: closingDate,
  //             description: `ترحيل صافي الخسارة للسنة ${year.code} إلى الأرباح المرحلة`,
  //             sourceModule: AccountingSourceModule.CLOSING,
  //             sourceId: closingEntry.id,
  //             financialYearId: year.id,
  //             financialPeriodId: null,
  //             createdById: userId ?? null,
  //             lines: {
  //               create: [
  //                 {
  //                   accountId: retainedEarningsAccount.id,
  //                   debit: new Prisma.Decimal(amount),
  //                   credit: new Prisma.Decimal(0),
  //                   description: 'ترحيل صافي الخسارة إلى الأرباح المرحلة',
  //                 },
  //                 {
  //                   accountId: profitAccount.id,
  //                   debit: new Prisma.Decimal(0),
  //                   credit: new Prisma.Decimal(amount),
  //                   description: 'إقفال حساب صافي الربح/الخسارة',
  //                 },
  //               ],
  //             },
  //           },
  //         });
  //       }
  //     }

  //     // 7) تحديث حالة السنة إلى CLOSED وعدم اعتبارها حالية
  //     const updatedYear = await tx.financialYear.update({
  //       where: { id: year.id },
  //       data: {
  //         status: FinancialYearStatus.CLOSED,
  //         isCurrent: false,
  //         updatedById: userId ?? null,
  //       },
  //     });

  //     return { closingEntry, transferEntry, updatedYear };
  //   });

  //   return {
  //     success: true,
  //     yearId: year.id,
  //     yearCode: year.code,
  //     netProfit,
  //     closingEntryId: result.closingEntry.id,
  //     transferEntryId: result.transferEntry?.id ?? null,
  //   };
  // }

  /**
   * إقفال سنة مالية:
   * - حساب إجمالي الإيرادات والمصروفات من قيود السنة.
   * - إنشاء قيد إقفال يُصفِّر حسابات الإيرادات والمصروفات
   *   ويحوّل صافي الربح/الخسارة إلى حساب الأرباح المحتجزة (P&L).
   * - تغيير حالة السنة إلى CLOSED.
   */
  async validateYearClosingPrerequisites(hospitalId: number, financialYearId: number) {
    const year = await this.prisma.financialYear.findFirst({
        where: { id: financialYearId, hospitalId }
    });
    if (!year) throw new NotFoundException('السنة المالية غير موجودة.');

    // البحث عن فواتير مسودة في الفترة
    const draftInvoices = await this.prisma.invoice.count({
        where: {
            hospitalId,
            status: InvoiceStatus.DRAFT,
            createdAt: {
                gte: year.startDate,
                lte: year.endDate
            }
        }
    });

    // البحث عن فواتير شراء مسودة
    const draftPurchaseInvoices = await this.prisma.purchaseInvoice.count({
        where: {
            hospitalId,
            status: 'DRAFT', // Assuming InvoiceStatus enum or string matches
            createdAt: {
                gte: year.startDate,
                lte: year.endDate
            }
        }
    });

    // البحث عن مدفوعات لم ترحل (بافتراض أن الدفعات تؤثر في النقدية فوراً ولكن قد يكون هناك سيناريو Draft)
    // حالياً نكتفي بالفواتير

    if (draftInvoices > 0 || draftPurchaseInvoices > 0) {
        throw new BadRequestException(
            `لا يمكن إقفال السنة المالية لوجود مستندات معلقة (Draft): ` +
            `فواتير مبيعات (${draftInvoices})، فواتير مشتريات (${draftPurchaseInvoices}). ` +
            `يرجى ترحيلها أو إلغاؤها أولاً.`
        );
    }
  }

  /**
   * جلب المستندات المعلقة التي تمنع إقفال السنة
   */
  async getPendingDocumentsForClosing(
    hospitalId: number,
    financialYearId: number,
  ) {
    const year = await this.prisma.financialYear.findFirst({
      where: { id: financialYearId, hospitalId },
    });
    if (!year) throw new NotFoundException('السنة المالية غير موجودة.');

    // 1) فواتير مبيعات مسودة
    const draftInvoices = await this.prisma.invoice.findMany({
      where: {
        hospitalId,
        status: InvoiceStatus.DRAFT,
        createdAt: {
          gte: year.startDate,
          lte: year.endDate,
        },
      },
      select: {
        id: true,
        // invoiceNumber might be null for drafts, so we use id or placeholder
        totalAmount: true,
        createdAt: true,
        patient: { select: { fullName: true } },
      },
    });

    // 2) فواتير مشتريات مسودة
    const draftPurchases = await this.prisma.purchaseInvoice.findMany({
      where: {
        hospitalId,
        status: 'DRAFT', // or relevant enum
        createdAt: {
          gte: year.startDate,
          lte: year.endDate,
        },
      },
      select: {
        id: true,
        invoiceNumber: true, // Supplier Invoice Number
        totalAmount: true,
        createdAt: true,
        supplier: { select: { name: true } },
      },
    });

    const results = [
      ...draftInvoices.map((inv) => ({
        type: 'فاتورة مبيعات',
        id: inv.id,
        reference: `مسودة #${inv.id} - مريض: ${inv.patient?.fullName ?? 'غير محدد'}`,
        date: inv.createdAt,
        amount: Number(inv.totalAmount),
      })),
      ...draftPurchases.map((pi) => ({
        type: 'فاتورة مشتريات',
        id: pi.id,
        reference: `رقم المورد: ${pi.invoiceNumber ?? '---'} - مورد: ${pi.supplier?.name ?? 'غير محدد'}`,
        date: pi.createdAt,
        amount: Number(pi.totalAmount),
      })),
    ];

    results.sort((a, b) => a.date.getTime() - b.date.getTime());

    return results;
  }

  /*
   * إقفال السنة المالية مع دعم مراكز التكلفة
   * - تجميع الإيرادات والمصروفات حسب الحساب + مركز التكلفة
   * - إنشاء قيد عكسي لكل (AccountId + CostCenterId)
   * - ترحيل الفرق (الربح/الخسارة) إلى حساب الأرباح المحتجزة (بنفس مركز التكلفة أو بدونه)
   * - تغيير حالة السنة إلى CLOSED.
   */
  async closeFinancialYear(
    hospitalId: number,
    userId: number,
    financialYearId: number,
    dto: CloseFinancialYearDto,
  ): Promise<CloseFinancialYearResultDto> {
    // 0) التحقق المسبق من المستندات المعلقة
    await this.validateYearClosingPrerequisites(hospitalId, financialYearId);

    return this.prisma.$transaction(async (tx) => {
      // 1) التحقق من السنة المالية
      const year = await tx.financialYear.findFirst({
        where: { id: financialYearId, hospitalId },
      });

      if (!year) {
        throw new NotFoundException('السنة المالية غير موجودة.');
      }

      if (year.status !== FinancialYearStatus.OPEN) {
        throw new BadRequestException(
          'لا يمكن إقفال سنة غير مفتوحة أو تم إقفالها مسبقاً.',
        );
      }

      // 2) منع إقفال سنة فيها فترات (أشهر) مفتوحة
      const openPeriodsCount = await tx.financialPeriod.count({
        where: {
          financialYearId: year.id,
          deletedAt: null,
          isOpen: true,
        },
      });

      if (openPeriodsCount > 0) {
        throw new BadRequestException(
          'لا يمكن إقفال السنة المالية مع وجود فترات (أشهر) مفتوحة. يرجى إقفال جميع الفترات أولاً.',
        );
      }

      // 3) التحقق من حساب الأرباح المحتجزة (P&L / Retained Earnings)
      const reAccount = await tx.account.findFirst({
        where: {
          id: dto.retainedEarningsAccountId,
          hospitalId,
        },
      });

      if (!reAccount) {
        throw new NotFoundException('حساب الأرباح المحتجزة غير موجود.');
      }

      if (reAccount.type !== AccountType.EQUITY) {
        throw new BadRequestException(
          'يجب أن يكون حساب الأرباح المحتجزة من نوع "حقوق ملكية".',
        );
      }

      // 5) تجميع حركات السنة لحسابات الإيراد والمصروف مع مركز التكلفة
      const lineAgg = await tx.accountingEntryLine.groupBy({
        by: ['accountId', 'costCenterId'],
        where: {
          entry: {
            hospitalId,
            financialYearId: year.id,
            entryDate: {
              gte: year.startDate,
              lte: year.endDate,
            },
          },
        },
        _sum: {
          debit: true,
          credit: true,
        },
      });

      if (lineAgg.length === 0) {
        throw new BadRequestException(
          'لا توجد حركات في هذه السنة المالية، لا يمكن إنشاء قيد إقفال.',
        );
      }

      const accountIds = Array.from(new Set(lineAgg.map((l) => l.accountId)));

      const accounts = await tx.account.findMany({
        where: {
          hospitalId,
          id: { in: accountIds },
          type: {
            in: [
              AccountType.REVENUE,
              AccountType.EXPENSE,
              AccountType.CONTRA_REVENUE,
            ],
          },
        },
      });

      if (accounts.length === 0) {
        throw new BadRequestException(
          'لا توجد حسابات إيرادات أو مصروفات في السنة الحالية.',
        );
      }

      // خريطة سريعة من accountId → account
      const accMap = new Map<number, (typeof accounts)[number]>();
      for (const a of accounts) accMap.set(a.id, a);

      type LineInput = {
        accountId: number;
        costCenterId?: number | null;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        description: string;
      };

      const closingLines: LineInput[] = [];
      
      // التجميع لحساب الأرباح المحتجزة حسب مركز التكلفة
      // المفتاح: costCenterId (أو 'null') -> القيمة: صافي الربح (موجب) أو الخسارة (سالب)
      const reByCostCenter = new Map<number | 'null', number>();

      let totalRevenue = 0; // مجموع أرصدة الإيراد (دائن)
      let totalExpense = 0; // مجموع أرصدة المصروف (مدين)

      for (const agg of lineAgg) {
        const acc = accMap.get(agg.accountId);
        if (!acc) continue; // ليس من حسابات قائمة الدخل

        const debit = Number(agg._sum.debit ?? 0);
        const credit = Number(agg._sum.credit ?? 0);
        const costCenterId = agg.costCenterId;
        const ccKey = costCenterId ?? 'null';

        if (
          acc.type === AccountType.REVENUE ||
          acc.type === AccountType.CONTRA_REVENUE
        ) {
          // الإيرادات (الرصيد الطبيعي دائن)
          const balance = credit - debit;
          if (Math.abs(balance) < 0.0005) continue;

          // تحديث صافي الربح/الخسارة لهذا المركز
          const currentNet = reByCostCenter.get(ccKey) ?? 0;
          reByCostCenter.set(ccKey, currentNet + balance);

          if (balance > 0) {
            totalRevenue += balance;
            // قيد إغلاق: مدين حساب الإيراد لقفل رصيده
            closingLines.push({
              accountId: acc.id,
              costCenterId,
              debit: new Prisma.Decimal(balance),
              credit: new Prisma.Decimal(0),
              description: `إقفال حساب ${acc.name}`,
            });
          } else {
            // حالة نادرة لو الرصيد مدين في حساب إيراد
            const abs = Math.abs(balance);
            totalExpense += abs;
            closingLines.push({
              accountId: acc.id,
              costCenterId,
              debit: new Prisma.Decimal(0),
              credit: new Prisma.Decimal(abs),
              description: `إقفال حساب ${acc.name}`,
            });
          }
        } else if (acc.type === AccountType.EXPENSE) {
          // المصروفات (الرصيد الطبيعي مدين)
          const balance = debit - credit;
          if (Math.abs(balance) < 0.0005) continue;

           // المصروف يقلل الربح
           const currentNet = reByCostCenter.get(ccKey) ?? 0;
           reByCostCenter.set(ccKey, currentNet - balance);

          if (balance > 0) {
            totalExpense += balance;
            // قيد إغلاق: دائن حساب المصروف لقفل رصيده
            closingLines.push({
              accountId: acc.id,
              costCenterId,
              debit: new Prisma.Decimal(0),
              credit: new Prisma.Decimal(balance),
              description: `إقفال حساب ${acc.name}`,
            });
          } else {
            // حالة نادرة لو الرصيد دائن في حساب مصروف
            const abs = Math.abs(balance);
            totalRevenue += abs;
            closingLines.push({
              accountId: acc.id,
              costCenterId,
              debit: new Prisma.Decimal(abs),
              credit: new Prisma.Decimal(0),
              description: `إقفال حساب ${acc.name}`,
            });
          }
        }
      }

      if (closingLines.length === 0) {
        throw new BadRequestException(
          'لا توجد أرصدة قائمة دخل لإقفالها في هذه السنة.',
        );
      }

      // 6) إضافة سطور الأرباح المحتجزة لكل مركز تكلفة
      for (const [key, netProfit] of reByCostCenter.entries()) {
        const costCenterId = key === 'null' ? null : (key as number);
        
        if (Math.abs(netProfit) > 0.0005) {
          if (netProfit > 0) {
            // ربح -> دائن في حقوق الملكية
            closingLines.push({
              accountId: reAccount.id,
              costCenterId,
              debit: new Prisma.Decimal(0),
              credit: new Prisma.Decimal(netProfit),
              description: 'ترحيل صافي الربح',
            });
          } else {
            // خسارة -> مدين في حقوق الملكية
            const loss = Math.abs(netProfit);
            closingLines.push({
              accountId: reAccount.id,
              costCenterId,
              debit: new Prisma.Decimal(loss),
              credit: new Prisma.Decimal(0),
              description: 'ترحيل صافي الخسارة',
            });
          }
        }
      }

      const netProfit = totalRevenue - totalExpense;

      // 7) إنشاء قيد الإقفال
      const closingEntry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          financialYearId: year.id,
          financialPeriodId: null,
          entryDate: year.endDate,
          description:
            dto.description ??
            `قيد إقفال السنة المالية ${year.code ?? ''}`.trim(),
          sourceModule: AccountingSourceModule.CLOSING,
          sourceId: year.id,
          createdById: userId,
          lines: {
            create: closingLines,
          },
        },
      });

      // 7) تحديث حالة السنة إلى CLOSED
      // 7) تحديث حالة السنة إلى CLOSED وإلغاء كونها السنة الحالية
      await tx.financialYear.update({
        where: { id: year.id },
        data: {
          status: FinancialYearStatus.CLOSED,
          isCurrent: false,
          // لو عندك حقل updatedById في الجدول يمكنك تفعيله:
          // updatedById: userId,
          // ويمكن لاحقاً إضافة closedAt / closedById
        },
      });

      return {
        financialYearId: year.id,
        financialYearName: year.name,
        closingEntryId: closingEntry.id,
        totalRevenue: Number(totalRevenue.toFixed(3)),
        totalExpense: Number(totalExpense.toFixed(3)),
        netProfit: Number(netProfit.toFixed(3)),
      };
    });
  }

  // ==============================
  //  قائمة الدخل (Income Statement)
  // ==============================
  // async getIncomeStatement(params: {
  //   hospitalId: number;
  //   financialYearId?: number;
  //   fromDate?: Date;
  //   toDate?: Date;
  // }): Promise<IncomeStatementDto> {
  //   const { hospitalId } = params;
  //   let { financialYearId, fromDate, toDate } = params;

  //   // نتأكد إن دليل الحسابات والمابات النظامية جاهزة
  //   await this.ensureDefaultAccounts(hospitalId);

  //   // لو عندنا سنة مالية ولم تُرسل تواريخ -> نستخدم حدود السنة
  //   if (financialYearId && (!fromDate || !toDate)) {
  //     const fy = await this.prisma.financialYear.findFirst({
  //       where: {
  //         id: financialYearId,
  //         hospitalId,
  //         deletedAt: null,
  //       },
  //     });

  //     if (fy) {
  //       if (!fromDate) fromDate = fy.startDate;
  //       if (!toDate) toDate = fy.endDate;
  //     }
  //   }

  //   // لو ما زال ما فيش تواريخ -> نستخدم سنة التقويم الحالية
  //   const now = new Date();
  //   if (!fromDate) {
  //     fromDate = new Date(now.getFullYear(), 0, 1);
  //   }
  //   if (!toDate) {
  //     toDate = new Date(now.getFullYear(), 11, 31);
  //   }

  //   // 👈 نطبع التواريخ (يوم فقط) + نستخدم [from, to+1) للفلترة
  //   const displayFrom = startOfDayUtc(fromDate);
  //   const displayTo = startOfDayUtc(toDate);
  //   const fromInclusive = displayFrom;
  //   const toExclusive = addDaysUtc(displayTo, 1); // بداية اليوم التالي

  //   // 👈 نجيب كل سطور القيود لحسابات قائمة الدخل في الفترة
  //   const lines = await this.prisma.accountingEntryLine.findMany({
  //     where: {
  //       entry: {
  //         hospitalId,
  //         entryDate: {
  //           gte: fromInclusive,
  //           lt: toExclusive,
  //         },
  //       },
  //       account: {
  //         type: {
  //           in: [
  //             AccountType.REVENUE,
  //             AccountType.EXPENSE,
  //             AccountType.CONTRA_REVENUE,
  //           ],
  //         },
  //       },
  //     },
  //     select: {
  //       accountId: true,
  //       debit: true,
  //       credit: true,
  //       account: {
  //         select: {
  //           id: true,
  //           code: true,
  //           name: true,
  //           type: true,
  //         },
  //       },
  //     },
  //   });

  //   if (!lines.length) {
  //     return {
  //       financialYearId: financialYearId ?? null,
  //       fromDate: displayFrom.toISOString(),
  //       toDate: displayTo.toISOString(),
  //       revenues: [],
  //       expenses: [],
  //       totalRevenue: 0,
  //       totalExpense: 0,
  //       netProfit: 0,
  //     };
  //   }

  //   type Agg = {
  //     accountId: number;
  //     code: string;
  //     name: string;
  //     type: AccountType;
  //     debitTotal: number;
  //     creditTotal: number;
  //   };

  //   const aggMap = new Map<number, Agg>();

  //   // نجمع المدين/الدائن لكل حساب
  //   for (const line of lines) {
  //     const acc = line.account;
  //     if (!acc) continue;

  //     const debit = Number(line.debit ?? 0);
  //     const credit = Number(line.credit ?? 0);

  //     let agg = aggMap.get(acc.id);
  //     if (!agg) {
  //       agg = {
  //         accountId: acc.id,
  //         code: acc.code,
  //         name: acc.name,
  //         type: acc.type,
  //         debitTotal: 0,
  //         creditTotal: 0,
  //       };
  //       aggMap.set(acc.id, agg);
  //     }

  //     agg.debitTotal += debit;
  //     agg.creditTotal += credit;
  //   }

  //   const revenues: IncomeStatementRowDto[] = [];
  //   const expenses: IncomeStatementRowDto[] = [];

  //   for (const agg of aggMap.values()) {
  //     const { accountId, code, name, type } = agg;
  //     const debit = agg.debitTotal;
  //     const credit = agg.creditTotal;

  //     // 👈 منطق التصنيف
  //     const isRevenue =
  //       type === AccountType.REVENUE || (code && code.startsWith('4'));

  //     const isExpense =
  //       type === AccountType.EXPENSE ||
  //       type === AccountType.CONTRA_REVENUE ||
  //       (code && code.startsWith('5'));

  //     // لو لأي سبب الحساب مش إيراد ولا مصروف نتجاهله
  //     if (!isRevenue && !isExpense) {
  //       continue;
  //     }

  //     let net = 0;
  //     if (isRevenue) {
  //       // الإيرادات: دائن - مدين
  //       net = credit - debit;
  //     } else {
  //       // المصروفات وخصومات الإيرادات: مدين - دائن
  //       net = debit - credit;
  //     }

  //     // تجاهل الحسابات اللي رصيدها صفر فعليًا
  //     if (Math.abs(net) < 0.000001) continue;

  //     const row: IncomeStatementRowDto = {
  //       accountId,
  //       code,
  //       name,
  //       type,
  //       debit,
  //       credit,
  //       net,
  //     };

  //     if (isRevenue) {
  //       revenues.push(row);
  //     } else {
  //       expenses.push(row);
  //     }
  //   }

  //   // إجماليات وصافي الربح
  //   const totalRevenue = revenues.reduce((s, r) => s + r.net, 0);
  //   const totalExpense = expenses.reduce((s, r) => s + r.net, 0);
  //   const netProfit = totalRevenue - totalExpense;

  //   // ترتيب حسب رقم الحساب لراحة العرض
  //   revenues.sort((a, b) => a.code.localeCompare(b.code, 'en'));
  //   expenses.sort((a, b) => a.code.localeCompare(b.code, 'en'));

  //   return {
  //     financialYearId: financialYearId ?? null,
  //     fromDate: displayFrom.toISOString(),
  //     toDate: displayTo.toISOString(), // 👈 الآن سيظهر في الواجهة 31/12/2025 مثلاً
  //     revenues,
  //     expenses,
  //     totalRevenue,
  //     totalExpense,
  //     netProfit,
  //   };
  // }

  //---------------------------------------------//

  async getIncomeStatement(params: {
    hospitalId: number;
    financialYearId?: number;
    fromDate?: Date;
    toDate?: Date;
    costCenterId?: number;
  }): Promise<IncomeStatementDto> {
    const { hospitalId, costCenterId } = params;
    let { financialYearId, fromDate, toDate } = params;

    // نتأكد إن دليل الحسابات والمابات النظامية جاهزة
    await this.ensureDefaultAccounts(hospitalId);

    // لو عندنا سنة مالية ولم تُرسل تواريخ -> نستخدم حدود السنة
    if (financialYearId && (!fromDate || !toDate)) {
      const fy = await this.prisma.financialYear.findFirst({
        where: {
          id: financialYearId,
          hospitalId,
          deletedAt: null,
        },
      });

      if (fy) {
        if (!fromDate) fromDate = fy.startDate;
        if (!toDate) toDate = fy.endDate;
      }
    }

    // لو ما زال ما فيش تواريخ -> نستخدم سنة التقويم الحالية
    const now = new Date();
    if (!fromDate) {
      fromDate = new Date(now.getFullYear(), 0, 1);
    }
    if (!toDate) {
      toDate = new Date(now.getFullYear(), 11, 31);
    }

    // 👈 نطبع التواريخ (يوم فقط) + نستخدم [from, to+1) للفلترة
    const displayFrom = startOfDayUtc(fromDate);
    const displayTo = startOfDayUtc(toDate);
    const fromInclusive = displayFrom;
    const toExclusive = addDaysUtc(displayTo, 1); // بداية اليوم التالي

    const whereLines: Prisma.AccountingEntryLineWhereInput = {
      entry: {
        hospitalId,
        entryDate: {
          gte: fromInclusive,
          lt: toExclusive,
        },
      },
      account: {
        type: {
          in: [
            AccountType.REVENUE,
            AccountType.EXPENSE,
            AccountType.CONTRA_REVENUE,
          ],
        },
      },
    };

    // فلتر بمركز التكلفة إذا تم تحديده
    if (costCenterId) {
      whereLines.costCenterId = costCenterId;
    }

    // 👈 نجيب كل سطور القيود لحسابات قائمة الدخل في الفترة
    const lines = await this.prisma.accountingEntryLine.findMany({
      where: {
        entry: {
          hospitalId,
          entryDate: {
            gte: fromInclusive,
            lt: toExclusive,
          },
        },
        account: {
          type: {
            in: [
              AccountType.REVENUE,
              AccountType.EXPENSE,
              AccountType.CONTRA_REVENUE,
            ],
          },
        },
      },
      select: {
        accountId: true,
        debit: true,
        credit: true,
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!lines.length) {
      return {
        financialYearId: financialYearId ?? null,
        fromDate: displayFrom.toISOString(),
        toDate: displayTo.toISOString(),
        revenues: [],
        expenses: [],
        totalRevenue: 0,
        totalExpense: 0,
        netProfit: 0,
      };
    }

    type Agg = {
      accountId: number;
      code: string;
      name: string;
      type: AccountType;
      debitTotal: number;
      creditTotal: number;
    };

    const aggMap = new Map<number, Agg>();

    // نجمع المدين/الدائن لكل حساب
    for (const line of lines) {
      const acc = line.account;
      if (!acc) continue;

      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      let agg = aggMap.get(acc.id);
      if (!agg) {
        agg = {
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          debitTotal: 0,
          creditTotal: 0,
        };
        aggMap.set(acc.id, agg);
      }

      agg.debitTotal += debit;
      agg.creditTotal += credit;
    }

    const revenues: IncomeStatementRowDto[] = [];
    const expenses: IncomeStatementRowDto[] = [];

    for (const agg of aggMap.values()) {
      const { accountId, code, name, type } = agg;
      const debit = agg.debitTotal;
      const credit = agg.creditTotal;

      // 👈 منطق التصنيف
      const isRevenue =
        type === AccountType.REVENUE || (code && code.startsWith('4'));

      const isExpense =
        type === AccountType.EXPENSE ||
        type === AccountType.CONTRA_REVENUE ||
        (code && code.startsWith('5'));

      // لو لأي سبب الحساب مش إيراد ولا مصروف نتجاهله
      if (!isRevenue && !isExpense) {
        continue;
      }

      let net = 0;
      if (isRevenue) {
        // الإيرادات: دائن - مدين
        net = credit - debit;
      } else {
        // المصروفات وخصومات الإيرادات: مدين - دائن
        net = debit - credit;
      }

      // تجاهل الحسابات اللي رصيدها صفر فعليًا
      if (Math.abs(net) < 0.000001) continue;

      const row: IncomeStatementRowDto = {
        accountId,
        code,
        name,
        type,
        debit,
        credit,
        net,
      };

      if (isRevenue) {
        revenues.push(row);
      } else {
        expenses.push(row);
      }
    }

    // إجماليات وصافي الربح
    const totalRevenue = revenues.reduce((s, r) => s + r.net, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.net, 0);
    const netProfit = totalRevenue - totalExpense;

    // ترتيب حسب رقم الحساب لراحة العرض
    revenues.sort((a, b) => a.code.localeCompare(b.code, 'en'));
    expenses.sort((a, b) => a.code.localeCompare(b.code, 'en'));

    return {
      financialYearId: financialYearId ?? null,
      fromDate: displayFrom.toISOString(),
      toDate: displayTo.toISOString(), // 👈 الآن سيظهر في الواجهة 31/12/2025 مثلاً
      revenues,
      expenses,
      totalRevenue,
      totalExpense,
      netProfit,
    };
  }

  // 🔹 حساب صافي الربح / الخسارة حتى تاريخ معيّن
  private async calculateNetIncome(
    hospitalId: number,
    asOfDate: Date,
  ): Promise<number> {
    const asOfStart = startOfDayUtc(asOfDate);
    const asOfExclusive = addDaysUtc(asOfStart, 1);

    const lines = await this.prisma.accountingEntryLine.findMany({
      where: {
        entry: {
          hospitalId,
          entryDate: { lt: asOfExclusive },
        },
        account: {
          type: {
            in: [
              AccountType.REVENUE,
              AccountType.EXPENSE,
              AccountType.CONTRA_REVENUE,
            ],
          },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: { type: true },
        },
      },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const line of lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);

      // الإيرادات (رصيدها الطبيعي دائن)
      if (
        line.account.type === AccountType.REVENUE ||
        line.account.type === AccountType.CONTRA_REVENUE
      ) {
        const balance = credit - debit; // دائن - مدين
        totalRevenue += balance;
      }

      // المصروفات (رصيدها الطبيعي مدين)
      if (line.account.type === AccountType.EXPENSE) {
        const balance = debit - credit; // مدين - دائن
        totalExpenses += balance;
      }
    }

    // صافي الربح = إجمالي الإيرادات - إجمالي المصروفات
    const netIncome = totalRevenue - totalExpenses;
    return netIncome;
  }

  /**
   * إحضار الميزانية العمومية حتى تاريخ معيّن
   */
  async getBalanceSheet(hospitalId: number, asOfDate: Date) {
    // 👈 نعتبر asOfDate كـ يوم فقط (بدون ساعة)
    const asOfStart = startOfDayUtc(asOfDate);
    const asOfExclusive = addDaysUtc(asOfStart, 1); // بداية اليوم التالي

    // 🔹 أولاً: تحديد السنة المالية التي يغطيها هذا التاريخ
    const fy = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        // نبحث عن سنة يكون تاريخ الميزانية بين بدايتها ونهايتها
        startDate: { lte: asOfStart },
        endDate: { gte: asOfStart },
      },
    });

    if (!fy) {
      throw new BadRequestException(
        'لا توجد سنة مالية تغطي التاريخ المحدد في الميزانية العمومية.',
      );
    }

    // 🔹 ثانياً: نجمع القيود فقط داخل نفس السنة المالية
    const lines = await this.prisma.accountingEntryLine.findMany({
      where: {
        entry: {
          hospitalId,
          financialYearId: fy.id, // ✅ عزل على مستوى السنة المالية
          entryDate: { lt: asOfExclusive }, // ⬅️ كل ما قبل اليوم التالي
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    });

    type Agg = {
      accountId: number;
      code: string;
      name: string;
      type: AccountType;
      debitTotal: number;
      creditTotal: number;
    };

    const map = new Map<number, Agg>();

    for (const line of lines) {
      const acc = line.account;
      if (!acc) continue;

      const debit = Number(line.debit);
      const credit = Number(line.credit);

      let agg = map.get(acc.id);
      if (!agg) {
        agg = {
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          debitTotal: 0,
          creditTotal: 0,
        };
        map.set(acc.id, agg);
      }

      agg.debitTotal += debit;
      agg.creditTotal += credit;
    }

    const assetAccounts: any[] = [];
    const liabilityAccounts: any[] = [];
    const equityAccounts: any[] = [];

    let assetsTotal = 0;
    let liabilitiesTotal = 0;
    let equityTotal = 0;

    for (const agg of map.values()) {
      // نفس منطق ميزان المراجعة: الرصيد = مدين - دائن
      const balance = agg.debitTotal - agg.creditTotal;

      // نتجاهل الحسابات التي ليس لها رصيد فعلي
      if (Math.abs(balance) < 0.000001) continue;

      const base = {
        accountId: agg.accountId,
        code: agg.code,
        name: agg.name,
        type: agg.type,
        balance,
      };

      // الأصول (مع الأصول السالبة إن وجدت)
      if (
        agg.type === AccountType.ASSET ||
        agg.type === AccountType.CONTRA_ASSET
      ) {
        assetAccounts.push(base);
        assetsTotal += balance;
        continue;
      }

      // الالتزامات
      if (agg.type === AccountType.LIABILITY) {
        liabilityAccounts.push(base);
        liabilitiesTotal += balance;
        continue;
      }

      // حقوق الملكية (بدون الإيرادات/المصروفات)
      if (agg.type === AccountType.EQUITY) {
        equityAccounts.push(base);
        equityTotal += balance;
        continue;
      }

      // حسابات قائمة الدخل (REVENUE / EXPENSE / CONTRA_REVENUE)
      // لا نعرضها في الميزانية، تدخل في صافي الربح فقط
    }

    // 1) حساب صافي الربح / الخسارة المتراكم حتى هذا التاريخ
    // ⚠️ نفترض أن calculateNetIncome نفسها تأخذ في الاعتبار السنة المالية
    const netIncome = await this.calculateNetIncome(hospitalId, asOfStart);

    // 2) إضافة صافي الربح كحساب افتراضي ضمن حقوق الملكية
    let equityTotalWithNetIncome = equityTotal;

    if (Math.abs(netIncome) > 0.000001) {
      // في نظامنا: الرصيد الدائن يظهر بالسالب (مثل رأس المال)
      const niBalanceForEquity = -netIncome;

      equityAccounts.push({
        accountId: 0, // حساب افتراضي للعرض فقط
        code: 'P&L',
        name:
          netIncome >= 0
            ? 'صافي الربح المتراكم حتى التاريخ'
            : 'صافي الخسارة المتراكمة حتى التاريخ',
        type: AccountType.EQUITY,
        balance: niBalanceForEquity,
      });

      equityTotalWithNetIncome += niBalanceForEquity;
    }

    // 3) إجمالي الالتزامات + حقوق الملكية (بالقيمة المطلقة لحقوق الملكية)
    const liabilitiesAndEquity =
      liabilitiesTotal + Math.abs(equityTotalWithNetIncome);

    return {
      asOfDate: asOfStart,
      assets: {
        total: assetsTotal,
        accounts: assetAccounts,
      },
      liabilities: {
        total: liabilitiesTotal,
        accounts: liabilityAccounts,
      },
      equity: {
        total: equityTotalWithNetIncome,
        accounts: equityAccounts,
      },
      totals: {
        assets: assetsTotal,
        liabilitiesAndEquity,
        difference: assetsTotal - liabilitiesAndEquity,
      },
    };
  }

  // ✅ دالة مساعدة: التأكد من وجود سنة مالية مفتوحة لهذا التاريخ
  private async ensureOpenFinancialYear(
    hospitalId: number,
    entryDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.db(tx);
    const target = startOfDayUtc(entryDate);

    const year = await db.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        status: FinancialYearStatus.OPEN,
        isCurrent: true,
        startDate: { lte: target },
        endDate: { gte: target },
      },
    });

    if (!year)
      throw new BadRequestException(
        'لا توجد سنة مالية حالية مفتوحة تشمل هذا التاريخ.',
      );
    return year;
  }

  private async ensureOpenFinancialPeriod(
    hospitalId: number,
    entryDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.db(tx);
    const target = startOfDayUtc(entryDate);

    const financialYear = await this.ensureOpenFinancialYear(
      hospitalId,
      entryDate,
      tx,
    );

    const period = await db.financialPeriod.findFirst({
      where: {
        financialYearId: financialYear.id,
        deletedAt: null,
        isOpen: true,
        monthStartDate: { lte: target },
        monthEndDate: { gte: target },
      },
      orderBy: { periodIndex: 'asc' },
    });

    if (!period) {
      throw new BadRequestException(
        'لا توجد فترة (شهر) مفتوحة تشمل هذا التاريخ في هذه السنة المالية.',
      );
    }

    return { financialYear, period };
  }

  // ✅ دالة مساعدة: جلب حساب الموردين الدائنين
  private async getSuppliersApAccount(hospitalId: number) {
    const ap = await this.prisma.account.findFirst({
      where: { hospitalId, code: '2100-SUPPLIERS' },
    });

    if (!ap) {
      throw new Error(
        'حساب الموردين الدائنين (2100-SUPPLIERS) غير موجود في دليل الحسابات.',
      );
    }

    return ap;
  }

  // ✅ دالة مساعدة: حساب ضريبة المدخلات (اختياري)
  private async getVatInputAccount(hospitalId: number) {
    const vat = await this.prisma.account.findFirst({
      where: { hospitalId, code: '1570-VAT-INPUT' },
    });
    // ممكن يكون غير موجود لو لسه ما فعّلت ضريبة، فنرجع null
    return vat;
  }

  // ✅ دالة مساعدة: حساب مشتريات افتراضي لو سطر الفاتورة بدون حساب
  private async getDefaultPurchasesExpenseAccount(hospitalId: number) {
    const acc = await this.prisma.account.findFirst({
      where: { hospitalId, code: '5000-PURCHASES' },
    });

    if (!acc) {
      throw new Error(
        'حساب مشتريات افتراضي (5000-PURCHASES) غير موجود في دليل الحسابات.',
      );
    }

    return acc;
  }

  // ✅ دالة مساعدة: تحديد حساب الكاش/البنك بناءً على طريقة الدفع
  private async resolveCashOrBankAccountForSupplierPayment(
    hospitalId: number,
    method: PaymentMethod,
  ) {
    let code: string;

    switch (method) {
      case PaymentMethod.CASH:
        code = '1100-CASH';
        break;
      case PaymentMethod.CARD:
      case PaymentMethod.TRANSFER:
        code = '1110-BANK';
        break;
      case PaymentMethod.OTHER:
      case PaymentMethod.INSURANCE:
      default:
        // تقدر تغيّر هذا لاحقًا حسب تصميمك
        code = '1110-BANK';
        break;
    }

    const acc = await this.prisma.account.findFirst({
      where: { hospitalId, code },
    });

    if (!acc) {
      throw new Error(
        `لم يتم العثور على حساب نقدية/بنك للكود (${code}) في دليل الحسابات.`,
      );
    }

    return acc;
  }

  // قيّد لفاتورة مورد:
  // Debit: مصروف / مخزون (من بنود الفاتورة)
  // Debit: VAT Input (إن وجد)
  // Credit: حساب المورد (Accounts Payable - Suppliers)
  // قيّد لفاتورة مورد:
  // Debit: مصروف / مخزون (من بنود الفاتورة) بعد الخصم
  // Debit: VAT Input (إن وجدت)
  // Credit: حساب الموردين (Accounts Payable - Suppliers)
  async recordPurchaseInvoiceEntry(params: {
    purchaseInvoiceId: number;
    hospitalId: number;
    userId: number;
    tx?: Prisma.TransactionClient;
  }) {
    const { purchaseInvoiceId, hospitalId, userId, tx } = params;
    const db = this.db(tx);

    const inv = await db.purchaseInvoice.findFirst({
      where: { id: purchaseInvoiceId, hospitalId },
      include: {
        supplier: true,
        lines: true, // ✅ نحتاج inventoryItemId / drugItemId
      },
    });
    if (!inv) return;

    if (
      (inv as any).status === 'DRAFT' ||
      (inv as any).status === 'CANCELLED'
    ) {
      return;
    }

    const rawEntryDate =
      inv.invoiceDate ?? (inv as any).createdAt ?? new Date();
    const entryDate = startOfDayUtc(rawEntryDate);

    const { financialYear, period } = await this.ensureOpenFinancialPeriod(
      hospitalId,
      entryDate,
      tx,
    );

    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    // ✅ حساب الموردين (AP)
    const apAccount = await db.account.findFirst({
      where: { hospitalId, code: ACCOUNT_CODES.AP_SUPPLIERS },
    });
    if (!apAccount) {
      throw new BadRequestException(
        `حساب الموردين (${ACCOUNT_CODES.AP_SUPPLIERS}) غير موجود.`,
      );
    }

    // ✅ VAT Input (Asset)
    const vatAmount = Number(inv.vatAmount ?? 0);
    const vatAccount =
      vatAmount > 0.0001
        ? await db.account.findFirst({
            where: { hospitalId, code: ACCOUNT_CODES.VAT_INPUT },
          })
        : null;

    // ✅ Accounts fallback
    const defaultExpense = await db.account.findFirst({
      where: { hospitalId, code: '500200' }, // مصروف أدوية
      select: { id: true },
    });

    const invDrugs = await db.account.findFirst({
      where: { hospitalId, code: '130100' }, // مخزون أدوية
      select: { id: true },
    });

    const invSupplies = await db.account.findFirst({
      where: { hospitalId, code: '130200' }, // مخزون مستلزمات
      select: { id: true },
    });

    // ✅ تجميع البنود حسب الحساب (مصروف/مخزون)
    const postingMap = new Map<number, number>();

    for (const line of inv.lines as any[]) {
      const lineTotal = Number(line.totalAmount ?? 0);
      if (lineTotal <= 0) continue;

      let accountId: number | null = null;

      // 1) لو اختار المستخدم حساب يدويًا -> نستخدمه
      if (line.expenseAccountId) {
        accountId = Number(line.expenseAccountId);
      } else if (line.drugItemId) {
        // 2) لو بند أدوية -> مخزون أدوية
        if (!invDrugs?.id) {
          throw new BadRequestException(
            'لا يوجد حساب مخزون أدوية (130100) في دليل الحسابات.',
          );
        }
        accountId = invDrugs.id;
      } else if (line.inventoryItemId) {
        // 3) لو بند مستلزمات -> مخزون مستلزمات
        if (!invSupplies?.id) {
          throw new BadRequestException(
            'لا يوجد حساب مخزون مستلزمات (130200) في دليل الحسابات.',
          );
        }
        accountId = invSupplies.id;
      } else {
        // 4) fallback -> مصروف أدوية
        accountId = defaultExpense?.id ?? null;
      }

      if (!accountId) {
        throw new BadRequestException(
          'يوجد بند في فاتورة الشراء بدون حساب (ولا يوجد حسابات افتراضية جاهزة).',
        );
      }

      postingMap.set(accountId, (postingMap.get(accountId) ?? 0) + lineTotal);
    }

    if (!postingMap.size) return;

    const discount = Number(inv.discountAmount ?? 0);
    const grossTotal = Array.from(postingMap.values()).reduce(
      (s, v) => s + v,
      0,
    );

    if (grossTotal <= 0) return;
    if (discount < 0 || discount > grossTotal + 0.0001) {
      throw new BadRequestException(
        'قيمة الخصم غير منطقية مقارنة بإجمالي البنود.',
      );
    }

    // ✅ توزيع الخصم proportionally
    const discountAlloc = new Map<number, number>();
    let allocated = 0;

    const entries = Array.from(postingMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [accountId, amount] = entries[i];
      let alloc = 0;

      if (discount > 0) {
        alloc = round3((discount * amount) / grossTotal);
        if (i === entries.length - 1) {
          alloc = round3(discount - allocated);
        }
        allocated = round3(allocated + alloc);
      }

      discountAlloc.set(accountId, alloc);
    }

    const net = Number(inv.netAmount ?? grossTotal - discount + vatAmount);

    const linesCreate: {
      accountId: number;
      debit: number;
      credit: number;
      description?: string;
    }[] = [];

    // ✅ مصروف/مخزون بعد الخصم
    for (const [accountId, amount] of postingMap.entries()) {
      const alloc = discountAlloc.get(accountId) ?? 0;
      const debit = round3(amount - alloc);
      if (debit <= 0.0001) continue;

      linesCreate.push({
        accountId,
        debit,
        credit: 0,
        description: 'إثبات مشتريات/مخزون (بعد الخصم)',
      });
    }

    // ✅ VAT Input
    if (vatAmount > 0.0001) {
      if (vatAccount) {
        linesCreate.push({
          accountId: vatAccount.id,
          debit: round3(vatAmount),
          credit: 0,
          description: 'ضريبة مدخلات (VAT Input)',
        });
      } else if (linesCreate.length) {
        linesCreate[0].debit = round3((linesCreate[0].debit ?? 0) + vatAmount);
      }
    }

    // ✅ المورد (دائن)
    linesCreate.push({
      accountId: apAccount.id,
      debit: 0,
      credit: round3(net),
      description: 'إثبات دائنون الموردين',
    });

    // ✅ تحقق التوازن
    const totalDebit = round3(
      linesCreate.reduce((s, l) => s + (l.debit || 0), 0),
    );
    const totalCredit = round3(
      linesCreate.reduce((s, l) => s + (l.credit || 0), 0),
    );

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `قيد فاتورة الشراء غير متوازن (Debit=${totalDebit}, Credit=${totalCredit}).`,
      );
    }

    const sourceModule = AccountingSourceModule.INVENTORY;

    let entryId: number | null = null;

    if (inv.accountingEntryId) {
      const linked = await db.accountingEntry.findFirst({
        where: { id: inv.accountingEntryId, hospitalId },
        select: { id: true },
      });
      if (linked) entryId = linked.id;
    }

    if (!entryId) {
      const existing = await db.accountingEntry.findFirst({
        where: { hospitalId, sourceModule, sourceId: inv.id },
        select: { id: true },
      });
      if (existing) entryId = existing.id;
    }

    const desc = `فاتورة شراء رقم ${inv.invoiceNumber ?? inv.id} للمورد ${
      inv.supplier?.name ?? ''
    }`.trim();

    if (entryId) {
      await this.validateEntryModification(entryId, hospitalId, tx);
      await db.accountingEntry.update({
        where: { id: entryId },
        data: {
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          entryDate,
          description: desc,
          sourceModule,
          sourceId: inv.id,
          createdById: userId,
        },
      });

      await db.accountingEntryLine.deleteMany({ where: { entryId } });
    } else {
      const created = await db.accountingEntry.create({
        data: {
          hospitalId,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          entryDate,
          description: desc,
          sourceModule,
          sourceId: inv.id,
          createdById: userId,
        },
        select: { id: true },
      });
      entryId = created.id;
    }

    await db.accountingEntryLine.createMany({
      data: linesCreate.map((l) => ({
        entryId: entryId!,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
      })),
    });

    if (inv.accountingEntryId !== entryId) {
      await db.purchaseInvoice.update({
        where: { id: inv.id },
        data: { accountingEntryId: entryId },
      });
    }
  }

  // قيّد لدفع مورد:
  // Debit: حساب المورد
  // Credit: Cash/Bank حسب method
  // قيّد لدفع مورد:
  // Debit: حساب الموردين
  // Credit: Cash/Bank حسب method
  async recordSupplierPaymentEntry(params: {
    supplierPaymentId: number;
    hospitalId: number;
    userId: number;
    tx?: Prisma.TransactionClient;
  }) {
    const { supplierPaymentId, hospitalId, userId, tx } = params;
    const db = this.db(tx);

    const pay = await db.supplierPayment.findFirst({
      where: { id: supplierPaymentId, hospitalId },
      include: { supplier: true, purchaseInvoice: true },
    });
    if (!pay) return;

    const rawEntryDate = pay.paidAt ?? new Date();
    const entryDate = startOfDayUtc(rawEntryDate);

    const { financialYear, period } = await this.ensureOpenFinancialPeriod(
      hospitalId,
      entryDate,
      tx,
    );

    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    const apAccount = await db.account.findFirst({
      where: { hospitalId, code: ACCOUNT_CODES.AP_SUPPLIERS },
    });
    if (!apAccount) {
      throw new BadRequestException(
        `حساب الموردين (${ACCOUNT_CODES.AP_SUPPLIERS}) غير موجود.`,
      );
    }

    const cashOrBankKey =
      pay.method === PaymentMethod.CASH
        ? SystemAccountKey.CASH_MAIN
        : SystemAccountKey.BANK_MAIN;

    const cashOrBankAccount = await this.getSystemAccountOrThrow(
      hospitalId,
      cashOrBankKey,
      tx,
    );

    const amount = round3(Number(pay.amount ?? 0));
    if (amount <= 0.0001) return;

    // ✅ المصدر الجديد الصحيح
    const sourceModule = AccountingSourceModule.SUPPLIER_PAYMENT;

    // ✅ تحديد القيد الموجود: (1) من رابط الدفعة (2) من المصدر الجديد (3) fallback للقديم INVENTORY
    let entryId: number | null = null;

    if (pay.accountingEntryId) {
      const linked = await db.accountingEntry.findFirst({
        where: { id: pay.accountingEntryId, hospitalId },
        select: { id: true },
      });
      if (linked) entryId = linked.id;
    }

    if (!entryId) {
      const existingNew = await db.accountingEntry.findFirst({
        where: { hospitalId, sourceModule, sourceId: pay.id },
        select: { id: true },
      });
      if (existingNew) entryId = existingNew.id;
    }

    if (!entryId) {
      // ✅ fallback: دفعات قديمة كانت تتسجل على INVENTORY
      const existingOld = await db.accountingEntry.findFirst({
        where: {
          hospitalId,
          sourceModule: AccountingSourceModule.INVENTORY,
          sourceId: pay.id,
        },
        select: { id: true },
      });
      if (existingOld) entryId = existingOld.id;
    }

    const desc = `سداد لمورد ${pay.supplier?.name ?? ''}${
      pay.purchaseInvoice
        ? ` عن فاتورة رقم ${
            pay.purchaseInvoice.invoiceNumber ?? pay.purchaseInvoice.id
          }`
        : ''
    }`.trim();

    if (entryId) {
      // ✅ لو كان قيد قديم INVENTORY سيتم تحويله هنا لـ SUPPLIER_PAYMENT (حل نهائي للتصادم)
      await this.validateEntryModification(entryId, hospitalId, tx);
      await db.accountingEntry.update({
        where: { id: entryId },
        data: {
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          entryDate,
          description: desc,
          sourceModule, // ✅ مهم جداً
          sourceId: pay.id,
          createdById: userId,
        },
      });

      await db.accountingEntryLine.deleteMany({ where: { entryId } });
    } else {
      const created = await db.accountingEntry.create({
        data: {
          hospitalId,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          entryDate,
          description: desc,
          sourceModule,
          sourceId: pay.id,
          createdById: userId,
        },
        select: { id: true },
      });
      entryId = created.id;
    }

    await db.accountingEntryLine.createMany({
      data: [
        {
          entryId: entryId!,
          accountId: apAccount.id,
          debit: amount,
          credit: 0,
          description: 'تسوية دائنون الموردين',
        },
        {
          entryId: entryId!,
          accountId: cashOrBankAccount.id,
          debit: 0,
          credit: amount,
          description: 'سداد نقدي/بنكي للمورد',
        },
      ],
    });

    // ✅ الأهم: ربط القيد بالدفعة
    if (pay.accountingEntryId !== entryId) {
      await db.supplierPayment.update({
        where: { id: pay.id },
        data: { accountingEntryId: entryId },
      });
    }
  }

  async listEquityAccounts(hospitalId: number): Promise<AccountLite[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        hospitalId,
        type: AccountType.EQUITY,
      },
      orderBy: { code: 'asc' },
    });

    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
    }));
  }

  // تقرير أعمار ذمم المرضى
  // تقرير أعمار ذمم المرضى
  async getPatientsReceivablesAging(hospitalId: number, asOf?: Date) {
    const asOfDate = asOf ?? new Date();

    // 1) فواتير المرضى التي حالتها مازالت مستحقة
    const invoicesRaw = (await this.prisma.invoice.findMany({
      where: {
        hospitalId,
        status: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID],
        },
      },
      orderBy: {
        createdAt: 'asc', // 👈 بدلنا invoiceDate بـ createdAt
      },
    })) as any[];

    if (!invoicesRaw.length) {
      return {
        asOf: asOfDate.toISOString(),
        patients: [],
        grandTotals: {
          b0_30: 0,
          b31_60: 0,
          b61_90: 0,
          b91_120: 0,
          b121_plus: 0,
          total: 0,
        },
      };
    }

    // 2) جلب بيانات المرضى بالاعتماد على patientId
    const patientIds = Array.from(
      new Set(
        invoicesRaw
          .map((inv) => inv.patientId as number | null)
          .filter((id): id is number => !!id),
      ),
    );

    const patients = await this.prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, mrn: true },
    });

    const patientMap = new Map<
      number,
      { id: number; fullName: string; mrn: string | null }
    >();

    for (const p of patients) {
      patientMap.set(p.id, {
        id: p.id,
        fullName: p.fullName,
        mrn: p.mrn ?? null,
      });
    }

    // 3) البَكِتات (الفترات الزمنية)
    type Buckets = {
      b0_30: number;
      b31_60: number;
      b61_90: number;
      b91_120: number;
      b121_plus: number;
      total: number;
    };

    function makeBuckets(): Buckets {
      return {
        b0_30: 0,
        b31_60: 0,
        b61_90: 0,
        b91_120: 0,
        b121_plus: 0,
        total: 0,
      };
    }

    const byPatient = new Map<
      number,
      {
        patientId: number;
        patientName: string;
        mrn: string | null;
        buckets: Buckets;
      }
    >();

    // 4) توزيع الأرصدة على فترات الأعمار
    for (const inv of invoicesRaw) {
      const patientInfo = patientMap.get(inv.patientId as number);
      if (!patientInfo) continue;

      // صافي الفاتورة:
      const net =
        inv.netAmount != null
          ? Number(inv.netAmount)
          : Number(inv.totalAmount ?? 0) -
            Number(inv.discountAmount ?? 0) +
            Number(inv.vatAmount ?? 0);

      const paid = Number(inv.paidAmount ?? 0);
      const remaining = net - paid;

      // لو ما فيش رصيد متبقي نتجاهل الفاتورة
      if (remaining <= 0.0001) continue;

      let holder = byPatient.get(patientInfo.id);
      if (!holder) {
        holder = {
          patientId: patientInfo.id,
          patientName: patientInfo.fullName,
          mrn: patientInfo.mrn,
          buckets: makeBuckets(),
        };
        byPatient.set(patientInfo.id, holder);
      }

      // تاريخ الفاتورة: نحاول نستخدم invoiceDate لو موجود، وإلا createdAt
      const invoiceDate: Date =
        inv.invoiceDate instanceof Date
          ? inv.invoiceDate
          : inv.createdAt instanceof Date
            ? inv.createdAt
            : new Date(inv.createdAt);

      const ageMs = asOfDate.getTime() - invoiceDate.getTime();
      let ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays < 0) ageDays = 0;

      const b = holder.buckets;

      if (ageDays <= 30) {
        b.b0_30 += remaining;
      } else if (ageDays <= 60) {
        b.b31_60 += remaining;
      } else if (ageDays <= 90) {
        b.b61_90 += remaining;
      } else if (ageDays <= 120) {
        b.b91_120 += remaining;
      } else {
        b.b121_plus += remaining;
      }

      b.total += remaining;
    }

    const patientsAging = Array.from(byPatient.values())
      .filter((p) => p.buckets.total > 0.0001)
      .map((p) => ({
        patientId: p.patientId,
        patientName: p.patientName,
        mrn: p.mrn,
        ...p.buckets,
      }))
      .sort((a, b) => b.total - a.total);

    const grand = patientsAging.reduce(
      (acc, p) => {
        acc.b0_30 += p.b0_30;
        acc.b31_60 += p.b31_60;
        acc.b61_90 += p.b61_90;
        acc.b91_120 += p.b91_120;
        acc.b121_plus += p.b121_plus;
        acc.total += p.total;
        return acc;
      },
      {
        b0_30: 0,
        b31_60: 0,
        b61_90: 0,
        b91_120: 0,
        b121_plus: 0,
        total: 0,
      },
    );

    return {
      asOf: asOfDate.toISOString(),
      patients: patientsAging,
      grandTotals: grand,
    };
  }

  async listJournalEntries(
    hospitalId: number,
    params: {
      from?: Date;
      to?: Date;
      sourceModule?: AccountingSourceModule;
      userId?: number;
      page: number;
      pageSize: number;
    },
  ): Promise<{ items: JournalEntrySummaryDto[]; total: number }> {
    const { from, to, sourceModule, userId, page, pageSize } = params;

    const where: Prisma.AccountingEntryWhereInput = {
      hospitalId,
    };

    if (from || to) {
      where.entryDate = {};
      if (from) where.entryDate.gte = from;
      if (to) where.entryDate.lte = to;
    }

    if (sourceModule) where.sourceModule = sourceModule;
    if (userId) where.createdById = userId;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accountingEntry.findMany({
        where,
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountingEntry.count({ where }),
    ]);

    if (!rows.length) {
      return { items: [], total };
    }

    const entryIds = rows.map((e) => e.id);

    const totalsByEntry = await this.prisma.accountingEntryLine.groupBy({
      by: ['entryId'],
      where: { entryId: { in: entryIds } },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const totalsMap = new Map<
      number,
      { totalDebit: number; totalCredit: number }
    >();
    for (const t of totalsByEntry) {
      totalsMap.set(t.entryId, {
        totalDebit: Number(t._sum.debit ?? 0),
        totalCredit: Number(t._sum.credit ?? 0),
      });
    }

    const createdByIds = Array.from(
      new Set(
        rows
          .map((e) => e.createdById)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );

    let usersMap = new Map<number, string>();
    if (createdByIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: createdByIds } },
        select: { id: true, fullName: true },
      });

      usersMap = new Map(users.map((u) => [u.id, u.fullName]));
    }

    const items: JournalEntrySummaryDto[] = rows.map((e) => {
      const totals = totalsMap.get(e.id) ?? { totalDebit: 0, totalCredit: 0 };

      const reference = e.sourceId ? `${e.sourceModule}-${e.sourceId}` : null;

      return {
        id: e.id,
        entryNo: this.formatEntryNumber(e),
        date: e.entryDate.toISOString(),
        description: e.description,
        sourceModule: e.sourceModule,
        reference,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        createdByName: e.createdById
          ? (usersMap.get(e.createdById) ?? 'System')
          : 'System',
      };
    });

    return { items, total };
  }

  async getJournalEntry(
    hospitalId: number,
    id: number,
  ): Promise<JournalEntryDetailDto> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id, hospitalId },
    });

    if (!entry) {
      throw new NotFoundException('هذا القيد غير موجود');
    }

    const linesRaw = await this.prisma.accountingEntryLine.findMany({
      where: { entryId: id },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const totalDebit = linesRaw.reduce(
      (sum, l) => sum + Number(l.debit || 0),
      0,
    );
    const totalCredit = linesRaw.reduce(
      (sum, l) => sum + Number(l.credit || 0),
      0,
    );

    const user =
      entry.createdById != null
        ? await this.prisma.user.findUnique({
            where: { id: entry.createdById },
            select: { fullName: true },
          })
        : null;

    const lines: JournalEntryLineDto[] = linesRaw.map((l, idx) => ({
      lineNo: idx + 1,
      accountId: l.accountId,
      accountCode: l.account?.code ?? '',
      accountName: l.account?.name ?? '',
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: l.description,
    }));

    const reference = entry.sourceId
      ? `${entry.sourceModule}-${entry.sourceId}`
      : null;

    return {
      id: entry.id,
      entryNo: this.formatEntryNumber(entry),
      date: entry.entryDate.toISOString(),
      description: entry.description,
      sourceModule: entry.sourceModule,
      reference,
      totalDebit,
      totalCredit,
      createdByName: user?.fullName ?? 'System',
      lines,
    };
  }

  /**
   * 🛡️ حماية القيود المحاسبية
   * تتحقق مما إذا كان القيد قابلاً للتعديل أو الحذف
   */
  /**
   * 🛡️ حماية القيود المحاسبية
   * تتحقق مما إذا كان القيد قابلاً للتعديل أو الحذف
   */
  private async validateEntryModification(
    entryId: number,
    hospitalId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.db(tx);

    // جلب القيد
    const entry = await db.accountingEntry.findFirst({
      where: { id: entryId, hospitalId },
    });

    if (!entry) {
      throw new NotFoundException('القيد المحاسبي غير موجود.');
    }

    // 1. التحقق من حالة السنة المالية (بشكل منفصل لأن العلاقة غير موجودة في السكيما)
    if (entry.financialYearId) {
      const year = await db.financialYear.findUnique({
        where: { id: entry.financialYearId },
      });

      if (year && year.status === FinancialYearStatus.CLOSED) {
        throw new BadRequestException(
          'لا يمكن تعديل أو حذف القيود في سنة مالية مغلقة.',
        );
      }
    }

    // 2. منع حذف القيود الآلية (المحمية)
    const protectedModules: AccountingSourceModule[] = [
      AccountingSourceModule.BILLING,
      AccountingSourceModule.PAYROLL,
      AccountingSourceModule.INVENTORY,
      AccountingSourceModule.CASHIER,
      AccountingSourceModule.SUPPLIER_PAYMENT,
      AccountingSourceModule.PROCUREMENT_GRN,
      AccountingSourceModule.PROCUREMENT_INV,
      AccountingSourceModule.CLOSING,
    ];

    if (protectedModules.includes(entry.sourceModule)) {
      throw new BadRequestException(
        `هذا القيد تم توليده آلياً بواسطة نظام (${entry.sourceModule})، لا يمكن حذفه يدوياً. يجب إلغاء المستند الأصلي لإجراء تسوية.`,
      );
    }

    return entry;
  }

  /**
   * حذف قيد محاسبي يدوي (يستدعى من الـ Controller)
   */
  async deleteManualEntry(hospitalId: number, entryId: number) {
    return this.prisma.$transaction(async (tx) => {
      // التحقق من الحماية داخلياً
      await this.validateEntryModification(entryId, hospitalId, tx);

      // حذف الأسطر
      await tx.accountingEntryLine.deleteMany({
        where: { entryId },
      });

      // حذف القيد الأساسي
      await tx.accountingEntry.delete({
        where: { id: entryId },
      });

      this.logger.log(
        `Manual Entry #${entryId} deleted in hospital ${hospitalId}`,
      );
      return { success: true };
    });
  }

  /**
   * 🛡️ التحقق الصارم: هل التاريخ يقع في فترة مالية مفتوحة؟
   * يرمي خطأ BadRequestException إذا كانت الفترة مغلقة أو غير موجودة.
   */
  async validateDateInOpenPeriod(hospitalId: number, date: Date) {
    // 1. تحديد بداية اليوم (لتجنب مشاكل التوقيت)
    const targetDate = startOfDayUtc(date);

    // 2. البحث عن الفترة التي تغطي هذا التاريخ
    const period = await this.prisma.financialPeriod.findFirst({
      where: {
        financialYear: {
          hospitalId,
          // نتأكد أن السنة نفسها ليست مؤرشفة أو محذوفة
          status: { not: 'ARCHIVED' },
        },
        monthStartDate: { lte: targetDate },
        monthEndDate: { gte: targetDate },
      },
      include: { financialYear: true },
    });

    // 3. التحقق من الوجود
    if (!period) {
      throw new BadRequestException(
        `التاريخ ${date.toLocaleDateString()} لا يقع ضمن أي فترة مالية معرفة في النظام.`,
      );
    }

    // 4. التحقق من حالة السنة
    if (period.financialYear.status === 'CLOSED') {
      throw new BadRequestException(
        `لا يمكن إجراء عمليات في هذا التاريخ لأن السنة المالية (${period.financialYear.name}) مغلقة.`,
      );
    }

    // 5. التحقق من حالة الفترة (الشهر)
    if (!period.isOpen) {
      throw new BadRequestException(
        `الفترة المالية (${period.periodCode}) مغلقة. لا يمكن إجراء تغييرات مالية بأثر رجعي.`,
      );
    }

    // ✅ نجح التحقق، نرجع الفترة والسنة لاستخدامهم (مثل ربط القيد بهم)
    return { period, financialYear: period.financialYear };
  }

  async recordCreditNoteEntry(params: {
    creditNoteId: number;
    originalInvoiceId: number;
    hospitalId: number;
    userId: number;
    revenueSplit?: Record<SystemAccountKey, number>;
    prisma?: any; // Allow passing transaction client
  }) {
    const { creditNoteId, originalInvoiceId, hospitalId, userId, revenueSplit, prisma } = params;
    const db = prisma || this.prisma;

    // 1. جلب الفاتورة الأصلية والمرتجع
    const original = await db.invoice.findUnique({
      where: { id: originalInvoiceId },
    });
    const creditNote = await db.invoice.findUnique({
      where: { id: creditNoteId },
    });

    if (!original || !creditNote) throw new Error('Invoices data missing');

    const entryDate = new Date();
    const { fy, period } = await this.getOpenPeriodForDate(
      hospitalId,
      entryDate,
    );

    // 2. تحديد الحسابات (نفس حسابات الفاتورة لكن بعكس الإشارات)
    const arAccount = await this.getSystemAccountOrThrow(
      hospitalId,
      SystemAccountKey.RECEIVABLE_PATIENTS,
    );

    // ✅ بناء سطور الإيرادات بناءً على الـ Split أو الافتراضي
    // ✅ بناء سطور مردودات المبيعات (بدلاً من خصم الإيرادات مباشرة)
    const linesTocreate: any[] = [];
    const val = Number(creditNote.totalAmount); 
    const totalRevenueDebit = val;

    try {
      const salesReturnsAcc = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.SALES_RETURNS);
      linesTocreate.push({
        accountId: salesReturnsAcc.id,
        debit: val,
        credit: 0,
        description: 'مردودات مبيعات (مرتجعات عامة)',
      });
    } catch (err) {
      // Fallback in case the user hasn't successfully initialized the SALES_RETURNS mapping yet
      const defRev = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.REVENUE_OUTPATIENT);
      linesTocreate.push({
        accountId: defRev.id,
        debit: val,
        credit: 0,
        description: 'مردودات مبيعات (طوارئ)',
      });
    }

    // ✅ إضافة سطر الذمم (الدائن)
    linesTocreate.push({
      accountId: arAccount.id,
      debit: 0,
      credit: totalRevenueDebit, // Matching debits
      description: 'تخفيض مستحقات مريض - مرتجع',
    });

    await db.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: AccountingSourceModule.BILLING, // Or SALES_RETURN
        sourceId: creditNoteId,
        description: `فاتورة مرتجع رقم ${creditNote.id} (أصل: ${original.id})`,
        createdById: userId,
        lines: {
          create: linesTocreate,
        },
      },
    });
  }

  // ✅ [NEW] قيد مرتجع مشتريات (إلى المورد)
  async recordPurchaseReturnEntry(params: {
    purchaseReturnId: number;
    hospitalId: number;
    userId: number;
  }) {
    const { purchaseReturnId, hospitalId, userId } = params;

    const ret = await this.prisma.purchaseReturn.findUnique({
      where: { id: purchaseReturnId },
      include: { supplier: true },
    });
    if (!ret) throw new NotFoundException('Purchase Return not found');

    if (ret.hospitalId !== hospitalId) throw new BadRequestException('Hospital Mismatch');

    const entryDate = ret.returnDate;
    const { fy, period } = await this.getOpenPeriodForDate(hospitalId, entryDate);

    // 1. تحديد الحسابات
    // AP Suppliers
    const apAccount = await this.prisma.account.findFirst({
      where: { hospitalId, code: ACCOUNT_CODES.AP_SUPPLIERS },
    });
    if (!apAccount) throw new Error('AP Suppliers account missing');

    // Inventory (General or default to Supplies/Drugs - simplification: defaulting to Supplies if mixed, or could split if needed)
    // For now, let's assume Supplies/Drugs based on a generic check or default to INVENTORY_SUPPLIES
    // Ideally we should check the lines.
    const inventoryKey = SystemAccountKey.INVENTORY_SUPPLIES; 
    const inventoryAccount = await this.getSystemAccountOrThrow(hospitalId, inventoryKey);
    
    // VAT Recoverable
    const vatAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.VAT_RECOVERABLE);

    const netAmount = Number(ret.netAmount);
    const vatAmount = Number(ret.vatAmount);
    const totalAmount = Number(ret.totalAmount); // Net + VAT? Or Total = Net? Usually Total = Net + VAT.

    // قيد المرتجع:
    // Debit: الموردين (نقص الالتزام) = المجموع الكلي
    // Credit: المخزون (نقص الأصل) = الصافي
    // Credit: ضريبة المدخلات (عكس الاسترداد) = الضريبة

    await this.prisma.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: AccountingSourceModule.PURCHASE_RETURN,
        sourceId: ret.id,
        description: `مرتجع مشتريات رقم ${ret.id} للمورد ${ret.supplier.name}`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: apAccount.id,
              debit: totalAmount,
              credit: 0,
              description: 'تخفيض التزام المورد (مرتجع)',
            },
            {
              accountId: inventoryAccount.id,
              debit: 0,
              credit: netAmount,
              description: 'إخراج بضاعة من المخزون (مرتجع)',
            },
            ...(vatAmount > 0 ? [{
              accountId: vatAccount.id,
              debit: 0,
              credit: vatAmount, // دائن لأننا بنقلل اللي "لينا" عند الحكومة
              description: 'عكس ضريبة مدخلات',
            }] : [])
          ]
        }
      }
    });

    this.logger.log(`Purchase Return Entry created for #${ret.id}`);
  }

  // ✅ [NEW] قيد استرداد نقدي لمريض (Refund Payment)
  async recordPatientRefundEntry(params: {
    refundAmount: number;
    method: 'CASH' | 'BANK'; // Could use PaymentMethod enum
    patientName: string;
    hospitalId: number;
    userId: number;
    referenceId?: string; // Refund ID or Payment ID
  }) {
    const { refundAmount, method, patientName, hospitalId, userId, referenceId } = params;

    const entryDate = new Date();
    const { fy, period } = await this.getOpenPeriodForDate(hospitalId, entryDate);

    // Debit: AR (Receivable Patients) - because creation of CN made AR Credit (negative asset). We debit it to zero it out.
    // Credit: Cash/Bank (Asset decreases)

    const arAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.RECEIVABLE_PATIENTS);
    
    const cashOrBankKey = method === 'CASH' ? SystemAccountKey.CASH_MAIN : SystemAccountKey.BANK_MAIN;
    const paymentAccount = await this.getSystemAccountOrThrow(hospitalId, cashOrBankKey);

    await this.prisma.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: AccountingSourceModule.PATIENT_REFUND,
        sourceId: Number(referenceId) || null, // Assuming referenceId might be int
        description: `استرداد نقدي للمريض ${patientName}`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: arAccount.id,
              debit: refundAmount,
              credit: 0,
              description: 'إقفال رصيد دائن للمريض (استرداد)',
            },
            {
              accountId: paymentAccount.id,
              debit: 0,
              credit: refundAmount,
              description: 'صرف نقدية/بنك (استرداد)',
            }
          ]
        }
      }
    });
  }

  // ✅ [NEW] قيد مرتجع أدوية (داخلي للمخزون)
  // يستخدم عندما يرجع المريض الدواء للصيدلية ويعود للمخزون
  async recordPharmacyReturnEntry(params: {
    dispenseId?: number; // Optional link to dispense
    returnId?: number;   // Optional link to return transaction
    items: { productId: number; cost: number; quantity: number }[];
    storeId?: number; // Warehouse ID
    hospitalId: number;
    userId: number;
  }) {
    const { items, hospitalId, userId, returnId } = params;

    if (!items.length) return;

    const entryDate = new Date();
    const { fy, period } = await this.getOpenPeriodForDate(hospitalId, entryDate);

    // Accounts
    const inventoryAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.INVENTORY_DRUGS);
    const cogsAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.COGS_DRUGS);

    const totalCost = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);

    // Debit: Inventory (Increase Asset)
    // Credit: COGS (Decrease Expense)

    await this.prisma.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: AccountingSourceModule.INVENTORY, // Or PHARMACY
        sourceId: returnId ?? null,
        description: `مرتجع أدوية للمخزون`,
        createdById: userId,
        lines: {
          create: [
            {
              accountId: inventoryAccount.id,
              debit: totalCost,
              credit: 0,
              description: 'إرجاع مخزني - أدوية',
            },
            {
              accountId: cogsAccount.id,
              debit: 0,
              credit: totalCost,
              description: 'عكس تكلفة بضاعة مباعة',
            }
          ]
        }
      }
    });
  }

  // ✅ [NEW] قيد تسوية الجرد (Inventory Adjustment)
  async recordInventoryAdjustmentEntry(params: {
    inventoryCountId: number;
    hospitalId: number;
    userId: number;
    varianceLines: { productId: number; varianceQty: number; costPrice: number }[];
    tx?: any;
  }) {
    const { inventoryCountId, hospitalId, userId, varianceLines, tx } = params;
    const db = tx || this.prisma;

    // 1. Group by Product Type to find relevant Inventory Accounts (Drugs vs Supplies vs Lab)
    // To do this strictly, we need Product details. We can fetch them or assume they are passed?
    // Let's fetch them here to be safe and accurate.
    const productIds = varianceLines.map((v) => v.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, type: true },
    });
    
    // Helper to get Account Key by Product Type
    const getInventoryKey = (type: any): SystemAccountKey => {
      switch (type) {
        case 'DRUG': return SystemAccountKey.INVENTORY_DRUGS;
        case 'LAB_REAGENT': return SystemAccountKey.INVENTORY_LAB;
        /* case 'RADIOLOGY': return SystemAccountKey.INVENTORY_RADIOLOGY; */ // If exists
        default: return SystemAccountKey.INVENTORY_SUPPLIES;
      }
    };

    // 2. Prepare Totals per Inventory Account
    // We also need separate totals for LOSS (Expense) vs GAIN (Income)
    // Structure: Map<AccountKey, { gain: number, loss: number }>
    
    const accountTotals = new Map<SystemAccountKey, { gain: number; loss: number }>();

    for (const item of varianceLines) {
      const product = products.find((p: any) => p.id === item.productId);
      const key = getInventoryKey(product?.type);
      
      const value = item.varianceQty * item.costPrice;

      const current = accountTotals.get(key) || { gain: 0, loss: 0 };
      if (value > 0) {
        current.gain += value;
      } else {
        current.loss += Math.abs(value);
      }
      accountTotals.set(key, current);
    }

    // 3. Get Financial Period
    const entryDate = new Date();
    const { fy, period } = await this.getOpenPeriodForDate(hospitalId, entryDate);

    // 4. Get Account IDs
    const gainAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.INVENTORY_GAIN);
    const lossAccount = await this.getSystemAccountOrThrow(hospitalId, SystemAccountKey.INVENTORY_LOSS);

    const linesToIsert: any[] = [];

    // 5. Generate Lines
    for (const [invKey, totals] of accountTotals.entries()) {
      const invAccount = await this.getSystemAccountOrThrow(hospitalId, invKey);

      // A. Handling GAINS (Increase Asset, Credit Gain)
      if (totals.gain > 0) {
        // Dr Inventory Asset
        linesToIsert.push({
          accountId: invAccount.id,
          debit: totals.gain,
          credit: 0,
          description: `تسوية جردية - زيادة مخزون (${invKey})`,
        });
        // Cr Inventory Gain (Income/Revenue)
        linesToIsert.push({
          accountId: gainAccount.id,
          debit: 0,
          credit: totals.gain,
          description: `أرباح فروقات جرد - زيادة`,
        });
      }

      // B. Handling LOSSES (Increase Expense, Credit Asset)
      if (totals.loss > 0) {
        // Dr Inventory Loss (Expense)
        linesToIsert.push({
          accountId: lossAccount.id,
          debit: totals.loss,
          credit: 0,
          description: `عجز جرد - مصروفات`,
        });
        // Cr Inventory Asset
        linesToIsert.push({
          accountId: invAccount.id,
          debit: 0,
          credit: totals.loss,
          description: `تسوية جردية - تخفيض مخزون (${invKey})`,
        });
      }
    }

    if (linesToIsert.length === 0) return; // No financial impact

    // 6. Create Entry
    await db.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: AccountingSourceModule.INVENTORY_ADJUSTMENT,
        sourceId: inventoryCountId,
        description: `قيد تسوية جرد رقم #${inventoryCountId}`,
        createdById: userId,
        lines: {
          create: linesToIsert,
        },
        inventoryCount: {
           connect: { id: inventoryCountId }
        }
      },
    });
  }

  /**
   * ✅ إنشاء قيد عكسي (Reversal Entry) لتصحيح قيد خاطئ دون حذفه
   * هذا يتوافق مع المعايير المحاسبية (GAAP/IFRS)
   */
  async reverseEntry(
    hospitalId: number,
    originalEntryId: number,
    userId: number,
    reason: string,
    prismaTx?: Prisma.TransactionClient,
  ) {
    const db = prismaTx || this.prisma;

    // 1. جلب القيد الأصلي
    const originalEntry = await db.accountingEntry.findFirst({
      where: { id: originalEntryId, hospitalId },
      include: { lines: true },
    });

    if (!originalEntry) {
      throw new NotFoundException('القيد المحاسبي غير موجود.');
    }

    // 2. التحقق هل تم عكسه مسبقاً؟
    const alreadyReversed = await db.accountingEntry.findFirst({
      where: {
        sourceModule: AccountingSourceModule.JOURNAL_REVERSAL,
        sourceId: originalEntryId,
      },
    });

    if (alreadyReversed) {
      throw new BadRequestException('تم عكس هذا القيد مسبقاً.');
    }

    // سنستخدم تاريخ اليوم
    const entryDate = new Date();
    
    // محاولة جلب السنة والفترة المفتوحة
    const fy = await db.financialYear.findFirst({
        where: {
            hospitalId,
            status: FinancialYearStatus.OPEN,
            startDate: { lte: entryDate },
            endDate: { gte: entryDate }
        }
    });

    if (!fy) throw new BadRequestException('لا توجد سنة مالية مفتوحة لهذا التاريخ.');

    const period = await db.financialPeriod.findFirst({
        where: {
            financialYearId: fy.id,
            isOpen: true,
            monthStartDate: { lte: entryDate },
            monthEndDate: { gte: entryDate }
        }
    });

    if (!period) throw new BadRequestException('الفترة المالية مغلقة أو غير موجودة.');

    // 3. إنشاء قيد العكس
    // نعكس المدين والدائن: Debit -> Credit, Credit -> Debit
    const reversalLines = originalEntry.lines.map((line) => ({
      accountId: line.accountId,
      costCenterId: line.costCenterId,
      debit: line.credit, // Swap
      credit: line.debit, // Swap
      description: `عكس القيد #${originalEntry.id} - ${reason}`,
    }));

    const reversalEntry = await db.accountingEntry.create({
      data: {
        hospitalId,
        entryDate,
        description: `قيد عكسي للقيد #${originalEntry.id}: ${originalEntry.description} - سبب العكس: ${reason}`,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        sourceModule: AccountingSourceModule.JOURNAL_REVERSAL,
        sourceId: originalEntry.id, // ربط بالقيد الأصلي
        createdById: userId,
        lines: {
          create: reversalLines,
        },
      },
    });

    this.logger.log(
      `Reversed entry #${originalEntryId} with new entry #${reversalEntry.id}`,
    );
    return reversalEntry;
  }

  // ✅ [NEW] قيد أذونات الصرف والقبض
  async recordVoucherEntry(params: {
    voucherId: number;
    hospitalId: number;
    userId: number;
    prisma?: any;
  }) {
    const { voucherId, hospitalId, userId, prisma } = params;
    const db = prisma || this.prisma;

    const voucher = await db.voucher.findUnique({
      where: { id: voucherId },
      include: { account: true, cashAccount: true },
    });
    if (!voucher) throw new Error('Voucher not found');

    const entryDate = voucher.date;
    const { fy, period } = await this.getOpenPeriodForDate(hospitalId, entryDate);

    const val = Number(voucher.amount);

    const linesTocreate: any[] = [];

    if (voucher.type === 'PAYMENT') {
      // إذن صرف (مدين للمصروف/الذمة، دائن للصندوق)
      linesTocreate.push({
        accountId: voucher.accountId,
        debit: val,
        credit: 0,
        description: voucher.notes || `إذن صرف رقم ${voucher.code}`,
      });
      linesTocreate.push({
        accountId: voucher.cashAccountId,
        debit: 0,
        credit: val,
        description: voucher.notes || `إذن صرف رقم ${voucher.code}`,
      });
    } else {
      // إذن قبض (مدين للصندوق، دائن للإيراد/الذمة)
      linesTocreate.push({
        accountId: voucher.cashAccountId,
        debit: val,
        credit: 0,
        description: voucher.notes || `إذن قبض رقم ${voucher.code}`,
      });
      linesTocreate.push({
        accountId: voucher.accountId,
        debit: 0,
        credit: val,
        description: voucher.notes || `إذن قبض رقم ${voucher.code}`,
      });
    }

    await db.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: fy.id,
        financialPeriodId: period.id,
        entryDate,
        sourceModule: 'VOUCHER',
        sourceId: voucher.id,
        description: voucher.type === 'PAYMENT' ? `إذن صرف رقم ${voucher.code}` : `إذن قبض رقم ${voucher.code}`,
        createdById: userId,
        lines: {
          create: linesTocreate,
        },
      },
    });
  }
}
