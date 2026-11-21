import { PatientDepositService } from '../billing/patient-deposit.service';
import {
  effectivePatientShare,
  netPaidAmount,
} from '../billing/invoice-snapshot';
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
  Prisma,
} from '@prisma/client';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { UpdateAdmissionDto } from './dto/update-admission.dto';
import { CreateDischargePlanningDto } from './dto/create-discharge-planning.dto';
import { CreateBedTransferDto } from './dto/create-bed-transfer.dto';
import { Money } from '../common/utils/money.util';
import { pendingRoomCharges } from './room-charge';
import { roomBillingConfiguration } from './room-billing-policy';
import {
  ACTIVE_ADMISSIONS,
  ACTIVE_BED_TRANSFERS,
  assertNoPendingBedMovement,
  bedLocation,
  lockActiveAdmission,
  lockBedEncounter,
  moveBed,
} from '../beds/bed-allocation';
import { validateAdmissionReferences } from './admission-references';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class AdmissionService {
  constructor(
    private prisma: PrismaService,
    private systemSettings: SystemSettingsService,
    private accounting: AccountingService,
    private patientDeposit: PatientDepositService,
  ) {}

  // ==================== ADMISSION MANAGEMENT ====================

  /**
   * Create a new admission with comprehensive validation
   */
  async createAdmission(
    hospitalId: number,
    dto: CreateAdmissionDto,
    userId: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        if (
          !Number.isInteger(dto.patientId) ||
          dto.patientId <= 0 ||
          (dto.encounterId !== undefined &&
            (!Number.isInteger(dto.encounterId) || dto.encounterId <= 0))
        )
          throw new BadRequestException('مرجع المريض أو الحالة غير صالح');
        // 1. Validate patient exists
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, hospitalId, isDeleted: false },
        });
        if (!patient || patient.hospitalId !== hospitalId) {
          throw new NotFoundException('Patient not found in this hospital');
        }

        await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${dto.patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        // 2. Check for active admission
        const activeAdmission = await tx.admission.findFirst({
          where: {
            hospitalId,
            patientId: dto.patientId,
            admissionStatus: {
              in: [...ACTIVE_ADMISSIONS],
            },
          },
        });

        if (activeAdmission) {
          console.warn(
            `[CREATE_ADMISSION] Active admission found for patient ${dto.patientId}: ID=${activeAdmission.id}, Status=${activeAdmission.admissionStatus}`,
          );
          throw new BadRequestException(
            `المريض يمتلك حالياً دخول نشط! (ID: ${activeAdmission.id}, Status: ${activeAdmission.admissionStatus})`,
          );
        }

        const location = await validateAdmissionReferences(tx, hospitalId, dto);

        // 4. Create or validate encounter
        let encounterId = dto.encounterId;
        if (encounterId) {
          const identity = await tx.encounter.findFirst({
            where: {
              id: encounterId,
              patientId: dto.patientId,
              hospitalId,
              isDeleted: false,
            },
          });
          if (!identity) throw new NotFoundException('Encounter not found');
          const encounter = await lockBedEncounter(tx, hospitalId, encounterId);
          if (encounter.patientId !== dto.patientId) {
            throw new NotFoundException('Encounter not found');
          }

          // Ensure encounter is IPD
          if (encounter.type !== EncounterType.IPD) {
            await tx.encounter.update({
              where: { id: encounterId },
              data: {
                type: EncounterType.IPD,
                // Ensure department is set if provided in DTO update
                ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
              },
            });
          }
        } else {
          // Create new encounter
          // ✅ [ROBUST] Department ID is now mandatory in DTO, no fallback needed
          const encounter = await tx.encounter.create({
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

        const recentAdmission = await tx.admission.findFirst({
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
          const bed = await tx.bed.findFirst({
            where: { id: dto.bedId, hospitalId, status: BedStatus.AVAILABLE },
          });
          if (!bed) {
            throw new BadRequestException('Selected bed is not available');
          }
        }

        // 7. Create admission record
        const roomBilling = await roomBillingConfiguration(tx, hospitalId);
        const admission = await tx.admission.create({
          data: {
            ...roomBilling,
            hospitalId,
            patientId: dto.patientId,
            encounterId: encounterId,
            admissionType: dto.admissionType,
            admissionStatus: AdmissionStatus.ADMITTED,
            priority: dto.priority,
            scheduledAdmissionDate: dto.scheduledAdmissionDate,
            actualAdmissionDate: new Date(),
            expectedDischargeDate: dto.expectedDischargeDate,
            bedId: dto.bedId,
            roomId: location.roomId,
            wardId: location.wardId,
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

        if (dto.bedId) await moveBed(tx, hospitalId, encounterId, dto.bedId);

        // 9. Create initial admission note
        await tx.admissionNote.create({
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
      },
      { maxWait: 10000, timeout: 20000 },
    );
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
    return this.prisma.$transaction(async (tx) => {
      const { admission } = await lockActiveAdmission(
        tx,
        hospitalId,
        admissionId,
      );
      const { patientId, encounterId, bedId, roomId, wardId, ...changes } = dto;
      if (
        (patientId !== undefined && patientId !== admission.patientId) ||
        (encounterId !== undefined && encounterId !== admission.encounterId)
      ) {
        throw new BadRequestException(
          'لا يمكن تغيير المريض أو الحالة المرتبطة بالدخول',
        );
      }
      const current = await tx.bedAssignment.findFirst({
        where: { hospitalId, encounterId: admission.encounterId, to: null },
      });
      const selectedBedId = bedId ?? current?.bedId;
      if (bedId === null)
        throw new BadRequestException(
          'استخدم إجراء إخلاء السرير بدل إزالة الحجز من بيانات الدخول',
        );
      const location = await validateAdmissionReferences(tx, hospitalId, {
        ...changes,
        bedId: selectedBedId,
        roomId,
        wardId,
      });
      if (selectedBedId && selectedBedId !== current?.bedId)
        await moveBed(tx, hospitalId, admission.encounterId, selectedBedId);
      const updated = await tx.admission.update({
        where: { id: admissionId, hospitalId },
        data: {
          ...changes,
          bedId: selectedBedId ?? null,
          roomId: location.roomId,
          wardId: location.wardId,
          updatedAt: new Date(),
        },
        include: {
          patient: true,
          bed: true,
          ward: true,
          admittingDoctor: { select: { id: true, fullName: true } },
        },
      });
      await tx.admissionNote.create({
        data: {
          hospitalId,
          admissionId,
          type: 'ADMINISTRATIVE',
          content:
            'تم تحديث بيانات الدخول' +
            (selectedBedId !== current?.bedId ? ' وتغيير موقع السرير' : ''),
          createdBy: userId,
          isCritical: false,
        },
      });
      return updated;
    });
  }

  async checkDischargeReadiness(hospitalId: number, admissionId: number) {
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.admission.findFirst({
        where: { id: admissionId, hospitalId },
        include: {
          dischargePlanning: true,
          dischargeSummary: true,
          encounter: {
            include: {
              invoices: {
                include: {
                  refunds: {
                    where: { status: 'EXECUTED' },
                    select: { amount: true },
                  },
                  adjustments: {
                    where: { status: 'POSTED' },
                    select: { delta: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      const debtLimit = await this.systemSettings.getNumber(
        hospitalId,
        'billing.debtLimit',
        0.01,
      );
      if (!Number.isFinite(debtLimit) || debtLimit < 0)
        throw new BadRequestException('حد المديونية المهيأ غير صالح');
      const debts = admission.encounter.invoices
        .filter(
          (invoice) =>
            invoice.status !== 'CANCELLED' && invoice.type !== 'CREDIT_NOTE',
        )
        .map((invoice) => {
          const balance = Money.subtractDecimal(
            effectivePatientShare(invoice),
            netPaidAmount(invoice),
          );
          return balance.isPositive() ? balance : Money.decimal(0);
        });
      const debt = Money.sumDecimal(...debts);
      const unbilled = await tx.encounterCharge.count({
        where: {
          hospitalId,
          encounterId: admission.encounterId,
          sourceType: { not: 'PHARMACY_PRESCRIPTION' },
          OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
        },
      });
      const pendingRoom = await pendingRoomCharges(
        tx,
        hospitalId,
        admission.encounterId,
        new Date(),
      );
      const medicalClearance = !!admission.dischargeSummary?.completedAt;
      const pendingBedTransfers = await tx.bedTransfer.count({
        where: {
          hospitalId,
          admissionId,
          status: { in: ACTIVE_BED_TRANSFERS },
        },
      });
      const pendingTransfers = await tx.transferOrder.count({
        where: {
          hospitalId,
          encounterId: admission.encounterId,
          status: {
            in: [
              'REQUESTED',
              'BED_ALLOCATED',
              'HANDOVER_DRAFTED',
              'HANDOVER_SIGNED',
            ],
          },
        },
      });
      const { availableBalance: availableDeposit } =
        await this.patientDeposit.getPatientDepositBalanceInternal(
          tx,
          hospitalId,
          admission.patientId,
        );

      const depositBalance = availableDeposit.isPositive()
        ? availableDeposit
        : Money.decimal(0);
      const hasSurplusDeposit = depositBalance.gt(debt);
      const surplusDepositAmount = hasSurplusDeposit
        ? depositBalance.minus(debt)
        : Money.decimal(0);

      const financialClearance =
        Money.lte(debt, debtLimit) &&
        unbilled === 0 &&
        pendingRoom.charges.length === 0 &&
        !pendingRoom.reviewReason;
      return {
        admissionId,
        hasDischargePlan: !!admission.dischargePlanning,
        hasDischargeSummary: medicalClearance,
        medicalClearance,
        financialClearance,
        unpaidInvoicesCount: debts.filter((value) => Money.isPositive(value))
          .length,
        patientDebt: Money.toDbString(debt),
        patientDepositBalance: Money.toDbString(depositBalance),
        hasSurplusDeposit,
        surplusDepositAmount: Money.toDbString(surplusDepositAmount),
        uninvoicedChargesCount: unbilled,
        pendingRoomDays: pendingRoom.pendingDays,
        roomBillingReviewReason: pendingRoom.reviewReason,
        roomBillingPolicy: admission.roomBillingPolicy,
        roomBillingTimeZone: admission.roomBillingTimeZone,
        pendingTransfersCount: pendingTransfers + pendingBedTransfers,
        pendingBedTransfersCount: pendingBedTransfers,
        ready:
          ['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'].includes(
            admission.admissionStatus,
          ) &&
          !!admission.dischargePlanning &&
          pendingTransfers + pendingBedTransfers === 0 &&
          medicalClearance &&
          financialClearance,
      };
    });
  }

  async dischargePatient(
    hospitalId: number,
    admissionId: number,
    dischargeData: {
      dischargeDisposition: DischargeDisposition;
      dischargeInstructions?: any;
      followUpRequired?: boolean;
      followUpInstructions?: any;
      actualCost?: number;
      autoSettleDeposits?: boolean;
      notes?: string;
    },
    userId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.admission.findFirst({
        where: { id: admissionId, hospitalId },
        select: { patientId: true, encounterId: true },
      });
      if (!identity) throw new NotFoundException('Admission not found');
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${identity.patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${identity.encounterId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "admissions" WHERE "id" = ${admissionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const admission = await tx.admission.findFirst({
        where: { id: admissionId, hospitalId },
        include: {
          bed: { include: { ward: true } },
          encounter: {
            include: {
              invoices: {
                include: {
                  refunds: {
                    where: { status: 'EXECUTED' },
                    select: { amount: true },
                  },
                  adjustments: {
                    where: { status: 'POSTED' },
                    select: { delta: true },
                  },
                },
              },
            },
          },
          dischargePlanning: true,
          dischargeSummary: true,
        },
      });

      if (!admission) {
        throw new NotFoundException('Admission not found');
      }

      if (admission.admissionStatus === 'DISCHARGED') {
        throw new BadRequestException('Patient is already discharged');
      }

      if (!admission.dischargePlanning) {
        throw new BadRequestException(
          'لا يمكن إجراء الخروج: خطة التخريج (Discharge Plan) التشغيلية غير موجودة.',
        );
      }

      // 1.5 Medical Summary Clearance (Phase 2 Requirement)
      const hasDischargeSummary = !!admission.dischargeSummary?.completedAt;
      const dischargeSummary = hasDischargeSummary
        ? admission.dischargeSummary
        : await tx.dischargeSummary.findFirst({
            where: { admissionId: admissionId, completedAt: { not: null } },
          });

      if (!dischargeSummary) {
        throw new BadRequestException(
          "لا يمكن إجراء الخروج: 'ملخص الخروج' الطبي (Discharge Summary) لم يُعتمد أو لم يُوقع بعد من الطبيب المعالج.",
        );
      }

      // Calculate length of stay
      const lengthOfStay = Math.floor(
        (new Date().getTime() - admission.actualAdmissionDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // 3. Financial Clearance Settings
      const debtLimit = await this.systemSettings.getNumber(
        hospitalId,
        'billing.debtLimit',
        0.01,
      );

      if (
        !['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'].includes(
          admission.admissionStatus,
        )
      ) {
        throw new BadRequestException('حالة الدخول لا تسمح بالخروج');
      }
      if (!Number.isFinite(debtLimit) || debtLimit < 0)
        throw new BadRequestException('حد المديونية المهيأ غير صالح');
      const pendingRoom = await pendingRoomCharges(
        tx,
        hospitalId,
        admission.encounterId,
        new Date(),
      );
      if (pendingRoom.reviewReason)
        throw new BadRequestException(pendingRoom.reviewReason);
      if (pendingRoom.charges.length)
        throw new BadRequestException(
          'توجد أيام إقامة غير مفوترة. يرجى إصدار فاتورة للحالة من الحسابات أولاً ثم تسويتها',
        );
      if (dischargeData.autoSettleDeposits) {
        for (const invoice of admission.encounter.invoices) {
          if (
            invoice.type === 'CREDIT_NOTE' ||
            !['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)
          )
            continue;
          const wallet =
            await this.patientDeposit.getPatientDepositBalanceInternal(
              tx,
              hospitalId,
              admission.patientId,
            );
          if (wallet.availableBalance.lte(0)) break;
          const balance = Money.subtractDecimal(
            effectivePatientShare(invoice),
            netPaidAmount(invoice),
          );
          if (balance.lte(0)) continue;
          const result = await this.patientDeposit.applyDepositToInvoice(
            hospitalId,
            userId,
            { invoiceId: invoice.id, requestId: '' },
            tx,
            `discharge:${admissionId}:${invoice.id}:${invoice.paidAmount.toString()}`,
          );
          invoice.paidAmount = Money.sumDecimal(
            invoice.paidAmount,
            result.appliedAmount,
          );
        }
      }

      let totalPatientDebt = Money.decimal(0);
      for (const invoice of admission.encounter.invoices) {
        if (invoice.status === 'CANCELLED' || invoice.type === 'CREDIT_NOTE')
          continue;
        const balance = Money.subtractDecimal(
          effectivePatientShare(invoice),
          netPaidAmount(invoice),
        );
        if (balance.isPositive())
          totalPatientDebt = totalPatientDebt.plus(balance);
      }
      if (Money.gt(totalPatientDebt, debtLimit))
        throw new BadRequestException(
          'يوجد رصيد مستحق على المريض بقيمة ' +
            Money.toDbString(totalPatientDebt) +
            ' د.ل. يرجى تسوية الفواتير أولاً',
        );
      const unbilled = await tx.encounterCharge.count({
        where: {
          hospitalId,
          encounterId: admission.encounterId,
          sourceType: { not: 'PHARMACY_PRESCRIPTION' },
          OR: [{ invoiceId: null }, { invoice: { status: 'CANCELLED' } }],
        },
      });
      if (unbilled)
        throw new BadRequestException(
          'توجد خدمات غير مفوترة أو مرتبطة بفواتير ملغاة. يرجى إصدار التسوية المالية أولاً',
        );

      // Update admission
      await assertNoPendingBedMovement(tx, hospitalId, admission.encounterId);
      const pendingTransfers = await tx.transferOrder.count({
        where: {
          hospitalId,
          encounterId: admission.encounterId,
          status: {
            in: [
              'REQUESTED',
              'BED_ALLOCATED',
              'HANDOVER_DRAFTED',
              'HANDOVER_SIGNED',
            ],
          },
        },
      });
      if (pendingTransfers)
        throw new BadRequestException(
          'يوجد طلب نقل نشط. يجب استكماله أو إلغاؤه قبل الخروج',
        );
      const updatedAdmission = await tx.admission.update({
        where: { id: admissionId },
        data: {
          admissionStatus: AdmissionStatus.DISCHARGED,
          medicalClearance: true,
          financialClearance: true,
          dischargeDate: new Date(),
          dischargeDisposition:
            dischargeData?.dischargeDisposition ||
            admission.dischargePlanning?.dischargeDisposition ||
            'HOME',
          dischargeInstructions:
            dischargeData?.dischargeInstructions ||
            admission.dischargePlanning?.followUpInstructions,
          followUpRequired:
            dischargeData?.followUpRequired ??
            admission.followUpRequired ??
            false,
          followUpInstructions:
            dischargeData?.followUpInstructions ??
            admission.dischargePlanning?.followUpInstructions,
          actualCost: dischargeData.actualCost,
          lengthOfStay,
        },
      });

      // The live assignment owns the bed; stale admission location fields cannot release another patient's bed.
      const assignments = await tx.bedAssignment.findMany({
        where: { hospitalId, encounterId: admission.encounterId, to: null },
      });
      for (const assignment of assignments) {
        const conflicting = await tx.bedAssignment.count({
          where: {
            hospitalId,
            bedId: assignment.bedId,
            to: null,
            encounterId: { not: admission.encounterId },
          },
        });
        if (conflicting)
          throw new BadRequestException(
            'يوجد تعارض في حجز السرير. تجب مراجعته قبل الخروج',
          );
        await tx.bed.update({
          where: { id: assignment.bedId, hospitalId },
          data: { status: BedStatus.CLEANING },
        });
      }
      await tx.bedAssignment.updateMany({
        where: { hospitalId, encounterId: admission.encounterId, to: null },
        data: { to: new Date() },
      });

      // Close encounter
      await tx.encounter.update({
        where: { id: admission.encounterId },
        data: { status: 'CLOSED', dischargeDate: new Date() },
      });

      // Create discharge note
      await tx.admissionNote.create({
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
    });
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

  /**
   * Delete a discharge planning (only PENDING/PLANNING)
   */
  async deleteDischargePlanning(hospitalId: number, admissionId: number) {
    const plan = await this.prisma.dischargePlanning.findFirst({
      where: { admissionId, admission: { hospitalId } },
    });

    if (!plan) {
      throw new NotFoundException('خطة الخروج غير موجودة.');
    }

    if (plan.status !== 'PLANNING' && plan.status !== 'PENDING') {
      throw new BadRequestException(
        'لا يمكن حذف خطة خروج قيد التنفيذ أو مكتملة.',
      );
    }

    await this.prisma.dischargePlanning.delete({
      where: { id: plan.id },
    });

    return { message: 'تم حذف خطة الخروج بنجاح.' };
  }

  /**
   * List discharge plans
   */
  async listDischargePlans(
    hospitalId: number,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      departmentId?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = { hospitalId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.departmentId) {
      where.admission = {
        departmentId: Number(query.departmentId),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.dischargePlanning.findMany({
        where,
        include: {
          admission: {
            include: {
              patient: true,
              bed: { include: { ward: true } },
              ward: true,
              department: true,
              admittingDoctor: true,
            },
          },
          creator: true,
          caseManager: true,
          socialWorker: true,
          followUpDoctor: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dischargePlanning.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update discharge plan status
   */
  async updateDischargePlanStatus(
    hospitalId: number,
    planId: number,
    status: string,
  ) {
    const plan = await this.prisma.dischargePlanning.findFirst({
      where: { id: planId, hospitalId },
    });

    if (!plan) {
      throw new NotFoundException('خطة الخروج غير موجودة');
    }

    return this.prisma.dischargePlanning.update({
      where: { id: planId },
      data: { status, updatedAt: new Date() },
    });
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
    return this.prisma.$transaction(async (tx) => {
      const { admission } = await lockActiveAdmission(
        tx,
        hospitalId,
        admissionId,
      );
      await assertNoPendingBedMovement(tx, hospitalId, admission.encounterId);
      const current = await tx.bedAssignment.findFirst({
        where: { hospitalId, encounterId: admission.encounterId, to: null },
      });
      if (!current)
        throw new BadRequestException('لا يوجد حجز سرير نشط لهذه الحالة');
      const source = await bedLocation(tx, hospitalId, current.bedId);
      const target = await bedLocation(tx, hospitalId, dto.toBedId);
      if (target.id === source.id || target.status !== BedStatus.AVAILABLE)
        throw new BadRequestException('سرير الوجهة غير متاح');
      return tx.bedTransfer.create({
        data: {
          hospitalId,
          admissionId,
          fromBedId: source.id,
          fromRoomId: source.roomId,
          fromWardId: source.wardId,
          toBedId: target.id,
          toRoomId: target.roomId,
          toWardId: target.wardId,
          transferReason: dto.transferReason,
          transferType: dto.transferType,
          priority: dto.priority,
          requestedBy: userId,
        },
        include: { fromBed: true, toBed: true },
      });
    });
  }

  private async executeBedTransfer(
    hospitalId: number,
    transferId: number,
    userId: number,
    approving: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.bedTransfer.findFirst({
        where: { id: transferId, hospitalId },
      });
      if (!identity)
        throw new NotFoundException('طلب النقل غير موجود في هذه المنشأة');
      const { admission } = await lockActiveAdmission(
        tx,
        hospitalId,
        identity.admissionId,
      );
      await tx.$queryRaw`SELECT "id" FROM "bed_transfers" WHERE "id" = ${transferId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const transfer = await tx.bedTransfer.findFirst({
        where: { id: transferId, hospitalId },
      });
      if (!transfer) throw new NotFoundException('طلب النقل غير موجود');
      if (
        transfer.status !== (approving ? 'REQUESTED' : 'APPROVED') ||
        (!approving && !transfer.approvedBy)
      )
        throw new BadRequestException(
          'حالة طلب النقل لا تسمح بالتنفيذ أو لم يعتمد بعد',
        );
      const destination = await bedLocation(tx, hospitalId, transfer.toBedId);
      if (
        destination.roomId !== transfer.toRoomId ||
        destination.wardId !== transfer.toWardId
      )
        throw new BadRequestException('تغير موقع سرير الوجهة منذ طلب النقل');
      await moveBed(tx, hospitalId, admission.encounterId, transfer.toBedId, {
        expectedFromBedId: transfer.fromBedId,
        bedTransferId: transferId,
      });
      return tx.bedTransfer.update({
        where: { id: transferId, hospitalId },
        data: {
          status: 'COMPLETED',
          ...(approving ? { approvedBy: userId } : {}),
          completedBy: userId,
          completedAt: new Date(),
        },
        include: { fromBed: true, toBed: true },
      });
    });
  }

  async approveBedTransfer(
    transferId: number,
    hospitalId: number,
    approvedById: number,
  ) {
    return this.executeBedTransfer(hospitalId, transferId, approvedById, true);
  }

  async completeBedTransfer(
    hospitalId: number,
    transferId: number,
    userId: number,
  ) {
    return this.executeBedTransfer(hospitalId, transferId, userId, false);
  }

  async cancelBedTransfer(hospitalId: number, transferId: number) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.bedTransfer.findFirst({
        where: { id: transferId, hospitalId },
      });
      if (!identity)
        throw new NotFoundException('طلب النقل غير موجود في هذه المنشأة');
      await lockActiveAdmission(tx, hospitalId, identity.admissionId, false);
      await tx.$queryRaw`SELECT "id" FROM "bed_transfers" WHERE "id" = ${transferId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const transfer = await tx.bedTransfer.findFirstOrThrow({
        where: { id: transferId, hospitalId },
      });
      if (transfer.status === 'CANCELLED') return transfer;
      if (!ACTIVE_BED_TRANSFERS.includes(transfer.status))
        throw new BadRequestException('لا يمكن إلغاء نقل مكتمل');
      return tx.bedTransfer.update({
        where: { id: transferId, hospitalId },
        data: { status: 'CANCELLED' },
      });
    });
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
    const wards = await this.prisma.ward.findMany({
      where: { hospitalId },
      include: {
        rooms: {
          include: {
            beds: {
              include: {
                assignments: {
                  where: { to: null },
                  include: {
                    encounter: {
                      include: {
                        patient: true,
                        admission: {
                          select: {
                            id: true,
                            admissionType: true,
                            primaryDiagnosis: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return wards.map((ward) => {
      let totalBeds = 0;
      let occupiedBeds = 0;
      let availableBeds = 0;
      let cleaningBeds = 0;
      let maintenanceBeds = 0;

      const roomsResult = ward.rooms.map((room) => {
        let roomTotal = 0;
        let roomOccupied = 0;
        let roomAvailable = 0;

        const bedsResult = room.beds.map((bed) => {
          roomTotal++;
          totalBeds++;

          if (bed.status === 'OCCUPIED') {
            roomOccupied++;
            occupiedBeds++;
          } else if (bed.status === 'AVAILABLE') {
            roomAvailable++;
            availableBeds++;
          } else if (bed.status === 'CLEANING') {
            cleaningBeds++;
          } else if (bed.status === 'MAINTENANCE') {
            maintenanceBeds++;
          }

          const activeAssignment =
            bed.assignments && bed.assignments.length > 0
              ? bed.assignments[0]
              : null;
          let patientInfo:
            | { admissionId: number; patientName: string; patientMrn: string }
            | undefined = undefined;

          if (
            activeAssignment &&
            activeAssignment.encounter &&
            activeAssignment.encounter.patient
          ) {
            patientInfo = {
              admissionId: activeAssignment.encounter.admission?.id || 0,
              patientName: activeAssignment.encounter.patient.fullName,
              patientMrn: activeAssignment.encounter.patient.mrn,
            };
          }

          return {
            bedId: bed.id,
            bedNumber: bed.bedNumber,
            status: bed.status,
            patient: patientInfo,
          };
        });

        return {
          roomId: room.id,
          roomNumber: room.roomNumber,
          totalBeds: roomTotal,
          occupiedBeds: roomOccupied,
          availableBeds: roomAvailable,
          beds: bedsResult,
        };
      });

      const occupancyRate =
        totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

      return {
        wardId: ward.id,
        wardName: ward.name,
        wardType: ward.type,
        totalBeds,
        occupiedBeds,
        availableBeds,
        cleaningBeds,
        maintenanceBeds,
        occupancyRate,
        rooms: roomsResult,
      };
    });
  }
}
