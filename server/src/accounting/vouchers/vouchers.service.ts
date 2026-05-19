import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../accounting.service';
import { CreateVoucherDto, UpdateVoucherDto } from './dto/voucher.dto';
import { VoucherStatus, AccountingSourceModule } from '@prisma/client';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async create(hospitalId: number, userId: number, dto: CreateVoucherDto) {
    return this.prisma.voucher.create({
      data: {
        hospitalId,
        type: dto.type as any,
        date: new Date(dto.date),
        amount: dto.amount,
        accountId: dto.accountId,
        cashAccountId: dto.cashAccountId,
        notes: dto.notes,
        payeeOrPayer: dto.payeeOrPayer,
        reference: dto.reference,
        createdById: userId,
        status: VoucherStatus.DRAFT,
      },
    });
  }

  async findAll(hospitalId: number, query: any) {
    const { type, status, from, to } = query;
    return this.prisma.voucher.findMany({
      where: {
        hospitalId,
        type: type ? type : undefined,
        status: status ? status : undefined,
        date: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: {
        account: { select: { id: true, code: true, name: true } },
        cashAccount: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(hospitalId: number, id: number) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id, hospitalId },
      include: {
        account: true,
        cashAccount: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!voucher) throw new NotFoundException('Voucher not found');
    return voucher;
  }

  async update(hospitalId: number, id: number, dto: UpdateVoucherDto) {
    const voucher = await this.findOne(hospitalId, id);
    if (voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException('Cannot update a non-draft voucher');
    }
    return this.prisma.voucher.update({
      where: { id },
      data: {
        type: dto.type as any,
        date: new Date(dto.date),
        amount: dto.amount,
        accountId: dto.accountId,
        cashAccountId: dto.cashAccountId,
        notes: dto.notes,
        payeeOrPayer: dto.payeeOrPayer,
        reference: dto.reference,
      },
    });
  }

  async remove(hospitalId: number, id: number) {
    const voucher = await this.findOne(hospitalId, id);
    if (voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException('Cannot delete a non-draft voucher');
    }
    return this.prisma.voucher.delete({ where: { id } });
  }

  async post(hospitalId: number, id: number, userId: number) {
    const voucher = await this.findOne(hospitalId, id);
    if (voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException('Voucher is already posted or cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Generate Code PV-0001 or RV-0001
      const prefix = voucher.type === 'PAYMENT' ? 'PV' : 'RV';
      const count = await tx.voucher.count({
        where: { hospitalId, type: voucher.type as any },
      });
      const code = `${prefix}-${String(count + 1).padStart(5, '0')}`;

      // Optimistic Concurrency Control (OCC)
      // Ensures that if another concurrent request already posted this voucher, it will affect 0 rows
      const updateResult = await tx.voucher.updateMany({
        where: { id, hospitalId, status: VoucherStatus.DRAFT },
        data: { status: VoucherStatus.POSTED, code },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          'Voucher was modified by another transaction and is no longer in DRAFT status',
        );
      }

      const updated = await tx.voucher.findUnique({ where: { id } });

      // Record Accounting Entry
      await this.accounting.recordVoucherEntry({
        voucherId: id,
        hospitalId,
        userId,
        prisma: tx,
      });

      return updated;
    });
  }

  async cancel(hospitalId: number, id: number, userId: number) {
    const voucher = await this.findOne(hospitalId, id);
    if (voucher.status !== VoucherStatus.POSTED) {
      throw new BadRequestException('Can only cancel a POSTED voucher');
    }

    // For now we just mark cancelled. Real ERPs generate a JOURNAL_REVERSAL entry.
    // OCC check to prevent concurrent cancellations
    const updateResult = await this.prisma.voucher.updateMany({
      where: { id, hospitalId, status: VoucherStatus.POSTED },
      data: { status: VoucherStatus.CANCELLED },
    });

    if (updateResult.count === 0) {
      throw new BadRequestException(
        'Voucher was modified by another transaction and is no longer in POSTED status',
      );
    }

    return this.prisma.voucher.findUnique({ where: { id } });
  }
}
