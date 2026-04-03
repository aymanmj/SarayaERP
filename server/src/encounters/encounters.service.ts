// src/encounters/encounters.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import {
  Prisma,
  EncounterStatus,
  EncounterType,
  BedStatus,
  ChargeSource,
} from '@prisma/client';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

  constructor(
    private prisma: PrismaService,
    private softDeleteService: SoftDeleteService,
    private systemSettings: SystemSettingsService,
    private priceService: PriceListsService,
    private accounting: AccountingService,
  ) {}

  async createEncounter(
    hospitalId: number,
    data: {
      patientId: number;
      type: EncounterType;
      departmentId?: number;
      doctorId?: number;
      chiefComplaint?: string;
    },
  ) {
    const { patientId, type, departmentId, doctorId, chiefComplaint } = data;

    // 1. التحقق من وجود المريض (مع بيانات التأمين)
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { insurancePolicy: true },
    });

    if (!patient || patient.hospitalId !== hospitalId) {
      throw new NotFoundException('المريض غير موجود.');
    }

    // 2. التحقق من وجود حالة مفتوحة (للطوارئ والإيواء) لتجنب التكرار
    if (type === EncounterType.IPD || type === EncounterType.ER) {
      const activeEncounter = await this.prisma.encounter.findFirst({
        where: {
          hospitalId,
          patientId,
          status: EncounterStatus.OPEN,
          type: { in: [EncounterType.IPD, EncounterType.ER] },
        },
      });

      if (activeEncounter) {
        throw new BadRequestException(
          'المريض لديه زيارة فعالة (طوارئ أو إيواء) بالفعل. يجب إغلاقها قبل فتح زيارة جديدة.',
        );
      }
    }

    // 3. إنشاء الزيارة (مع فوترة تلقائية لحالات الطوارئ)
    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.create({
        data: {
          hospitalId,
          patientId,
          type,
          departmentId,
          doctorId,
          chiefComplaint,
          status: EncounterStatus.OPEN,
          admissionDate: type === EncounterType.IPD ? new Date() : null,
        },
      });

      // ✅ [NEW] فوترة تلقائية لحالات الطوارئ (ER Auto-Billing)
      if (type === EncounterType.ER) {
        try {
          const erService = await tx.serviceItem.findFirst({
            where: { hospitalId, code: 'ER-VISIT', isActive: true },
          });

          if (erService) {
            // حساب السعر (يراعي التأمين إن وُجد)
            const policyId =
              patient.insurancePolicy?.isActive
                ? patient.insurancePolicy.id
                : null;

            const price = await this.priceService.getServicePrice(
              hospitalId,
              erService.id,
              policyId,
            );

            // إنشاء بند مالي (Charge)
            const charge = await tx.encounterCharge.create({
              data: {
                hospitalId,
                encounterId: encounter.id,
                serviceItemId: erService.id,
                sourceType: ChargeSource.MANUAL,
                quantity: 1,
                unitPrice: price,
                totalAmount: price,
                performerId: doctorId ?? null,
              },
            });

            // حساب حصص الدفع (مريض / تأمين)
            let patientShare = price;
            let insuranceShare = 0;
            let insuranceProviderId: number | null = null;

            if (patient.insurancePolicy?.isActive) {
              const copayRate =
                Number(patient.insurancePolicy.patientCopayRate || 0) / 100;
              patientShare = Math.round(price * copayRate * 100) / 100;
              insuranceShare = Math.round((price - patientShare) * 100) / 100;
              insuranceProviderId =
                patient.insurancePolicy.insuranceProviderId;
            }

            // محاولة إنشاء فاتورة (قد تفشل إذا الفترة المالية مغلقة)
            try {
              const { financialYear, period } =
                await this.accounting.validateDateInOpenPeriod(
                  hospitalId,
                  new Date(),
                );

              const invoice = await tx.invoice.create({
                data: {
                  hospitalId,
                  patientId,
                  encounterId: encounter.id,
                  status: 'ISSUED',
                  totalAmount: price,
                  discountAmount: 0,
                  paidAmount: 0,
                  currency: 'LYD',
                  patientShare,
                  insuranceShare,
                  insuranceProviderId,
                  financialYearId: financialYear.id,
                  financialPeriodId: period.id,
                },
              });

              // ربط البند بالفاتورة
              await tx.encounterCharge.update({
                where: { id: charge.id },
                data: { invoiceId: invoice.id },
              });

              this.logger.log(
                `✅ ER Auto-Billing: Invoice #${invoice.id} created for encounter #${encounter.id} (${price} LYD)`,
              );
            } catch (invoiceErr) {
              // الفاتورة فشلت (فترة مالية مغلقة مثلاً) — البند يبقى بدون فاتورة
              this.logger.warn(
                `⚠️ ER charge created but invoice failed for encounter #${encounter.id}: ${invoiceErr.message}`,
              );
            }
          } else {
            this.logger.warn(
              `⚠️ ER-VISIT service item not found. Skipping auto-billing for encounter #${encounter.id}.`,
            );
          }
        } catch (billingErr) {
          // لا نمنع فتح حالة الطوارئ بسبب فشل الفوترة
          this.logger.error(
            `❌ ER Auto-Billing failed for encounter #${encounter.id}: ${billingErr.message}`,
          );
        }
      }

      // إرجاع الحالة مع العلاقات
      return tx.encounter.findUnique({
        where: { id: encounter.id },
        include: {
          patient: { select: { fullName: true, mrn: true } },
          doctor: { select: { fullName: true } },
          department: { select: { name: true } },
        },
      });
    });
  }

  async getEncounterById(hospitalId: number, id: number) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: true,
        department: true,
        bedAssignments: {
          where: { to: null },
          include: {
            bed: {
              include: {
                ward: true,
              },
            },
          },
        },
        invoices: true,
        admission: true,
      },
    });

    if (!encounter || encounter.hospitalId !== hospitalId) {
      throw new NotFoundException('الزيارة غير موجودة');
    }

    return encounter;
  }

  async closeEncounter(hospitalId: number, encounterId: number) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter || encounter.hospitalId !== hospitalId) {
      throw new NotFoundException('الزيارة غير موجودة');
    }

    if (encounter.status !== EncounterStatus.OPEN) {
      throw new BadRequestException('الزيارة مغلقة بالفعل');
    }

    // IPD encounters should be discharged via dischargePatient to handle bed release
    if (encounter.type === EncounterType.IPD) {
      throw new BadRequestException(
        'حالات الإيواء يجب إغلاقها عبر إجراء الخروج (Discharge).',
      );
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: {
        status: EncounterStatus.CLOSED,
        dischargeDate: new Date(),
      },
    });
  }

  // ... (previous code)

  // ✅ [NEW] دالة الخروج الآمن (Discharge & Clearance)
  async dischargePatient(hospitalId: number, encounterId: number) {
    // 0. جلب إعداد الحد المسموح به للمديونية
    const debtLimit = await this.systemSettings.getNumber(hospitalId, 'billing.debtLimit', 0.01);

    return this.prisma.$transaction(async (tx) => {
      // 1. جلب الحالة مع الفواتير والسرير
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: {
          invoices: true,
          bedAssignments: {
            where: { to: null }, // السرير الحالي
            include: { bed: true },
          },
          // يمكن التحقق من طلبات المختبر المعلقة هنا أيضاً
        },
      });

      if (!encounter || encounter.hospitalId !== hospitalId) {
        throw new NotFoundException('الحالة غير موجودة.');
      }

      if (encounter.type === EncounterType.IPD) {
        throw new BadRequestException('حالات الإيواء يجب إغلاقها استكمال "خطة الخروج الطبية" أولاً ولضمان الفوترة التلقائية لرسوم السرير.');
      }

      if (encounter.status !== EncounterStatus.OPEN) {
        throw new BadRequestException('الحالة مغلقة بالفعل.');
      }

      // 2. التحقق المالي (Financial Clearance)
      // يجب أن يكون المريض قد دفع حصته بالكامل في كل الفواتير الصادرة
      let totalPatientDebt = 0;

      for (const inv of encounter.invoices) {
        if (inv.status === 'CANCELLED') continue;

        // المبلغ المطلوب من المريض = حصته - ما دفعه
        // (إذا كانت الفاتورة نقدي، patientShare سيكون يساوي totalAmount كما ضبطنا سابقاً)
        const patientShare = Number(inv.patientShare);
        const paid = Number(inv.paidAmount);

        const remaining = patientShare - paid;
        if (remaining > debtLimit) {
          // سماحية بسيطة للكسور
          totalPatientDebt += remaining;
        }
      }

      if (totalPatientDebt > debtLimit) {
        throw new BadRequestException(
          `لا يمكن إجراء الخروج. يوجد مستحقات مالية على المريض بقيمة ${totalPatientDebt.toFixed(3)} دينار. يرجى السداد أولاً (الحد المسموح به: ${debtLimit}).`,
        );
      }

      // يمكن هنا التحقق من وجود بنود غير مفوترة (EncounterCharge with invoiceId=null)
      const uninvoicedCharges = await tx.encounterCharge.count({
        where: { encounterId, invoiceId: null },
      });

      if (uninvoicedCharges > 0) {
        throw new BadRequestException(
          `يوجد ${uninvoicedCharges} بنود (خدمات/أدوية) لم يتم إصدار فواتير لها. يرجى إصدار الفواتير أولاً.`,
        );
      }

      // 3. تحرير السرير (Bed Release)
      // نحول حالة السرير إلى CLEANING لكي لا يتم تسكين مريض آخر فوراً قبل التنظيف
      if (encounter.bedAssignments.length > 0) {
        const assignment = encounter.bedAssignments[0];

        await tx.bedAssignment.update({
          where: { id: assignment.id },
          data: { to: new Date() }, // إنهاء الحجز
        });

        await tx.bed.update({
          where: { id: assignment.bed.id },
          data: { status: BedStatus.CLEANING },
        });
      }

      // 4. إغلاق الحالة
      const updatedEncounter = await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.CLOSED,
          dischargeDate: new Date(),
        },
      });

      // 5. ✅ [NEW] تحديث حالة الإيواء (Admission) المرتبطة
      // يجب البحث عن أي دخول مرتبط بهذه الزيارة ولم يخرج بعد
      const activeAdmission = await tx.admission.findFirst({
        where: {
          encounterId: encounterId,
          admissionStatus: { in: ['ADMITTED', 'IN_PROGRESS'] }, // استخدمنا القيم النصية بدلاً من Enum لتجنب مشاكل الاستيراد إذا لم يكن موجوداً
        },
      });

      if (activeAdmission) {
        await tx.admission.update({
          where: { id: activeAdmission.id },
          data: {
            admissionStatus: 'DISCHARGED', // AdmissionStatus.DISCHARGED
            dischargeDate: new Date(),
            lengthOfStay: Math.max(
              0,
              Math.floor(
                (new Date().getTime() - activeAdmission.actualAdmissionDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            ),
          },
        });
      }

      return updatedEncounter;
    });
  }

  async listActiveInpatients(hospitalId: number) {
    return this.prisma.encounter.findMany({
      where: {
        hospitalId,
        type: EncounterType.IPD, // تنويم فقط
        status: EncounterStatus.OPEN, // الحالات المفتوحة فقط
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            mrn: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        doctor: {
          select: { fullName: true },
        },
        bedAssignments: {
          where: { to: null },
          orderBy: { from: 'desc' },
          take: 1,
          include: {
            bed: {
              include: {
                ward: { select: { name: true } },
              },
            },
          },
        },
        vitalSigns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        admission: {
            select: { id: true, primaryDiagnosis: true }
        }
      },
      orderBy: {
        admissionDate: 'desc',
      },
    });
  }

  async softDelete(hospitalId: number, id: number, userId: number) {
    return this.softDeleteService.softDelete(
      this.prisma.encounter,
      {
        notFoundMessage: 'الزيارة (Encounter) غير موجودة أو تم حذفها مسبقاً',
        where: {
          id,
          hospitalId,
          isDeleted: false,
        },
        extraUpdateData: {},
      },
      userId,
    );
  }

  // تعيين طبيب لحالة موجودة
  async assignDoctor(
    hospitalId: number,
    encounterId: number,
    doctorId: number,
  ) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter || encounter.hospitalId !== hospitalId) {
      throw new NotFoundException('الحالة غير موجودة');
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: { doctorId },
    });
  }

  // تحويل حالة من طوارئ إلى تنويم
  async admitPatientFromER(
    hospitalId: number,
    encounterId: number,
    departmentId?: number,
  ) {
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId, hospitalId },
    });

    if (!encounter) throw new NotFoundException('الحالة غير موجودة');

    if (encounter.type !== 'ER') {
      throw new BadRequestException(
        'يمكن تنويم حالات الطوارئ فقط من هذا الإجراء.',
      );
    }

    if (encounter.status !== 'OPEN') {
      throw new BadRequestException('الحالة مغلقة بالفعل.');
    }

    return this.prisma.encounter.update({
      where: { id: encounterId },
      data: {
        type: 'IPD', // تحويل النوع إلى إيواء
        departmentId: departmentId ?? encounter.departmentId,
        admissionDate: new Date(), // تاريخ الدخول الفعلي
        // يبقى الـ status = OPEN حتى يتم الخروج لاحقاً
      },
    });
  }

  // 🛡️ حذف بند طبي (خدمة/تحليل/أشعة) بشكل آمن
  async deleteEncounterCharge(hospitalId: number, chargeId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. جلب البند والتأكد من تبعيته للمستشفى
      const charge = await tx.encounterCharge.findFirst({
        where: { id: chargeId, hospitalId },
      });

      if (!charge) {
        throw new NotFoundException('البند الطبي غير موجود.');
      }

      // 2. 🛡️ الحماية المالية: منع الحذف إذا كان البند مرتبطاً بفاتورة
      if (charge.invoiceId) {
        throw new BadRequestException(
          'لا يمكن حذف هذا البند لأنه مدرج بالفعل في فاتورة صادرة. يجب إلغاء الفاتورة أولاً لإعادة البند للحالة القابلة للتعديل.',
        );
      }

      // 3. تنفيذ الحذف
      await tx.encounterCharge.delete({
        where: { id: chargeId },
      });

      return { success: true };
    });
  }

  async findAll(params: {
    hospitalId: number;
    patientId?: number;
    type?: EncounterType;
    status?: EncounterStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      hospitalId,
      patientId,
      type,
      status,
      search,
      page = 1,
      limit = 15,
    } = params;
    const skip = (page - 1) * limit;

    // 1. بناء شروط الفلترة
    const where: Prisma.EncounterWhereInput = {
      hospitalId,
      isDeleted: false,
      patientId: patientId ? Number(patientId) : undefined,
      type: type || undefined,
      status: status || undefined,
      ...(search
        ? {
            OR: [
              {
                patient: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
              { patient: { mrn: { contains: search, mode: 'insensitive' } } },
              { id: isNaN(Number(search)) ? undefined : Number(search) },
            ],
          }
        : {}),
    };

    // 2. الاستعلام مع جلب العلاقات (Include) 👈 هذا هو الجزء الناقص
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.encounter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // ✅ جلب بيانات المريض
          patient: {
            select: {
              id: true,
              fullName: true,
              mrn: true,
            },
          },
          // ✅ جلب بيانات الطبيب
          doctor: {
            select: {
              id: true,
              fullName: true,
            },
          },
          // جلب بيانات القسم
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.encounter.count({ where }),
    ]);

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

}
