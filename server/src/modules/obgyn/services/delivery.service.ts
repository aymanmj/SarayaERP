import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateDeliveryDto, DeliveryMethod } from '../dto/create-delivery.dto';
import { ObstetricHistoryService } from './obstetric-history.service';
import { BillingService } from '../../../billing/billing.service';
import { EncounterStatus, ChargeSource, EncounterType } from '@prisma/client';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private historyService: ObstetricHistoryService,
    private billingService: BillingService,
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
                birthTime: baby.birthTime,
                apgarScore1: baby.apgarScore1,
                apgarScore5: baby.apgarScore5,
                notes: baby.notes,
            }))
        }
      },
      include: { babies: true },
    });

    // 4. Create Patient Records for Babies
    for (const babyProfile of delivery.babies) {
        const babyName = `Baby of ${encounter.patient.fullName}`;
        
        // We link to mother via motherId if it exists in schema, otherwise just create generic patient
        const newPatient = await this.prisma.patient.create({
            data: {
                hospitalId: encounter.hospitalId,
                fullName: babyName,
                gender: babyProfile.gender,
                dateOfBirth: babyProfile.birthTime, 
                mrn: `BABY-${Date.now()}-${babyProfile.id}`.slice(0, 20), // Ensure limit
 
            }
        });

        // Link to mother separately to avoid type issues with self-relations in create
        if (encounter.patientId) {
            await this.prisma.patient.update({
                where: { id: newPatient.id },
                data: {
                    // @ts-ignore: motherId type definition issue despite valid schema
                    motherId: encounter.patientId
                }
            });
        }

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
}

class Utils {
    static isCesarean(method: DeliveryMethod): boolean {
        return method === DeliveryMethod.CS_ELECTIVE || method === DeliveryMethod.CS_EMERGENCY || method === DeliveryMethod.VBAC; 
    }
}
