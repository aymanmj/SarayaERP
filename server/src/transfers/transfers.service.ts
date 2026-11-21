import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  lockBedEncounter,
  moveBed,
  assertNoPendingBedMovement,
  bedLocation,
} from '../beds/bed-allocation';
import { PrismaService } from '../prisma/prisma.service';
import {
  RequestTransferDto,
  AllocateBedDto,
  HandoverNoteDto,
} from './dto/transfer.dto';
import { Prisma, TransferOrderStatus, BedStatus } from '@prisma/client';

const ACTIVE: TransferOrderStatus[] = [
  TransferOrderStatus.REQUESTED,
  TransferOrderStatus.BED_ALLOCATED,
  TransferOrderStatus.HANDOVER_DRAFTED,
  TransferOrderStatus.HANDOVER_SIGNED,
];

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockEncounter(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    encounterId: number,
    requireOpen = true,
  ) {
    return lockBedEncounter(tx, hospitalId, encounterId, requireOpen);
  }

  private async lockTransfer(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    transferId: number,
    requireOpen = true,
  ) {
    const identity = await tx.transferOrder.findFirst({
      where: { id: transferId, hospitalId },
    });
    if (!identity) throw new NotFoundException('Transfer Order not found');
    const encounter = await this.lockEncounter(
      tx,
      hospitalId,
      identity.encounterId,
      requireOpen,
    );
    await tx.$queryRaw`SELECT "id" FROM "TransferOrder" WHERE "id" = ${transferId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
    const transfer = await tx.transferOrder.findFirst({
      where: { id: transferId, hospitalId },
      include: { handoverNote: true },
    });
    if (!transfer) throw new NotFoundException('Transfer Order not found');
    return { transfer, encounter };
  }

  async requestTransfer(
    hospitalId: number,
    userId: number,
    dto: RequestTransferDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockEncounter(tx, hospitalId, dto.encounterId);
      await assertNoPendingBedMovement(tx, hospitalId, dto.encounterId);
      const assignment = await tx.bedAssignment.findFirst({
        where: { hospitalId, encounterId: dto.encounterId, to: null },
      });
      if (dto.fromBedId !== undefined && dto.fromBedId !== assignment?.bedId) {
        throw new BadRequestException(
          'سرير المصدر لا يطابق الحجز الحالي للحالة',
        );
      }
      if (
        await tx.iCUEquipmentUsage.findFirst({
          where: { encounterId: dto.encounterId, stoppedAt: null },
        })
      ) {
        throw new BadRequestException(
          'يوجد جهاز عناية مركزة متصل بالمريض ولم يتم فصله',
        );
      }
      if (
        await tx.iCUMedicationDrip.findFirst({
          where: { encounterId: dto.encounterId, stoppedAt: null },
        })
      ) {
        throw new BadRequestException(
          'توجد أدوية وريدية مستمرة لم يتم إيقافها',
        );
      }
      const existing = await tx.transferOrder.findFirst({
        where: {
          hospitalId,
          encounterId: dto.encounterId,
          status: { in: ACTIVE },
        },
      });
      if (existing)
        throw new BadRequestException('يوجد طلب نقل نشط مسبقًا لهذه الحالة');
      return tx.transferOrder.create({
        data: {
          hospitalId,
          encounterId: dto.encounterId,
          fromBedId: assignment?.bedId,
          requestedById: userId,
          status: TransferOrderStatus.REQUESTED,
          reason: dto.reason,
          notes: dto.notes,
        },
      });
    });
  }

  async getPendingTransfers(hospitalId: number) {
    return this.prisma.transferOrder.findMany({
      where: { hospitalId, status: { in: ACTIVE } },
      include: {
        encounter: {
          select: {
            id: true,
            type: true,
            status: true,
            patient: { select: { id: true, fullName: true, mrn: true } },
          },
        },
        fromBed: true,
        toBed: true,
        handoverNote: true,
        requestedBy: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async allocateBed(
    hospitalId: number,
    transferId: number,
    userId: number,
    dto: AllocateBedDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { transfer } = await this.lockTransfer(tx, hospitalId, transferId);
      await assertNoPendingBedMovement(tx, hospitalId, transfer.encounterId, {
        transferOrderId: transferId,
      });
      if (
        transfer.status !== TransferOrderStatus.REQUESTED ||
        transfer.toBedId
      ) {
        throw new BadRequestException(
          'لا يمكن حجز الوجهة إلا لطلب جديد لم يخصص له سرير',
        );
      }
      if (transfer.fromBedId === dto.toBedId)
        throw new BadRequestException('سرير المصدر والوجهة متطابقان');
      await bedLocation(tx, hospitalId, dto.toBedId);
      const claimed = await tx.bed.updateMany({
        where: {
          id: dto.toBedId,
          hospitalId,
          isActive: true,
          status: BedStatus.AVAILABLE,
          assignments: { none: { to: null } },
        },
        data: { status: BedStatus.BLOCKED },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('سرير الوجهة لم يعد متاحًا');
      return tx.transferOrder.update({
        where: { id: transferId, hospitalId },
        data: {
          toBedId: dto.toBedId,
          allocatedById: userId,
          allocatedAt: new Date(),
          status: TransferOrderStatus.BED_ALLOCATED,
        },
      });
    });
  }

  async saveHandoverNote(
    hospitalId: number,
    transferId: number,
    userId: number,
    dto: HandoverNoteDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { transfer } = await this.lockTransfer(tx, hospitalId, transferId);
      await assertNoPendingBedMovement(tx, hospitalId, transfer.encounterId, {
        transferOrderId: transferId,
      });
      if (
        (transfer.status !== TransferOrderStatus.BED_ALLOCATED &&
          transfer.status !== TransferOrderStatus.HANDOVER_DRAFTED) ||
        transfer.handoverNote?.signedAt
      ) {
        throw new BadRequestException(
          'تقرير التسليم معتمد أو حالة النقل لا تسمح بتعديله',
        );
      }
      const content = {
        situation: dto.situation,
        background: dto.background,
        assessment: dto.assessment,
        recommendation: dto.recommendation,
      };
      if (
        dto.isSigned === true &&
        Object.values(content).some((value) => !value.trim())
      ) {
        throw new BadRequestException(
          'يجب استكمال جميع حقول تقرير التسليم قبل اعتماده',
        );
      }
      const signature =
        dto.isSigned === true
          ? { signedById: userId, signedAt: new Date() }
          : {};
      const handover = await tx.handoverNote.upsert({
        where: { transferOrderId: transferId },
        create: {
          transferOrderId: transferId,
          ...content,
          draftedById: userId,
          ...signature,
        },
        update: { ...content, ...signature },
      });
      await tx.transferOrder.update({
        where: { id: transferId, hospitalId },
        data: {
          status:
            dto.isSigned === true
              ? TransferOrderStatus.HANDOVER_SIGNED
              : TransferOrderStatus.HANDOVER_DRAFTED,
        },
      });
      return handover;
    });
  }

  async cancelTransfer(hospitalId: number, transferId: number) {
    return this.prisma.$transaction(async (tx) => {
      const { transfer } = await this.lockTransfer(
        tx,
        hospitalId,
        transferId,
        false,
      );
      if (transfer.status === TransferOrderStatus.CANCELLED) return transfer;
      if (!ACTIVE.includes(transfer.status))
        throw new BadRequestException('لا يمكن إلغاء نقل مكتمل');
      if (transfer.toBedId) {
        const overlapping = await tx.transferOrder.count({
          where: {
            hospitalId,
            toBedId: transfer.toBedId,
            id: { not: transferId },
            status: { in: ACTIVE },
          },
        });
        if (overlapping)
          throw new BadRequestException('يوجد تعارض في ملكية حجز الوجهة');
        const released = await tx.bed.updateMany({
          where: {
            id: transfer.toBedId,
            hospitalId,
            status: BedStatus.BLOCKED,
            assignments: { none: { to: null } },
          },
          data: { status: BedStatus.AVAILABLE },
        });
        if (released.count !== 1)
          throw new BadRequestException(
            'تغير حجز الوجهة ولا يمكن تحريره آليًا',
          );
      }
      return tx.transferOrder.update({
        where: { id: transferId, hospitalId },
        data: { status: TransferOrderStatus.CANCELLED },
      });
    });
  }

  async confirmArrival(hospitalId: number, transferId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const { transfer } = await this.lockTransfer(tx, hospitalId, transferId);
      if (
        transfer.status !== TransferOrderStatus.HANDOVER_SIGNED ||
        !transfer.handoverNote?.signedAt ||
        !transfer.handoverNote.signedById
      ) {
        throw new BadRequestException(
          'يجب حجز السرير واعتماد تقرير التسليم قبل تأكيد الوصول',
        );
      }
      if (!transfer.toBedId)
        throw new BadRequestException('لم يخصص سرير للوجهة');
      const overlapping = await tx.transferOrder.count({
        where: {
          hospitalId,
          toBedId: transfer.toBedId,
          id: { not: transferId },
          status: { in: ACTIVE },
        },
      });
      if (overlapping)
        throw new BadRequestException('يوجد تعارض في ملكية حجز الوجهة');
      await moveBed(tx, hospitalId, transfer.encounterId, transfer.toBedId, {
        expectedFromBedId: transfer.fromBedId,
        targetStatus: 'BLOCKED',
        transferOrderId: transferId,
      });
      const now = new Date();
      return tx.transferOrder.update({
        where: { id: transferId, hospitalId },
        data: { status: TransferOrderStatus.TRANSFERRED, transferredAt: now },
      });
    });
  }
}
