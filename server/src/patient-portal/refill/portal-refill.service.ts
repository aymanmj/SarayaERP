/**
 * Patient Portal — Medication Refill Service
 * 
 * Enables patients to request prescription refills through the portal.
 * Enforces eligibility checks (active prescription, not cancelled).
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PortalRefillService {
  private readonly logger = new Logger(PortalRefillService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Request a medication refill for an active prescription.
   * 
   * Business Rules:
   * - Only ACTIVE prescriptions can be refilled
   * - Only one PENDING refill per prescription at a time
   * - Patient must own the prescription
   */
  async requestRefill(
    patientId: number,
    hospitalId: number,
    dto: { prescriptionId: number; notes?: string },
  ) {
    // Verify prescription exists, belongs to patient, and is ACTIVE
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: dto.prescriptionId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, genericName: true } },
          },
        },
        doctor: { select: { id: true, fullName: true } },
      },
    });

    if (!prescription || prescription.patientId !== patientId) {
      throw new NotFoundException('الوصفة غير موجودة');
    }

    if (prescription.status !== 'ACTIVE') {
      throw new BadRequestException('لا يمكن طلب تجديد لوصفة غير نشطة');
    }

    // Check for existing PENDING refill on same prescription
    const existingPending = await this.prisma.medicationRefillRequest.findFirst({
      where: {
        prescriptionId: dto.prescriptionId,
        patientId,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      throw new BadRequestException('يوجد طلب تجديد معلق لهذه الوصفة بالفعل');
    }

    const refill = await this.prisma.medicationRefillRequest.create({
      data: {
        patientId,
        prescriptionId: dto.prescriptionId,
        hospitalId,
        notes: dto.notes,
      },
      include: {
        prescription: {
          include: {
            items: {
              include: {
                product: { select: { name: true, genericName: true } },
              },
            },
            doctor: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    this.logger.log(
      `💊 Refill requested: Patient/${patientId} → Prescription/${dto.prescriptionId}`,
    );

    return refill;
  }

  /**
   * Get all refill requests for a patient (paginated).
   */
  async getRefillRequests(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { patientId };

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.medicationRefillRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          prescription: {
            include: {
              items: {
                include: {
                  product: { select: { name: true, genericName: true, strength: true } },
                },
              },
              doctor: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.medicationRefillRequest.count({ where }),
    ]);

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  /**
   * Get a specific refill request by ID.
   */
  async getRefillById(patientId: number, refillId: number) {
    const refill = await this.prisma.medicationRefillRequest.findUnique({
      where: { id: refillId },
      include: {
        prescription: {
          include: {
            items: {
              include: {
                product: { select: { name: true, genericName: true, strength: true, form: true } },
              },
            },
            doctor: { select: { id: true, fullName: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!refill || refill.patientId !== patientId) {
      throw new NotFoundException('طلب التجديد غير موجود');
    }

    return refill;
  }

  /**
   * Cancel a pending refill request.
   * Only PENDING requests can be cancelled by the patient.
   */
  async cancelRefill(patientId: number, refillId: number) {
    const refill = await this.prisma.medicationRefillRequest.findUnique({
      where: { id: refillId },
    });

    if (!refill || refill.patientId !== patientId) {
      throw new NotFoundException('طلب التجديد غير موجود');
    }

    if (refill.status !== 'PENDING') {
      throw new BadRequestException('لا يمكن إلغاء طلب تمت معالجته');
    }

    await this.prisma.medicationRefillRequest.delete({
      where: { id: refillId },
    });

    this.logger.log(`💊 Refill cancelled: Patient/${patientId} → Refill/${refillId}`);

    return { message: 'تم إلغاء طلب التجديد بنجاح' };
  }
}
