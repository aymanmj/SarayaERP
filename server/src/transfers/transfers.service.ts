import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path if needed, assuming global or in src/prisma
import { RequestTransferDto, AllocateBedDto, HandoverNoteDto } from './dto/transfer.dto';
import { TransferOrderStatus, BedStatus } from '@prisma/client';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async requestTransfer(hospitalId: number, userId: number, dto: RequestTransferDto) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: dto.encounterId, hospitalId }
    });
    if (!encounter) throw new NotFoundException('Encounter not found');

    let fromBedId = dto.fromBedId;
    if (!fromBedId) {
      const currentAssignment = await this.prisma.bedAssignment.findFirst({
        where: { hospitalId, encounterId: dto.encounterId, to: null }
      });
      if (currentAssignment) {
        fromBedId = currentAssignment.bedId;
      }
    }

    // Prevent transfer if patient still has active ICU procedures running
    const activeEquipment = await this.prisma.iCUEquipmentUsage.findFirst({
      where: { encounterId: dto.encounterId, stoppedAt: null }
    });
    if (activeEquipment) {
      throw new BadRequestException('لا يمكن إنشاء طلب النقل: يوجد جهاز عناية مركزة متصل بالمريض ولم يتم فصله.');
    }

    const activeDrips = await this.prisma.iCUMedicationDrip.findFirst({
      where: { encounterId: dto.encounterId, stoppedAt: null }
    });
    if (activeDrips) {
      throw new BadRequestException('لا يمكن إنشاء طلب النقل: توجد أدوية وريدية مستمرة (Drips) لم يتم إيقافها.');
    }

    // Prevent duplicate active transfer requests
    const existingActiveTransfer = await this.prisma.transferOrder.findFirst({
      where: {
        hospitalId,
        encounterId: dto.encounterId,
        status: {
          in: [
            TransferOrderStatus.REQUESTED, 
            TransferOrderStatus.BED_ALLOCATED, 
            TransferOrderStatus.HANDOVER_DRAFTED, 
            TransferOrderStatus.HANDOVER_SIGNED
          ]
        }
      }
    });

    if (existingActiveTransfer) {
      throw new BadRequestException('يوجد طلب نقل نشط مسبقاً لهذا المريض');
    }

    const transfer = await this.prisma.transferOrder.create({
      data: {
        hospitalId,
        encounterId: dto.encounterId,
        fromBedId,
        requestedById: userId,
        status: TransferOrderStatus.REQUESTED,
        reason: dto.reason,
        notes: dto.notes,
      }
    });
    return transfer;
  }

  async getPendingTransfers(hospitalId: number) {
    return this.prisma.transferOrder.findMany({
      where: {
        hospitalId,
        status: {
          in: [TransferOrderStatus.REQUESTED, TransferOrderStatus.BED_ALLOCATED, TransferOrderStatus.HANDOVER_DRAFTED, TransferOrderStatus.HANDOVER_SIGNED]
        }
      },
      include: {
        encounter: {
          include: { patient: true }
        },
        fromBed: true,
        toBed: true,
        requestedBy: true,
      },
      orderBy: { requestedAt: 'desc' }
    });
  }

  async allocateBed(hospitalId: number, transferId: number, userId: number, dto: AllocateBedDto) {
    const transfer = await this.prisma.transferOrder.findUnique({ where: { id: transferId, hospitalId } });
    if (!transfer) throw new NotFoundException('Transfer Order not found');

    // Make sure bed is available
    const bed = await this.prisma.bed.findUnique({ where: { id: dto.toBedId, hospitalId } });
    if (!bed || bed.status !== BedStatus.AVAILABLE) {
      throw new BadRequestException('Target bed is not available');
    }

    // Allocate bed and change status
    const result = await this.prisma.$transaction(async (tx) => {
      // Reserve bed
      await tx.bed.update({
        where: { id: dto.toBedId },
        data: { status: BedStatus.BLOCKED } // Temporary blocked until arrival
      });

      return tx.transferOrder.update({
        where: { id: transferId },
        data: {
          toBedId: dto.toBedId,
          allocatedById: userId,
          allocatedAt: new Date(),
          status: TransferOrderStatus.BED_ALLOCATED
        }
      });
    });

    return result;
  }

  async saveHandoverNote(hospitalId: number, transferId: number, userId: number, dto: HandoverNoteDto) {
    const transfer = await this.prisma.transferOrder.findUnique({ where: { id: transferId, hospitalId } });
    if (!transfer) throw new NotFoundException('Transfer Order not found');

    const statusObj = dto.isSigned ? { signedById: userId, signedAt: new Date() } : { draftedById: userId };
    const transferStatusUpdate = dto.isSigned ? TransferOrderStatus.HANDOVER_SIGNED : TransferOrderStatus.HANDOVER_DRAFTED;

    const handover = await this.prisma.handoverNote.upsert({
      where: { transferOrderId: transferId },
      create: {
        transferOrderId: transferId,
        situation: dto.situation,
        background: dto.background,
        assessment: dto.assessment,
        recommendation: dto.recommendation,
        ...statusObj
      },
      update: {
        situation: dto.situation,
        background: dto.background,
        assessment: dto.assessment,
        recommendation: dto.recommendation,
        ...statusObj
      }
    });

    await this.prisma.transferOrder.update({
      where: { id: transferId },
      data: { status: transferStatusUpdate }
    });

    return handover;
  }

  async confirmArrival(hospitalId: number, transferId: number, userId: number) {
    const transfer = await this.prisma.transferOrder.findUnique({ where: { id: transferId, hospitalId } });
    if (!transfer) throw new NotFoundException('Transfer Order not found');

    if (transfer.status !== TransferOrderStatus.HANDOVER_SIGNED && transfer.status !== TransferOrderStatus.BED_ALLOCATED) {
      // In some urgent ER->ICU, handover might be skipped, but typically required
    }

    if (!transfer.toBedId) {
      throw new BadRequestException('Target bed must be allocated first');
    }

    const now = new Date();
    const toBedId = transfer.toBedId; // Capture for TS closure narrowing

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark fromBed as CLEANING
      if (transfer.fromBedId) {
        await tx.bed.update({
          where: { id: transfer.fromBedId },
          data: { status: BedStatus.CLEANING }
        });
      }

      // Close ALL previous active bed assignments to enforce single source of truth
      await tx.bedAssignment.updateMany({
        where: {
          encounterId: transfer.encounterId,
          to: null
        },
        data: { to: now }
      });

      // 2. Mark toBed as OCCUPIED
      await tx.bed.update({
        where: { id: toBedId },
        data: { status: BedStatus.OCCUPIED }
      });

      // 3. Create new bed assignment
      await tx.bedAssignment.create({
        data: {
          hospitalId,
          encounterId: transfer.encounterId,
          bedId: toBedId,
          from: now
        }
      });

      // 4. Update encounter & admission location
      let newRoomId: number | undefined;
      let newWardId: number | undefined;
      let newDepartmentId: number | undefined;
      
      const toBed = await tx.bed.findUnique({ where: { id: toBedId } });
      if (toBed) {
        newRoomId = toBed.roomId;
        newWardId = toBed.wardId;
        const toWard = await tx.ward.findUnique({ where: { id: toBed.wardId } });
        if (toWard && toWard.departmentId) {
           newDepartmentId = toWard.departmentId;
        }
      }

      // Find the admission connected to this encounter to update it
      const admission = await tx.admission.findUnique({ where: { encounterId: transfer.encounterId } });
      if (admission) {
        await tx.admission.update({
          where: { id: admission.id },
          data: {
            bedId: toBedId,
            roomId: newRoomId,
            wardId: newWardId,
            departmentId: newDepartmentId,
            // Dynamic billing: we would ideally hook an event here or run a nightly cron
          }
        });
      }

      // 5. Update transfer strictly to TRANSFERRED
      return tx.transferOrder.update({
        where: { id: transferId },
        data: {
          status: TransferOrderStatus.TRANSFERRED,
          transferredAt: now
        }
      });
    });

    return result;
  }
}
