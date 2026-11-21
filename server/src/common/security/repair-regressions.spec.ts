import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PatientPortalService } from '../../patient-portal/patient-portal.service';
import { PharmacyService } from '../../pharmacy/pharmacy.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountingService } from '../../accounting/accounting.service';
import type { CDSSService } from '../../cdss/cdss.service';
import { PortalTelegramController } from '../../patient-portal/controllers/portal-telegram.controller';
import { ClinicalNotesService } from '../../clinical-notes/clinical-notes.service';
import { VitalsService } from '../../vitals/vitals.service';

describe('critical repair regressions without live services', () => {
  it('cannot create a payment or mark an invoice paid from a patient request', async () => {
    const transaction = jest.fn();
    const service = Object.create(
      PatientPortalService.prototype,
    ) as PatientPortalService;
    Object.defineProperty(service, 'prisma', {
      value: { $transaction: transaction },
    });
    await expect(service.processPayment(1, 1, 100, 'CASH')).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('excludes expired batches before allocating stock', async () => {
    const findMany = jest
      .fn<
        Promise<Prisma.ProductStockGetPayload<object>[]>,
        [Prisma.ProductStockFindManyArgs]
      >()
      .mockResolvedValue([]);
    const tx = {
      productStock: { findMany },
      hospital: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ organization: null }),
      },
      inventoryBatchRestriction: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ batchNumber: 'PENDING-REVIEW' }]),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new PharmacyService(
      {} as PrismaService,
      new EventEmitter2(),
      {} as AccountingService,
      {} as CDSSService,
    );
    await expect(
      service['allocateStockFEFO'](tx, 1, 1, 1, 1, 'test'),
    ).rejects.toThrow(BadRequestException);
    const clauses = findMany.mock.calls[0][0].where?.AND;
    if (!Array.isArray(clauses))
      throw new Error('Missing batch safety filters');
    const filters = clauses[0].OR;
    expect(filters?.[0]).toEqual({ expiryDate: null });
    expect(
      (filters?.[1]?.expiryDate as Prisma.DateTimeNullableFilter).gt,
    ).toBeInstanceOf(Date);
    expect(filters?.[2].expiryDate).toBeInstanceOf(Date);
    expect(clauses[1].OR).toContainEqual({
      batchNumber: { notIn: ['PENDING-REVIEW'] },
    });
  });

  it('rejects a forged Telegram update before it can access the database', async () => {
    const original = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET =
      'test_webhook_secret_with_32_characters';
    try {
      const service = Object.create(
        PortalTelegramController.prototype,
      ) as PortalTelegramController;
      await expect(
        service.handleWebhook(
          { message: { contact: { phone_number: '0912345678' } } },
          'wrong',
        ),
      ).rejects.toThrow(UnauthorizedException);
    } finally {
      if (original === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
      else process.env.TELEGRAM_WEBHOOK_SECRET = original;
    }
  });

  it('signatures constrain the hospital and cannot overwrite an existing signature', async () => {
    const update = jest
      .fn<Promise<{ id: number }>, [Prisma.ClinicalNoteUpdateArgs]>()
      .mockResolvedValue({ id: 1 });
    const prisma = { clinicalNote: { update } } as unknown as PrismaService;
    const service = new ClinicalNotesService(prisma, new EventEmitter2());
    await service.signNote(1, 2, 7);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1,
          encounter: { hospitalId: 7 },
          signedAt: null,
        },
      }),
    );
  });

  it('does not write a vital sign when the owning encounter is unavailable in the hospital', async () => {
    const create = jest.fn();
    const tx = {
      encounter: { findFirst: jest.fn(() => Promise.resolve(null)) },
      vitalSign: { create },
    };
    const prisma = {
      $transaction: (work: (transaction: typeof tx) => unknown) => work(tx),
    } as unknown as PrismaService;
    const service = new VitalsService(prisma, new EventEmitter2());
    await expect(
      service.create({ encounterId: 9, hospitalId: 1, userId: 2, pulse: 80 }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
