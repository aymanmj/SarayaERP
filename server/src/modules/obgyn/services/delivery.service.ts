import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateDeliveryDto, DeliveryMethod } from '../dto/create-delivery.dto';
import { ObstetricHistoryService } from './obstetric-history.service';
import { BillingService } from '../../../billing/billing.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { EncounterStatus, ChargeSource, EncounterType } from '@prisma/client';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private historyService: ObstetricHistoryService,
    private billingService: BillingService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateDeliveryDto, userId: number) {
    // 1. Validate Encounter
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: dto.encounterId },
      include: { patient: true },
    });

    if (!encounter) throw new NotFoundException('Encounter not found');
    
    // Ensure encounter is IPD
    if (encounter.type !== EncounterType.IPD) {
         // ✅ [FIX] Check if Doctor has a department, and assign to encounter
         let deptId = encounter.departmentId;
         if (!deptId && encounter.doctorId) {
             const doc = await this.prisma.user.findUnique({ where: { id: encounter.doctorId }, select: { departmentId: true } });
             if (doc?.departmentId) deptId = doc.departmentId;
         }

         await this.prisma.encounter.update({
             where: { id: dto.encounterId },
             data: { 
                 type: EncounterType.IPD,
                 ...(deptId ? { departmentId: deptId } : {})
             }
         });
    }

    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.status === EncounterStatus.CLOSED || encounter.status === EncounterStatus.CANCELLED) {
         this.logger.warn(`Creating delivery for closed encounter #${encounter.id}`);
    }

    // Check if delivery already exists
    const existingDelivery = await this.prisma.deliveryAdmission.findUnique({
        where: { encounterId: dto.encounterId }
    });

    if (existingDelivery) {
        throw new BadRequestException('تم تسجيل ولادة لهذه الزيارة مسبقاً. يرجى تعديل السجل الموجود بدلاً من إنشاء جديد.');
    }

    // 2. Get Obstetric History for Pricing Logic
    const history = await this.historyService.findOneByPatientId(encounter.patientId);
    
    // 3. Create Delivery Admission Record
    const delivery = await this.prisma.deliveryAdmission.create({
      data: {
        encounterId: dto.encounterId,
        deliveryMethod: dto.deliveryMethod,
        inductionMethod: dto.inductionMethod,
        placentaDelivery: dto.placentaDelivery,
        episiotomy: dto.episiotomy,
        perinealTear: dto.perinealTear,
        bloodLoss: dto.bloodLoss,
        babyCount: dto.babyCount,
        notes: dto.notes,
        babies: {
            create: dto.babies.map(baby => ({
                gender: baby.gender,
                weight: baby.weight,
                length: baby.length,
                headCircumference: baby.headCircumference,
                birthTime: baby.birthTime,
                apgarScore1: baby.apgarScore1,
                apgarScore5: baby.apgarScore5,
                apgarScore10: baby.apgarScore10,
                status: baby.status || 'ALIVE',
                vitaminKGiven: baby.vitaminKGiven ?? false,
                bcgVaccineGiven: baby.bcgVaccineGiven ?? false,
                notes: baby.notes,
            }))
        }
      },
      include: { babies: true },
    });

    // 4. Create Patient Records for Babies
    for (let i = 0; i < delivery.babies.length; i++) {
        const babyProfile = delivery.babies[i];
        const babyIndex = delivery.babyCount > 1 ? ` (${i + 1})` : '';
        const babyName = `مولود ${encounter.patient.fullName}${babyIndex}`;
        
        // MRN آمن: NB-{hospitalId}-{YYMMDD}-{deliveryId}-{index}
        const now = new Date();
        const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const safeMrn = `NB-${encounter.hospitalId}-${dateStr}-${delivery.id}-${i + 1}`;
        
        const newPatient = await this.prisma.patient.create({
            data: {
                hospitalId: encounter.hospitalId,
                fullName: babyName,
                gender: babyProfile.gender,
                dateOfBirth: babyProfile.birthTime, 
                mrn: safeMrn,
                motherId: encounter.patientId,
            }
        });

        // Link back to BabyProfile
        await this.prisma.babyProfile.update({
            where: { id: babyProfile.id },
            data: { generatedPatientId: newPatient.id }
        });
    }

    // 5. Apply Pricing / Charges
    await this.applyDeliveryCharges(delivery, history, encounter.hospitalId, userId);

    // 6. Update Obstetric History
    if (history) {
        const isCS = Utils.isCesarean(dto.deliveryMethod);
        await this.historyService.updateByPatientId(encounter.patientId, {
            para: (history.para || 0) + dto.babyCount, 
            prevCSCount: isCS ? (history.prevCSCount || 0) + 1 : history.prevCSCount,
            lastDeliveryDate: new Date().toISOString(),
        });
    }

    // 7. === تنبيه Rh بعد الولادة ===
    await this.checkPostDeliveryRhAlert(encounter.patientId, encounter.hospitalId, userId);

    return delivery;
  }

  private async applyDeliveryCharges(delivery: any, history: any, hospitalId: number, userId: number) {
    // 1. Determine Service Code based on Method & History
    let serviceCode = 'NVD_PKG'; // Default

    switch (delivery.deliveryMethod) {
        case DeliveryMethod.NVD:
            serviceCode = 'NVD_PKG';
            break;
        case DeliveryMethod.ASSISTED_NVD:
            serviceCode = 'NVD_ASSIST_PKG';
            break;
        case DeliveryMethod.CS_EMERGENCY:
            serviceCode = 'CS_EMERG_PKG';
            break;
        case DeliveryMethod.VBAC:
            serviceCode = 'VBAC_PKG';
            break;
        case DeliveryMethod.CS_ELECTIVE:
            // Check history for Previous CS
            if (history && history.prevCSCount > 0) {
                 serviceCode = 'CS_REPEAT_PKG';
            } else {
                 serviceCode = 'CS_FIRST_PKG';
            }
            break;
    }

    this.logger.log(`Determined Delivery Package: ${serviceCode} for Method: ${delivery.deliveryMethod}, PrevCS: ${history?.prevCSCount}`);

    // 2. Find Service Item
    const serviceItem = await this.prisma.serviceItem.findFirst({
        where: { code: serviceCode, hospitalId },
    });

    if (!serviceItem) {
        this.logger.warn(`Service Item ${serviceCode} not found. Skipping auto-charge.`);
        return;
    }

    // Use defaultPrice as basePrice
    let price = Number(serviceItem.defaultPrice); 

    // 3. Apply Multipliers / Rules
    // Rule: Multiple Birth (Twins/Triplets) -> 50% extra per additional baby
    if (delivery.babyCount > 1) {
        const extraBabies = delivery.babyCount - 1;
        const surcharge = price * 0.5 * extraBabies;
        price += surcharge;
        this.logger.log(`Applied Multiple Birth Surcharge: +${surcharge} for ${extraBabies} extra babies`);
    }

    // 4. Create Encounter Charge
    await this.prisma.encounterCharge.create({
        data: {
            hospitalId,
            encounterId: delivery.encounterId,
            serviceItemId: serviceItem.id,
            quantity: 1,
            sourceType: ChargeSource.OTHER, 
            unitPrice: price,
            totalAmount: price,
            performerId: userId,
        }
    });

    // 5. Trigger Billing & Accounting
    // Automatically generate invoice and accounting entry
    try {
        await this.billingService.createInvoiceForEncounter(delivery.encounterId, hospitalId, userId);
        this.logger.log(`Generated Invoice for Delivery Encounter #${delivery.encounterId}`);
    } catch (err) {
        this.logger.error(`Failed to generate invoice for key delivery charge`, err);
        // We don't throw here to avoid rolling back the delivery record, but we log the error.
    }

    // TODO: Add Epidural charge if applicable (need to add field to DTO first)
  }

  async findAllByPatient(patientId: number) {
    return this.prisma.deliveryAdmission.findMany({
      where: {
        encounter: {
          patientId: patientId
        }
      },
      include: {
        babies: true,
        encounter: {
            select: {
                admissionDate: true,
                hospitalId: true,
                admission: {
                    select: {
                        actualAdmissionDate: true
                    }
                }
            }
        }
      },
      orderBy: {
        encounter: {
            admissionDate: 'desc'
        }
      }
    });
  }

  /**
   * تنبيه Rh بعد الولادة — فحص دم المولود + Anti-D
   */
  private async checkPostDeliveryRhAlert(patientId: number, hospitalId: number, userId: number) {
    try {
      const activeCare = await this.prisma.antenatalCare.findFirst({
        where: {
          patientId,
          hospitalId,
          status: 'ACTIVE',
          rhFactor: 'Negative',
        },
        include: { patient: { select: { fullName: true, mrn: true } } },
      });

      if (!activeCare) return;

      const patientName = activeCare.patient?.fullName || 'مريضة';
      const targetDoctor = activeCare.doctorId || userId;

      await this.notifications.create(
        hospitalId, targetDoctor,
        '🚨 ولادة لأم Rh سالب — فحص دم المولود مطلوب',
        `تمت ولادة المريضة ${patientName} (MRN: ${activeCare.patient?.mrn}). ` +
        `الأم Rh سالب (-). يرجى فحص فصيلة دم المولود فوراً. ` +
        `إذا كان المولود Rh موجب (+) → يجب إعطاء الأم حقنة Anti-D خلال 72 ساعة.`,
        `/obgyn/anc?careId=${activeCare.id}`,
      );

      await this.prisma.antenatalCare.update({
        where: { id: activeCare.id },
        data: { status: 'DELIVERED' },
      });

      this.logger.log(`[Rh Post-Delivery] Alert sent for patient ${patientId}`);
    } catch (error) {
      this.logger.error('[Rh Post-Delivery] Error checking Rh alert', error);
    }
  }
}

class Utils {
    static isCesarean(method: DeliveryMethod): boolean {
        // VBAC هي ولادة طبيعية بعد قيصرية — ليست قيصرية!
        return method === DeliveryMethod.CS_ELECTIVE || method === DeliveryMethod.CS_EMERGENCY;
    }
}
