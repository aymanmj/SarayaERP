import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BedStatus,
  EncounterType,
  AdmissionStatus,
  DischargeDisposition,
} from '@prisma/client';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { UpdateAdmissionDto } from './dto/update-admission.dto';
import { CreateDischargePlanningDto } from './dto/create-discharge-planning.dto';
import { CreateBedTransferDto } from './dto/create-bed-transfer.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class AdmissionService {
  constructor(
    private prisma: PrismaService,
    private systemSettings: SystemSettingsService,
  ) {}

  // ==================== ADMISSION MANAGEMENT ====================

  /**
   * Create a new admission with comprehensive validation
   */
  async createAdmission(hospitalId: number, dto: CreateAdmissionDto, userId: number) {
    // 1. Validate patient exists
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this hospital');
    }

    // 2. Check for active admission
    const activeAdmission = await this.prisma.admission.findFirst({
      where: {
        hospitalId,
        patientId: dto.patientId,
        admissionStatus: {
          in: [AdmissionStatus.ADMITTED, AdmissionStatus.IN_PROGRESS],
        },
      },
    });

    if (activeAdmission) {
      console.warn(`[CREATE_ADMISSION] Active admission found for patient ${dto.patientId}: ID=${activeAdmission.id}, Status=${activeAdmission.admissionStatus}`);
      throw new BadRequestException(
        `المريض يمتلك حالياً دخول نشط! (ID: ${activeAdmission.id}, Status: ${activeAdmission.admissionStatus})`
      );
    }

    // 3. Validate medical team
    const [admittingDoctor, primaryPhysician] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: dto.admittingDoctorId, hospitalId },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.primaryPhysicianId, hospitalId },
      }),
    ]);

    if (!admittingDoctor || !primaryPhysician) {
      throw new NotFoundException('One or more medical staff members not found');
    }

    // 4. Create or validate encounter
    let encounterId = dto.encounterId;
    if (encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: encounterId, hospitalId, patientId: dto.patientId },
      });
      if (!encounter) {
        throw new NotFoundException('Encounter not found');
      }
      
      // Ensure encounter is IPD
      if (encounter.type !== EncounterType.IPD) {
          await this.prisma.encounter.update({
              where: { id: encounterId },
              data: { 
                  type: EncounterType.IPD,
                  // Ensure department is set if provided in DTO update
                  ...(dto.departmentId ? { departmentId: dto.departmentId } : {})
              }
          });
      }
    } else {
      // Create new encounter
      // ✅ [ROBUST] Department ID is now mandatory in DTO, no fallback needed
      const encounter = await this.prisma.encounter.create({
        data: {
          hospitalId,
          patientId: dto.patientId,
          type: EncounterType.IPD,
          departmentId: dto.departmentId,
          doctorId: dto.admittingDoctorId,
          chiefComplaint: dto.admissionReason,
          status: 'OPEN',
        },
      });
      encounterId = encounter.id;
    }

    // 5. Check for readmission within 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAdmission = await this.prisma.admission.findFirst({
      where: {
        hospitalId,
        patientId: dto.patientId,
        actualAdmissionDate: {
          gte: thirtyDaysAgo,
        },
        admissionStatus: 'DISCHARGED',
      },
      orderBy: { actualAdmissionDate: 'desc' },
    });

    const isReadmission = !!recentAdmission;
    const previousAdmissionId = recentAdmission?.id;

    // 6. Validate bed availability if bed is assigned
    if (dto.bedId) {
      const bed = await this.prisma.bed.findFirst({
        where: { id: dto.bedId, hospitalId, status: BedStatus.AVAILABLE },
      });
      if (!bed) {
        throw new BadRequestException('Selected bed is not available');
      }
    }

    // 7. Create admission record
    const admission = await this.prisma.admission.create({
      data: {
        hospitalId,
        patientId: dto.patientId,
        encounterId: encounterId!,
        admissionType: dto.admissionType,
        admissionStatus: AdmissionStatus.ADMITTED,
        priority: dto.priority,
        scheduledAdmissionDate: dto.scheduledAdmissionDate,
        actualAdmissionDate: new Date(),
        expectedDischargeDate: dto.expectedDischargeDate,
        bedId: dto.bedId,
        roomId: dto.roomId,
        wardId: dto.wardId,
        departmentId: dto.departmentId,
        admittingDoctorId: dto.admittingDoctorId,
        primaryPhysicianId: dto.primaryPhysicianId,
        referringDoctorId: dto.referringDoctorId,
        attendingNurseId: dto.attendingNurseId,
        insuranceProviderId: dto.insuranceProviderId,
        insurancePolicyId: dto.insurancePolicyId,
        preAuthNumber: dto.preAuthNumber,
        admissionReason: dto.admissionReason,
        primaryDiagnosis: dto.primaryDiagnosis,
        secondaryDiagnoses: dto.secondaryDiagnoses,
        procedures: dto.procedures,
        medications: dto.medications,
        allergies: dto.allergies,
        specialInstructions: dto.specialInstructions,
        fallRisk: dto.fallRisk,
        pressureUlcerRisk: dto.pressureUlcerRisk,
        nutritionRisk: dto.nutritionRisk,
        infectionRisk: dto.infectionRisk,
        isolationRequired: dto.isolationRequired,
        isolationType: dto.isolationType,
        isolationStartDate: dto.isolationRequired ? new Date() : null,
        isEmergency: dto.admissionType === 'EMERGENCY',
        emergencyContact: dto.emergencyContact,
        emergencyNotes: dto.emergencyNotes,
        isReadmission,
        previousAdmissionId,
        readmissionReason: isReadmission ? dto.readmissionReason : null,
        readmissionWithin30Days: isReadmission,
        estimatedCost: dto.estimatedCost,
        createdBy: userId,
      },
      include: {
        patient: true,
        encounter: true,
        bed: true,
        room: true,
        ward: true,
        department: true,
        admittingDoctor: {
          select: { id: true, fullName: true },
        },
        primaryPhysician: {
          select: { id: true, fullName: true },
        },
      },
    });

    // 8. Update bed status if bed is assigned
    if (dto.bedId) {
      await this.prisma.bed.update({
        where: { id: dto.bedId },
        data: { status: BedStatus.OCCUPIED },
      });

      // Create bed assignment
      await this.prisma.bedAssignment.create({
        data: {
          hospitalId,
          encounterId: encounterId!,
          bedId: dto.bedId,
        },
      });
    }

    // 9. Create initial admission note
    await this.prisma.admissionNote.create({
      data: {
        admissionId: admission.id,
        hospitalId,
        type: 'ADMISSION',
        content: `Patient admitted for: ${dto.admissionReason}`,
        isCritical: dto.admissionType === 'EMERGENCY',
        createdBy: userId,
      },
    });

    return admission;
  }

  /**
   * Get admission by ID with full details
   */
  async getAdmissionById(hospitalId: number, admissionId: number) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, hospitalId },
      include: {
        patient: true,
        encounter: {
          include: {
            doctor: {
              select: { id: true, fullName: true },
            },
          },
        },
        bed: true,
        room: true,
        ward: true,
        department: true,
        admittingDoctor: {
          select: { id: true, fullName: true },
        },
        primaryPhysician: {
          select: { id: true, fullName: true },
        },
        referringDoctor: {
          select: { id: true, fullName: true },
        },
        attendingNurse: {
          select: { id: true, fullName: true },
        },
        dischargePlanning: true,
        admissionNotes: {
          include: {
            creator: {
              select: { id: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        bedTransfers: {
          include: {
            fromBed: true,
            toBed: true,
            requestedUser: {
              select: { id: true, fullName: true },
            },
            approvedUser: {
              select: { id: true, fullName: true },
            },
            completedUser: {
              select: { id: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    return admission;
  }

  /**
   * List admissions with filtering and pagination
   */
  async listAdmissions(
    hospitalId: number,
    options: {
      page?: number;
      limit?: number;
      status?: AdmissionStatus;
      wardId?: number;
      departmentId?: number;
      doctorId?: number;
    } = {},
  ) {
    const {
      page = 1,
      limit = 20,
      status,
      wardId,
      departmentId,
      doctorId,
    } = options;

    const where: any = {
      hospitalId,
      ...(status && { admissionStatus: status }),
      ...(wardId && { wardId }),
      ...(departmentId && { departmentId }),
      ...(doctorId && { admittingDoctorId: doctorId }),
    };

    const [admissions, total] = await Promise.all([
      this.prisma.admission.findMany({
        where,
        include: {
          patient: {
            select: { id: true, fullName: true, mrn: true },
          },
          bed: {
            select: { id: true, bedNumber: true },
          },
          ward: {
            select: { id: true, name: true },
          },
          admittingDoctor: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { actualAdmissionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.admission.count({ where }),
    ]);

    return {
      admissions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update admission information
   */
  async updateAdmission(
    hospitalId: number,
    admissionId: number,
    dto: UpdateAdmissionDto,
    userId: number,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, hospitalId },
    });

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    // Validate bed change if bed is being updated
    if (dto.bedId && dto.bedId !== admission.bedId) {
      const newBed = await this.prisma.bed.findFirst({
        where: { id: dto.bedId, hospitalId, status: BedStatus.AVAILABLE },
      });

      if (!newBed) {
        throw new BadRequestException('New bed is not available');
      }

      // Release old bed
      if (admission.bedId) {
        await this.prisma.bed.update({
          where: { id: admission.bedId },
          data: { status: BedStatus.CLEANING },
        });

        await this.prisma.bedAssignment.updateMany({
          where: {
            encounterId: admission.encounterId,
            to: null,
          },
          data: { to: new Date() },
        });
      }

      // Assign new bed
      await this.prisma.bed.update({
        where: { id: dto.bedId },
        data: { status: BedStatus.OCCUPIED },
      });

      await this.prisma.bedAssignment.create({
        data: {
          hospitalId,
          encounterId: admission.encounterId,
          bedId: dto.bedId,
        },
      });
    }

    const updatedAdmission = await this.prisma.admission.update({
      where: { id: admissionId },
      data: {
        ...dto,
        updatedAt: new Date(),
      },
      include: {
        patient: true,
        bed: true,
        ward: true,
        admittingDoctor: {
          select: { id: true, fullName: true },
        },
      },
    });

    return updatedAdmission;
  }

  /**
   * Discharge patient with comprehensive discharge planning
   */
  async dischargePatient(
    hospitalId: number,
    admissionId: number,
    dischargeData: {
      dischargeDisposition: DischargeDisposition;
      dischargeInstructions?: any;
      followUpRequired?: boolean;
      followUpInstructions?: any;
      actualCost?: number;
      notes?: string;
    },
    userId: number,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, hospitalId },
      include: { 
        bed: { include: { ward: true } }, 
        encounter: { include: { invoices: true } },
        dischargePlanning: true
      },
    });

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    if (admission.admissionStatus === 'DISCHARGED') {
      throw new BadRequestException('Patient is already discharged');
    }

    // 1. Medical Clearance
    if (!admission.dischargePlanning) {
      throw new BadRequestException('لا يمكن إجراء الخروج: خطة الخروج الطبية غير موجودة. يرجى التنسيق مع الطبيب لإنشاء الخطة أولاً.');
    }

    // Calculate length of stay
    const lengthOfStay = Math.floor(
      (new Date().getTime() - admission.actualAdmissionDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const daysToCharge = Math.max(1, lengthOfStay);

    // 2. Room Service Generation
    if (admission.bed?.ward?.serviceItemId) {
      const wardServiceId = admission.bed.ward.serviceItemId;
      const existingCharges = await this.prisma.encounterCharge.findMany({
        where: { encounterId: admission.encounterId, serviceItemId: wardServiceId }
      });
      const billedDays = existingCharges.reduce((sum, c) => sum + Number(c.quantity), 0);
      const remainingDays = daysToCharge - billedDays;
      
      if (remainingDays > 0) {
        const wardService = await this.prisma.serviceItem.findUnique({
          where: { id: wardServiceId }
        });
        if (wardService) {
          await this.prisma.encounterCharge.create({
            data: {
              hospitalId,
              encounterId: admission.encounterId,
              serviceItemId: wardServiceId,
              sourceType: 'BED',
              quantity: remainingDays,
              unitPrice: wardService.defaultPrice,
              totalAmount: Number(wardService.defaultPrice) * remainingDays,
              createdAt: new Date(),
            }
          });
        }
      }
    }

    // 3. Financial Clearance
    const debtLimit = await this.systemSettings.getNumber(hospitalId, 'billing.debtLimit', 0.01);
    
    let totalPatientDebt = 0;
    for (const inv of admission.encounter.invoices) {
      if (inv.status === 'CANCELLED') continue;
      const patientShare = Number(inv.patientShare);
      const paid = Number(inv.paidAmount);
      const remaining = patientShare - paid;
      if (remaining > debtLimit) totalPatientDebt += remaining;
    }

    if (totalPatientDebt > debtLimit) {
      throw new BadRequestException(
        `لا يمكن إجراء الخروج. يوجد مستحقات مالية على المريض بقيمة ${totalPatientDebt.toFixed(3)} د.ل. الحد المسموح به هو ${debtLimit} د.ل. يرجى تسوية الفواتير أولاً.`
      );
    }

    const uninvoicedCharges = await this.prisma.encounterCharge.count({
      where: { encounterId: admission.encounterId, invoiceId: null },
    });

    if (uninvoicedCharges > 0) {
      throw new BadRequestException(
        `لا يمكن الخروج وجود مستحقات ومطالبات غير مسددة (${uninvoicedCharges} بند). يرجى مراجعة الاستقبال أو الحسابات لإصدار التسوية المالية أولاً.`
      );
    }

    // Update admission
    const updatedAdmission = await this.prisma.admission.update({
      where: { id: admissionId },
      data: {
        admissionStatus: AdmissionStatus.DISCHARGED,
        dischargeDate: new Date(),
        dischargeDisposition: dischargeData?.dischargeDisposition || admission.dischargePlanning?.dischargeDisposition || 'HOME',
        dischargeInstructions: dischargeData?.dischargeInstructions || admission.dischargePlanning?.followUpInstructions,
        followUpRequired: dischargeData?.followUpRequired ?? admission.followUpRequired ?? false,
        followUpInstructions: dischargeData?.followUpInstructions ?? admission.dischargePlanning?.followUpInstructions,
        actualCost: dischargeData.actualCost,
        lengthOfStay,
      },
    });

    // Release bed
    if (admission.bedId) {
      await this.prisma.bed.update({
        where: { id: admission.bedId },
        data: { status: BedStatus.CLEANING },
      });

      await this.prisma.bedAssignment.updateMany({
        where: {
          encounterId: admission.encounterId,
          to: null,
        },
        data: { to: new Date() },
      });
    }

    // Close encounter
    await this.prisma.encounter.update({
      where: { id: admission.encounterId },
      data: { status: 'CLOSED', dischargeDate: new Date() },
    });

    // Create discharge note
    await this.prisma.admissionNote.create({
      data: {
        admissionId,
        hospitalId,
        type: 'DISCHARGE',
        content: `Patient discharged to ${dischargeData.dischargeDisposition}. ${dischargeData.notes || ''}`,
        isCritical: false,
        createdBy: userId,
      },
    });

    return updatedAdmission;
  }

  // ==================== DISCHARGE PLANNING ====================

  /**
   * Create discharge planning
   */
  async createDischargePlanning(
    hospitalId: number,
    admissionId: number,
    dto: CreateDischargePlanningDto,
    userId: number,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, hospitalId },
    });

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    const dischargePlanning = await this.prisma.dischargePlanning.upsert({
      where: { admissionId },
      update: {
        plannedDischargeDate: dto.plannedDischargeDate,
        medicalStability: dto.medicalStability,
        vitalsStable: dto.vitalsStable,
        painControlled: dto.painControlled,
        medicationsReady: dto.medicationsReady,
        educationCompleted: dto.educationCompleted,
        dischargeDisposition: dto.dischargeDisposition,
        destinationFacility: dto.destinationFacility,
        homeHealthRequired: dto.homeHealthRequired || dto.homeHealthServices,
        equipmentNeeded: dto.equipmentNeeded,
        homeModifications: dto.homeModifications,
        followUpAppointment: dto.followUpAppointment,
        followUpDoctorId: dto.followUpDoctorId,
        followUpInstructions: dto.followUpInstructions,
        caseManagerId: dto.caseManagerId,
        socialWorkerId: dto.socialWorkerId,
        familyNotified: dto.familyNotified,
        familyInstructions: dto.familyInstructions,
        insuranceApproval: dto.insuranceApproval,
        estimatedCost: dto.estimatedCost,
        paymentArrangements: dto.paymentArrangements,
        status: dto.status,
        barriers: dto.barriers,
        notes: dto.notes,
        updatedAt: new Date(),
      },
      create: {
        admissionId,
        hospitalId,
        plannedDischargeDate: dto.plannedDischargeDate,
        medicalStability: dto.medicalStability,
        vitalsStable: dto.vitalsStable,
        painControlled: dto.painControlled,
        medicationsReady: dto.medicationsReady,
        educationCompleted: dto.educationCompleted,
        dischargeDisposition: dto.dischargeDisposition,
        destinationFacility: dto.destinationFacility,
        homeHealthRequired: dto.homeHealthRequired || dto.homeHealthServices,
        equipmentNeeded: dto.equipmentNeeded,
        homeModifications: dto.homeModifications,
        followUpAppointment: dto.followUpAppointment,
        followUpDoctorId: dto.followUpDoctorId,
        followUpInstructions: dto.followUpInstructions,
        caseManagerId: dto.caseManagerId,
        socialWorkerId: dto.socialWorkerId,
        familyNotified: dto.familyNotified,
        familyInstructions: dto.familyInstructions,
        insuranceApproval: dto.insuranceApproval,
        estimatedCost: dto.estimatedCost,
        paymentArrangements: dto.paymentArrangements,
        status: dto.status,
        barriers: dto.barriers,
        notes: dto.notes,
        createdBy: userId,
      },
    });

    // If followUpRequired provided, update admission directly as it's an admission-level flag
    if (dto.followUpRequired !== undefined) {
      await this.prisma.admission.update({
        where: { id: admissionId },
        data: { followUpRequired: dto.followUpRequired },
      });
    }


    return dischargePlanning;
  }

  // ==================== BED TRANSFER ====================

  /**
   * Request bed transfer
   */
  async requestBedTransfer(
    hospitalId: number,
    admissionId: number,
    dto: CreateBedTransferDto,
    userId: number,
  ) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, hospitalId },
      include: { bed: true, room: true, ward: true },
    });

    if (!admission) {
      throw new NotFoundException('Admission not found');
    }

    if (!admission.bedId) {
      throw new BadRequestException('Patient is not currently assigned to a bed');
    }

    // Validate destination bed
    const toBed = await this.prisma.bed.findFirst({
      where: { id: dto.toBedId, hospitalId, status: BedStatus.AVAILABLE },
      include: { room: true, ward: true },
    });

    if (!toBed) {
      throw new BadRequestException('Destination bed is not available');
    }

    const transfer = await this.prisma.bedTransfer.create({
      data: {
        admissionId,
        hospitalId,
        fromBedId: admission.bedId,
        fromRoomId: admission.roomId!,
        fromWardId: admission.wardId!,
        toBedId: dto.toBedId,
        toRoomId: toBed.roomId,
        toWardId: toBed.room.wardId,
        transferReason: dto.transferReason,
        transferType: dto.transferType,
        priority: dto.priority,
        requestedBy: userId,
      },
      include: {
        fromBed: true,
        toBed: true,
      },
    });

    return transfer;
  }

  /**
   * Complete bed transfer
   */
  async completeBedTransfer(
    hospitalId: number,
    transferId: number,
    userId: number,
  ) {
    const transfer = await this.prisma.bedTransfer.findFirst({
      where: { id: transferId, hospitalId },
      include: { admission: true },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    if (transfer.status !== 'APPROVED') {
      throw new BadRequestException('Transfer must be approved before completion');
    }

    // Release old bed
    await this.prisma.bed.update({
      where: { id: transfer.fromBedId },
      data: { status: BedStatus.CLEANING },
    });

    // Assign new bed
    await this.prisma.bed.update({
      where: { id: transfer.toBedId },
      data: { status: BedStatus.OCCUPIED },
    });

    // Update bed assignments
    await this.prisma.bedAssignment.updateMany({
      where: {
        encounterId: transfer.admission.encounterId,
        to: null,
      },
      data: { to: new Date() },
    });

    await this.prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId: transfer.admission.encounterId,
        bedId: transfer.toBedId,
      },
    });

    // Update admission
    await this.prisma.admission.update({
      where: { id: transfer.admissionId },
      data: {
        bedId: transfer.toBedId,
        roomId: transfer.toRoomId,
        wardId: transfer.toWardId,
      },
    });

    // Update transfer
    const completedTransfer = await this.prisma.bedTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: userId,
      },
    });

    return completedTransfer;
  }

  // ==================== STATISTICS AND REPORTS ====================

  /**
   * Get admission statistics
   */
  async getAdmissionStatistics(hospitalId: number, period?: string) {
    let dateFilter: any = {};
    if (period) {
      const now = new Date();
      switch (period) {
        case 'today':
          dateFilter = {
            gte: new Date(now.setHours(0, 0, 0, 0)),
          };
          break;
        case 'week':
          dateFilter = {
            gte: new Date(now.setDate(now.getDate() - 7)),
          };
          break;
        case 'month':
          dateFilter = {
            gte: new Date(now.setMonth(now.getMonth() - 1)),
          };
          break;
      }
    }

    const [
      totalAdmissions,
      activeAdmissions,
      emergencyAdmissions,
      readmissions,
      averageLengthOfStay,
    ] = await Promise.all([
      this.prisma.admission.count({
        where: {
          hospitalId,
          ...(Object.keys(dateFilter).length > 0 && {
            actualAdmissionDate: dateFilter,
          }),
        },
      }),
      this.prisma.admission.count({
        where: {
          hospitalId,
          admissionStatus: {
            in: [AdmissionStatus.ADMITTED, AdmissionStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.admission.count({
        where: {
          hospitalId,
          admissionType: 'EMERGENCY',
          ...(Object.keys(dateFilter).length > 0 && {
            actualAdmissionDate: dateFilter,
          }),
        },
      }),
      this.prisma.admission.count({
        where: {
          hospitalId,
          isReadmission: true,
          ...(Object.keys(dateFilter).length > 0 && {
            actualAdmissionDate: dateFilter,
          }),
        },
      }),
      this.prisma.admission.aggregate({
        where: {
          hospitalId,
          admissionStatus: AdmissionStatus.DISCHARGED,
          lengthOfStay: { not: null },
          ...(Object.keys(dateFilter).length > 0 && {
            actualAdmissionDate: dateFilter,
          }),
        },
        _avg: { lengthOfStay: true },
      }),
    ]);

    return {
      totalAdmissions,
      activeAdmissions,
      emergencyAdmissions,
      readmissions,
      averageLengthOfStay: averageLengthOfStay._avg.lengthOfStay || 0,
    };
  }

  /**
   * Get bed occupancy report
   */
  async getBedOccupancyReport(hospitalId: number) {
    // TODO: Implement proper bed occupancy report
    return [];
  }
}
