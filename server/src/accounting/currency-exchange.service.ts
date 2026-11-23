import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money, RATE_SCALE } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  ConvertCurrencyDto,
  CreateCurrencyDto,
  CreateExchangeRateDto,
} from './dto/treasury-fx.dto';

export interface TreasuryAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

export interface EffectiveRateResolution {
  fromCurrency: { id: number; code: string; decimalPlaces: number };
  toCurrency: { id: number; code: string; decimalPlaces: number };
  rate: string;
  effectiveDate: Date;
  source: string;
  triangulated: boolean;
  rateIds: number[];
}

const CURRENCY_SELECT = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  symbol: true,
  decimalPlaces: true,
  isBase: true,
  isActive: true,
  createdAt: true,
} as const;

const USER_LITE = {
  id: true,
  fullName: true,
  username: true,
} as const;

@Injectable()
export class CurrencyExchangeService {
  constructor(private readonly prisma: PrismaService) {}

  async createCurrency(
    hospitalId: number,
    userId: number,
    dto: CreateCurrencyDto,
    meta?: TreasuryAuditMeta,
  ) {
    const code = dto.code.trim().toUpperCase();
    const decimalPlaces = dto.decimalPlaces ?? 3;
    const isBase = Boolean(dto.isBase);

    const { currency, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.currency.findUnique({
        where: { hospitalId_code: { hospitalId, code } },
      });
      if (existing) {
        throw new ConflictException(
          `العملة ${code} مسجلة مسبقًا في هذه المنشأة`,
        );
      }

      if (isBase) {
        const existingBase = await tx.currency.findFirst({
          where: { hospitalId, isBase: true },
        });
        if (existingBase) {
          throw new ConflictException(
            `العملة الأساسية للمنشأة محددة مسبقًا (${existingBase.code}) ولا يمكن تعيين أكثر من عملة أساسية`,
          );
        }
      }

      const created = await tx.currency.create({
        data: {
          hospitalId,
          code,
          nameAr: dto.nameAr.trim(),
          nameEn: dto.nameEn.trim(),
          symbol: dto.symbol.trim(),
          decimalPlaces,
          isBase,
          createdById: userId,
        },
        select: CURRENCY_SELECT,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_CURRENCY_CREATED',
        entity: 'Currency',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          code: created.code,
          decimalPlaces: created.decimalPlaces,
          isBase: created.isBase,
        },
      });

      return { currency: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return currency;
  }

  async listCurrencies(hospitalId: number, includeInactive = false) {
    return this.prisma.currency.findMany({
      where: {
        hospitalId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: CURRENCY_SELECT,
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    });
  }

  async recordExchangeRate(
    hospitalId: number,
    userId: number,
    dto: CreateExchangeRateDto,
    meta?: TreasuryAuditMeta,
  ) {
    if (dto.fromCurrencyId === dto.toCurrencyId) {
      throw new BadRequestException('عملة المصدر والهدف يجب أن تكونا مختلفتين');
    }

    const rateDec = Money.roundDecimal(dto.rate, RATE_SCALE);
    if (!Money.isPositive(rateDec)) {
      throw new BadRequestException('سعر الصرف يجب أن يكون أكبر من الصفر');
    }

    const inverseDec = Money.roundDecimal(Money.divide(1, rateDec), RATE_SCALE);
    if (!Money.isPositive(inverseDec)) {
      throw new BadRequestException('تعذر احتساب سعر الصرف العكسي بدقة صالحة');
    }

    const effectiveDate = new Date(dto.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new BadRequestException('تاريخ سريان سعر الصرف غير صالح');
    }

    const source = dto.source ?? 'MANUAL';

    const { record, audit } = await this.prisma.$transaction(async (tx) => {
      const [fromCurr, toCurr] = await Promise.all([
        tx.currency.findFirst({
          where: { id: dto.fromCurrencyId, hospitalId, isActive: true },
        }),
        tx.currency.findFirst({
          where: { id: dto.toCurrencyId, hospitalId, isActive: true },
        }),
      ]);

      if (!fromCurr) {
        throw new NotFoundException(
          'عملة المصدر غير موجودة أو غير نشطة في هذه المنشأة',
        );
      }
      if (!toCurr) {
        throw new NotFoundException(
          'عملة الهدف غير موجودة أو غير نشطة في هذه المنشأة',
        );
      }

      const duplicate = await tx.exchangeRate.findUnique({
        where: {
          hospitalId_fromCurrencyId_toCurrencyId_effectiveDate_source: {
            hospitalId,
            fromCurrencyId: fromCurr.id,
            toCurrencyId: toCurr.id,
            effectiveDate,
            source,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `سعر الصرف لنفس الزوج (${fromCurr.code}/${toCurr.code}) وتاريخ السريان والمصدر مسجل مسبقًا`,
        );
      }

      const created = await tx.exchangeRate.create({
        data: {
          hospitalId,
          fromCurrencyId: fromCurr.id,
          toCurrencyId: toCurr.id,
          rate: Money.toRateDbString(rateDec),
          inverseRate: Money.toRateDbString(inverseDec),
          effectiveDate,
          source,
          referenceNote: dto.referenceNote?.trim() || null,
          createdById: userId,
        },
        include: {
          fromCurrency: { select: CURRENCY_SELECT },
          toCurrency: { select: CURRENCY_SELECT },
          createdBy: { select: USER_LITE },
          verifiedBy: { select: USER_LITE },
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_FX_RATE_RECORDED',
        entity: 'ExchangeRate',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          pair: `${fromCurr.code}/${toCurr.code}`,
          rate: Money.toRateDbString(created.rate),
          inverseRate: Money.toRateDbString(created.inverseRate),
          effectiveDate: created.effectiveDate.toISOString(),
          source: created.source,
        },
      });

      return { record: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return this.formatRateRow(record);
  }

  async verifyExchangeRate(
    hospitalId: number,
    rateId: number,
    verifierId: number,
    meta?: TreasuryAuditMeta,
  ) {
    const { record, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.exchangeRate.findFirst({
        where: { id: rateId, hospitalId },
        include: {
          fromCurrency: { select: CURRENCY_SELECT },
          toCurrency: { select: CURRENCY_SELECT },
        },
      });
      if (!existing) {
        throw new NotFoundException('سعر الصرف غير موجود في هذه المنشأة');
      }
      if (existing.isVerified) {
        throw new ConflictException('تم اعتماد هذا السعر مسبقًا');
      }
      if (existing.createdById === verifierId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يجوز لمنشئ سعر الصرف اعتماده بنفسه',
        );
      }

      const updated = await tx.exchangeRate.update({
        where: { id: existing.id },
        data: {
          isVerified: true,
          verifiedById: verifierId,
          verifiedAt: new Date(),
        },
        include: {
          fromCurrency: { select: CURRENCY_SELECT },
          toCurrency: { select: CURRENCY_SELECT },
          createdBy: { select: USER_LITE },
          verifiedBy: { select: USER_LITE },
        },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: verifierId,
        action: 'TREASURY_FX_RATE_VERIFIED',
        entity: 'ExchangeRate',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          pair: `${existing.fromCurrency.code}/${existing.toCurrency.code}`,
          rate: Money.toRateDbString(updated.rate),
        },
      });

      return { record: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return this.formatRateRow(record);
  }

  async listExchangeRates(
    hospitalId: number,
    filters?: {
      fromCode?: string;
      toCode?: string;
      verifiedOnly?: boolean;
      limit?: number;
    },
  ) {
    const where: Prisma.ExchangeRateWhereInput = { hospitalId };
    if (filters?.fromCode) {
      where.fromCurrency = { code: filters.fromCode.trim().toUpperCase() };
    }
    if (filters?.toCode) {
      where.toCurrency = { code: filters.toCode.trim().toUpperCase() };
    }
    if (filters?.verifiedOnly) {
      where.isVerified = true;
    }

    const rows = await this.prisma.exchangeRate.findMany({
      where,
      include: {
        fromCurrency: { select: CURRENCY_SELECT },
        toCurrency: { select: CURRENCY_SELECT },
        createdBy: { select: USER_LITE },
        verifiedBy: { select: USER_LITE },
      },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(filters?.limit ?? 100, 1), 500),
    });

    return rows.map((row) => this.formatRateRow(row));
  }

  async resolveEffectiveRate(
    hospitalId: number,
    fromCodeRaw: string,
    toCodeRaw: string,
    asOfDate: Date = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<EffectiveRateResolution> {
    const fromCode = fromCodeRaw.trim().toUpperCase();
    const toCode = toCodeRaw.trim().toUpperCase();

    const [fromCurr, toCurr] = await Promise.all([
      client.currency.findFirst({
        where: { hospitalId, code: fromCode, isActive: true },
      }),
      client.currency.findFirst({
        where: { hospitalId, code: toCode, isActive: true },
      }),
    ]);

    if (!fromCurr) {
      throw new NotFoundException(`العملة ${fromCode} غير مسجلة أو غير نشطة`);
    }
    if (!toCurr) {
      throw new NotFoundException(`العملة ${toCode} غير مسجلة أو غير نشطة`);
    }

    if (fromCurr.id === toCurr.id) {
      return {
        fromCurrency: fromCurr,
        toCurrency: toCurr,
        rate: Money.toRateDbString(1),
        effectiveDate: asOfDate,
        source: 'IDENTITY',
        triangulated: false,
        rateIds: [],
      };
    }

    const directOrInverse = await this.findDirectOrInverseRate(
      client,
      hospitalId,
      fromCurr.id,
      toCurr.id,
      asOfDate,
    );
    if (directOrInverse) {
      return {
        fromCurrency: fromCurr,
        toCurrency: toCurr,
        rate: directOrInverse.rate,
        effectiveDate: directOrInverse.effectiveDate,
        source: directOrInverse.source,
        triangulated: false,
        rateIds: [directOrInverse.id],
      };
    }

    // Triangulate through hospital base currency when direct pair does not exist
    const baseCurr = await client.currency.findFirst({
      where: { hospitalId, isBase: true, isActive: true },
    });
    if (baseCurr && baseCurr.id !== fromCurr.id && baseCurr.id !== toCurr.id) {
      const leg1 = await this.findDirectOrInverseRate(
        client,
        hospitalId,
        fromCurr.id,
        baseCurr.id,
        asOfDate,
      );
      const leg2 = await this.findDirectOrInverseRate(
        client,
        hospitalId,
        baseCurr.id,
        toCurr.id,
        asOfDate,
      );

      if (leg1 && leg2) {
        const crossRate = Money.roundDecimal(
          Money.multiply(leg1.rate, leg2.rate),
          RATE_SCALE,
        );
        return {
          fromCurrency: fromCurr,
          toCurrency: toCurr,
          rate: Money.toRateDbString(crossRate),
          effectiveDate:
            leg1.effectiveDate > leg2.effectiveDate
              ? leg1.effectiveDate
              : leg2.effectiveDate,
          source: `TRIANGULATED_VIA_${baseCurr.code}`,
          triangulated: true,
          rateIds: [leg1.id, leg2.id],
        };
      }
    }

    throw new NotFoundException(
      `لا يوجد سعر صرف معتمد أو فعال لزوج ${fromCode}/${toCode} حتى تاريخ ${asOfDate.toISOString().slice(0, 10)}`,
    );
  }

  async convertAmount(hospitalId: number, dto: ConvertCurrencyDto) {
    const asOfDate = dto.asOfDate ? new Date(dto.asOfDate) : new Date();
    if (Number.isNaN(asOfDate.getTime())) {
      throw new BadRequestException('تاريخ التحويل غير صالح');
    }

    const resolved = await this.resolveEffectiveRate(
      hospitalId,
      dto.fromCode,
      dto.toCode,
      asOfDate,
    );

    const rawConverted = Money.multiply(dto.amount, resolved.rate);
    const targetScale = resolved.toCurrency.decimalPlaces;
    const roundedTarget = Money.roundDecimal(rawConverted, targetScale);

    return {
      fromCode: resolved.fromCurrency.code,
      toCode: resolved.toCurrency.code,
      inputAmount: Money.toDbString(dto.amount),
      rateUsed: resolved.rate,
      convertedAmount: roundedTarget.toFixed(targetScale),
      convertedAmountStandard3dp: Money.toDbString(rawConverted),
      effectiveDate: resolved.effectiveDate,
      source: resolved.source,
      triangulated: resolved.triangulated,
      rateIds: resolved.rateIds,
    };
  }

  private async findDirectOrInverseRate(
    client: Prisma.TransactionClient | PrismaService,
    hospitalId: number,
    fromCurrencyId: number,
    toCurrencyId: number,
    asOfDate: Date,
  ): Promise<{
    id: number;
    rate: string;
    effectiveDate: Date;
    source: string;
  } | null> {
    // Prefer verified rates first, then latest effectiveDate
    const direct = await client.exchangeRate.findFirst({
      where: {
        hospitalId,
        fromCurrencyId,
        toCurrencyId,
        effectiveDate: { lte: asOfDate },
      },
      orderBy: [
        { isVerified: 'desc' },
        { effectiveDate: 'desc' },
        { id: 'desc' },
      ],
    });

    const inverse = await client.exchangeRate.findFirst({
      where: {
        hospitalId,
        fromCurrencyId: toCurrencyId,
        toCurrencyId: fromCurrencyId,
        effectiveDate: { lte: asOfDate },
      },
      orderBy: [
        { isVerified: 'desc' },
        { effectiveDate: 'desc' },
        { id: 'desc' },
      ],
    });

    if (direct && inverse) {
      if (direct.isVerified !== inverse.isVerified) {
        return direct.isVerified
          ? {
              id: direct.id,
              rate: Money.toRateDbString(direct.rate),
              effectiveDate: direct.effectiveDate,
              source: direct.source,
            }
          : {
              id: inverse.id,
              rate: Money.toRateDbString(inverse.inverseRate),
              effectiveDate: inverse.effectiveDate,
              source: `${inverse.source}_INVERSE`,
            };
      }
      if (direct.effectiveDate >= inverse.effectiveDate) {
        return {
          id: direct.id,
          rate: Money.toRateDbString(direct.rate),
          effectiveDate: direct.effectiveDate,
          source: direct.source,
        };
      }
      return {
        id: inverse.id,
        rate: Money.toRateDbString(inverse.inverseRate),
        effectiveDate: inverse.effectiveDate,
        source: `${inverse.source}_INVERSE`,
      };
    }

    if (direct) {
      return {
        id: direct.id,
        rate: Money.toRateDbString(direct.rate),
        effectiveDate: direct.effectiveDate,
        source: direct.source,
      };
    }

    if (inverse) {
      return {
        id: inverse.id,
        rate: Money.toRateDbString(inverse.inverseRate),
        effectiveDate: inverse.effectiveDate,
        source: `${inverse.source}_INVERSE`,
      };
    }

    return null;
  }

  private formatRateRow<
    T extends {
      rate: Prisma.Decimal | string | number;
      inverseRate: Prisma.Decimal | string | number;
    },
  >(row: T) {
    return {
      ...row,
      rate: Money.toRateDbString(row.rate),
      inverseRate: Money.toRateDbString(row.inverseRate),
    };
  }
}
