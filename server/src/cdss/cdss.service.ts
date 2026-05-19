// src/cdss/cdss.service.ts
// =====================================================================
// نظام دعم القرار السريري (Clinical Decision Support System)
// محرك الفحص والتنبيهات الذكي
// =====================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TerminologyService } from '../terminology/terminology.service';
import {
  CDSSAlertType,
  CDSSAlertSeverity,
  CDSSAlertStatus,
  DrugInteractionSeverity,
  Gender,
  TerminologySystem,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ======================== Types ========================

export interface DrugCheckInput {
  productId?: number;
  genericName: string;
  dose?: string;
  route?: string;
}

export interface PrescriptionCheckInput {
  patientId: number;
  encounterId?: number;
  hospitalId: number;
  drugs: DrugCheckInput[];
}

export interface CDSSCheckResult {
  passed: boolean;
  alerts: CDSSAlertResult[];
  canProceed: boolean; // هل يمكن المتابعة (لا توجد تنبيهات حرجة)
}

export interface CDSSAlertResult {
  type: CDSSAlertType;
  severity: CDSSAlertSeverity;
  message: string;
  messageAr?: string;
  context?: Record<string, any>;
  requiresOverride: boolean;
}

export interface LabValueCheck {
  testCode: string;
  value: number;
  unit: string;
  patientId: number;
  patientAge?: number;
  gender?: Gender;
}

export interface VitalValueCheck {
  vitalType: string; // HR, BP_SYS, BP_DIA, TEMP, SPO2, RR
  value: number;
  patientId: number;
  patientAge?: number;
}

// ======================== Service ========================

@Injectable()
export class CDSSService {
  private readonly logger = new Logger(CDSSService.name);

  constructor(
    private prisma: PrismaService,
    private terminologyService: TerminologyService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ======================== 1. Drug-Drug Interactions ========================

  /**
   * فحص التفاعلات الدوائية بين قائمة من الأدوية
   * يبحث في قاعدة البيانات عن التفاعلات المعروفة
   */
  async checkDrugInteractions(
    drugGenericNames: string[],
  ): Promise<CDSSAlertResult[]> {
    const alerts: CDSSAlertResult[] = [];
    const normalized = drugGenericNames.map((d) => d.toLowerCase().trim());

    // جلب جميع التفاعلات المحتملة
    const interactions = await this.prisma.drugInteraction.findMany({
      where: {
        isActive: true,
        OR: [
          { drugAGeneric: { in: normalized, mode: 'insensitive' } },
          { drugBGeneric: { in: normalized, mode: 'insensitive' } },
        ],
      },
    });

    // فحص كل تفاعل
    for (const interaction of interactions) {
      const drugA = interaction.drugAGeneric.toLowerCase();
      const drugB = interaction.drugBGeneric.toLowerCase();

      // هل كلا الدوائين موجودان في القائمة؟
      const hasA = normalized.some(
        (d) => d.includes(drugA) || drugA.includes(d),
      );
      const hasB = normalized.some(
        (d) => d.includes(drugB) || drugB.includes(d),
      );

      if (hasA && hasB) {
        alerts.push({
          type: CDSSAlertType.DRUG_INTERACTION,
          severity: this.mapInteractionSeverity(interaction.severity),
          message: interaction.description,
          messageAr: interaction.descriptionAr ?? undefined,
          context: {
            drugA: interaction.drugAGeneric,
            drugB: interaction.drugBGeneric,
            recommendation: interaction.recommendation,
            source: interaction.source,
          },
          requiresOverride:
            interaction.severity === DrugInteractionSeverity.CONTRAINDICATED,
        });
      }
    }

    return alerts;
  }

  // ======================== 2. Drug-Allergy Check (with Cross-Reactivity) ========================

  /**
   * فحص تعارض الأدوية مع حساسيات المريض
   * يستخدم محرك Cross-Reactivity للكشف عن التحسس المتبادل بين أدوية نفس المجموعة
   * مثال: حساسية من Aspirin → تنبيه عند وصف Ibuprofen (كلاهما NSAIDs)
   */
  async checkDrugAllergies(
    patientId: number,
    drugGenericNames: string[],
  ): Promise<CDSSAlertResult[]> {
    const alerts: CDSSAlertResult[] = [];

    // جلب حساسيات المريض
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { patientId },
    });

    if (allergies.length === 0) return alerts;

    const normalizedDrugs = drugGenericNames.map((d) => d.toLowerCase().trim());

    // ─── Phase 1: Cross-Reactivity Engine (DB-driven) ───
    // لكل حساسية، نبحث عن مجموعتها (AllergyGroup) ثم نفحص كل أعضاء المجموعة
    const crossReactivityMatched = new Set<string>(); // لتجنب التنبيهات المكررة

    for (const allergy of allergies) {
      const allergen = allergy.allergen.toLowerCase().trim();

      // البحث عن مجموعات الحساسية التي ينتمي إليها المادة المسببة للتحسس
      const allergenGroups = await this.prisma.allergyGroupDrug.findMany({
        where: { drugGeneric: { equals: allergen, mode: 'insensitive' } },
        include: {
          allergyGroup: {
            include: { members: true },
          },
        },
      });

      if (allergenGroups.length > 0) {
        // وجدنا مجموعة — نفحص كل أعضائها ضد الأدوية الموصوفة
        for (const entry of allergenGroups) {
          const groupMembers = entry.allergyGroup.members.map((m) =>
            m.drugGeneric.toLowerCase(),
          );
          const groupName = entry.allergyGroup.name;

          for (const drug of normalizedDrugs) {
            // هل الدواء الموصوف ينتمي لنفس مجموعة الحساسية؟
            const memberMatch = groupMembers.find(
              (m) => drug.includes(m) || m.includes(drug),
            );
            if (memberMatch) {
              const key = `${drug}|${allergen}`;
              if (crossReactivityMatched.has(key)) continue;
              crossReactivityMatched.add(key);

              const isDirect =
                drug.includes(allergen) || allergen.includes(drug);
              alerts.push({
                type: CDSSAlertType.DRUG_ALLERGY,
                severity: isDirect
                  ? this.mapAllergySeverity(allergy.severity)
                  : CDSSAlertSeverity.HIGH,
                message: isDirect
                  ? `Direct allergy match: "${drug}" — patient is allergic to "${allergy.allergen}"`
                  : `Cross-reactivity risk: "${drug}" belongs to ${groupName} group — patient is allergic to "${allergy.allergen}" (same group)`,
                messageAr: isDirect
                  ? `تطابق مباشر: الدواء "${drug}" — المريض لديه حساسية من "${allergy.allergen}"`
                  : `خطر تفاعل متبادل: الدواء "${drug}" ينتمي لمجموعة ${groupName} — المريض لديه حساسية من "${allergy.allergen}" (نفس المجموعة)`,
                context: {
                  drug,
                  allergen: allergy.allergen,
                  severity: allergy.severity,
                  reaction: allergy.reaction,
                  crossReactivityGroup: groupName,
                  isDirect,
                },
                requiresOverride: isDirect && allergy.severity === 'SEVERE',
              });
            }
          }
        }
      }
    }

    // ─── Phase 2: Fallback — Text matching للمواد غير المصنفة بعد ───
    for (const allergy of allergies) {
      const allergen = allergy.allergen.toLowerCase().trim();
      for (const drug of normalizedDrugs) {
        const key = `${drug}|${allergen}`;
        if (crossReactivityMatched.has(key)) continue; // تم التنبيه بالفعل

        if (drug.includes(allergen) || allergen.includes(drug)) {
          crossReactivityMatched.add(key);
          alerts.push({
            type: CDSSAlertType.DRUG_ALLERGY,
            severity: this.mapAllergySeverity(allergy.severity),
            message: `Drug "${drug}" may trigger allergy to "${allergy.allergen}"`,
            messageAr: `الدواء "${drug}" قد يسبب تفاعل تحسسي مع "${allergy.allergen}"`,
            context: {
              drug,
              allergen: allergy.allergen,
              severity: allergy.severity,
              reaction: allergy.reaction,
              isDirect: true,
            },
            requiresOverride: allergy.severity === 'SEVERE',
          });
        }
      }
    }

    return alerts;
  }

  // ======================== 3. Duplicate Therapy Check ========================

  /**
   * فحص تكرار نفس الفئة الدوائية
   * (مثلاً: وصف NSAIDs متعددة)
   */
  async checkDuplicateTherapy(
    patientId: number,
    newDrugGenericNames: string[],
    drugs: DrugCheckInput[] = [],
  ): Promise<CDSSAlertResult[]> {
    const alerts: CDSSAlertResult[] = [];

    const atcGroups = new Map<string, string[]>();
    for (const drug of drugs) {
      const concept = await this.resolveDrugTerminology(drug);
      if (!concept || concept.system !== TerminologySystem.ATC) continue;
      const group = concept.code.slice(0, 3).toUpperCase();
      if (!group) continue;
      const list = atcGroups.get(group) || [];
      list.push(drug.genericName);
      atcGroups.set(group, list);
    }

    for (const [group, drugNames] of atcGroups.entries()) {
      if (drugNames.length < 2) continue;
      alerts.push({
        type: CDSSAlertType.DUPLICATE_THERAPY,
        severity: CDSSAlertSeverity.HIGH,
        message: `Potential duplicate therapy in ATC group ${group}: ${drugNames.join(', ')}`,
        messageAr: `احتمال تكرار علاجي ضمن مجموعة ATC ${group}: ${drugNames.join('، ')}`,
        context: { atcGroup: group, drugs: drugNames },
        requiresOverride: false,
      });
    }

    // fallback: فحص بسيط للتكرار في نفس الوصفة
    const duplicates = newDrugGenericNames.filter(
      (drug, index) => newDrugGenericNames.indexOf(drug) !== index,
    );

    for (const dup of duplicates) {
      alerts.push({
        type: CDSSAlertType.DUPLICATE_THERAPY,
        severity: CDSSAlertSeverity.MODERATE,
        message: `Duplicate drug detected: ${dup}`,
        messageAr: `تم اكتشاف تكرار للدواء: ${dup}`,
        context: { drug: dup },
        requiresOverride: false,
      });
    }

    return alerts;
  }

  // ======================== 4. Critical Lab Values ========================

  /**
   * فحص القيم الحرجة لنتائج المختبر
   */
  async checkLabCriticalValue(
    input: LabValueCheck,
  ): Promise<CDSSAlertResult | null> {
    const rule = await this.prisma.labCriticalValue.findFirst({
      where: {
        labTestCode: input.testCode,
        isActive: true,
        // TODO: إضافة فلترة حسب العمر والجنس
      },
    });

    if (!rule) return null;

    let severity: CDSSAlertSeverity = CDSSAlertSeverity.INFO;
    let message = '';
    let messageAr = '';
    let isPanic = false;

    const value = input.value;

    // فحص القيم الحرجة
    if (rule.panicLow && value < Number(rule.panicLow)) {
      severity = CDSSAlertSeverity.CRITICAL;
      message = `PANIC LOW: ${rule.labTestName} = ${value} ${rule.unit} (Critical < ${rule.panicLow})`;
      messageAr = `قيمة حرجة منخفضة جداً: ${rule.labTestName} = ${value} ${rule.unit}`;
      isPanic = true;
    } else if (rule.panicHigh && value > Number(rule.panicHigh)) {
      severity = CDSSAlertSeverity.CRITICAL;
      message = `PANIC HIGH: ${rule.labTestName} = ${value} ${rule.unit} (Critical > ${rule.panicHigh})`;
      messageAr = `قيمة حرجة مرتفعة جداً: ${rule.labTestName} = ${value} ${rule.unit}`;
      isPanic = true;
    } else if (rule.criticalLow && value < Number(rule.criticalLow)) {
      severity = CDSSAlertSeverity.HIGH;
      message = `Critical LOW: ${rule.labTestName} = ${value} ${rule.unit}`;
      messageAr = `قيمة منخفضة حرجة: ${rule.labTestName} = ${value} ${rule.unit}`;
    } else if (rule.criticalHigh && value > Number(rule.criticalHigh)) {
      severity = CDSSAlertSeverity.HIGH;
      message = `Critical HIGH: ${rule.labTestName} = ${value} ${rule.unit}`;
      messageAr = `قيمة مرتفعة حرجة: ${rule.labTestName} = ${value} ${rule.unit}`;
    } else {
      return null; // ضمن الحدود الطبيعية
    }

    return {
      type: CDSSAlertType.LAB_CRITICAL,
      severity,
      message,
      messageAr,
      context: {
        testCode: input.testCode,
        testName: rule.labTestName,
        value,
        unit: rule.unit,
        isPanic,
        action: rule.action,
      },
      requiresOverride: isPanic,
    };
  }

  // ======================== 5. Critical Vital Signs ========================

  /**
   * فحص العلامات الحيوية الحرجة
   */
  async checkVitalCriticalValue(
    input: VitalValueCheck,
  ): Promise<CDSSAlertResult | null> {
    const rule = await this.prisma.vitalCriticalValue.findFirst({
      where: {
        vitalType: input.vitalType,
        isActive: true,
      },
    });

    if (!rule) return null;

    const value = input.value;
    let severity: CDSSAlertSeverity = CDSSAlertSeverity.INFO;
    let message = '';
    let messageAr = '';

    if (rule.criticalLow && value < Number(rule.criticalLow)) {
      severity = CDSSAlertSeverity.CRITICAL;
      message = `Critical LOW ${rule.vitalName}: ${value} ${rule.unit}`;
      messageAr = `${rule.vitalName} منخفض بشكل حرج: ${value} ${rule.unit}`;
    } else if (rule.criticalHigh && value > Number(rule.criticalHigh)) {
      severity = CDSSAlertSeverity.CRITICAL;
      message = `Critical HIGH ${rule.vitalName}: ${value} ${rule.unit}`;
      messageAr = `${rule.vitalName} مرتفع بشكل حرج: ${value} ${rule.unit}`;
    } else {
      return null;
    }

    return {
      type: CDSSAlertType.VITAL_CRITICAL,
      severity,
      message,
      messageAr,
      context: {
        vitalType: input.vitalType,
        vitalName: rule.vitalName,
        value,
        unit: rule.unit,
        action: rule.action,
      },
      requiresOverride: true,
    };
  }

  // ======================== 6. Renal & Dose Range Checks ========================

  /**
   * حساب وظائف الكلى بناءً على معادلة Cockcroft-Gault
   */
  private calculateEGFR(
    creatinine: number,
    age: number,
    gender: Gender,
    weight: number = 70,
  ): number {
    let crCl = ((140 - age) * weight) / (72 * creatinine);
    if (gender === 'FEMALE') crCl *= 0.85;
    return Math.round(crCl * 10) / 10;
  }

  async checkRenalAdjustment(
    patientId: number,
    drugs: DrugCheckInput[],
  ): Promise<CDSSAlertResult[]> {
    const alerts: CDSSAlertResult[] = [];

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || !patient.dateOfBirth) return alerts;
    const age = new Date().getFullYear() - patient.dateOfBirth.getFullYear();
    const gender = patient.gender || 'MALE';

    // جلب أحدث فحص للكرياتينين
    const latestCrea = await this.prisma.labOrderResult.findFirst({
      where: {
        labOrder: { order: { encounter: { patientId } } },
        OR: [
          { parameterName: { contains: 'Creatinine', mode: 'insensitive' } },
          { parameter: { code: 'CREA' } },
        ],
      },
      orderBy: { labOrder: { resultDate: 'desc' } },
    });

    if (!latestCrea) return alerts;

    const creaValue = parseFloat(latestCrea.value);
    if (isNaN(creaValue) || creaValue === 0) return alerts;

    const egfr = this.calculateEGFR(creaValue, age, gender);

    for (const drug of drugs) {
      const name = drug.genericName.toLowerCase();
      const concept = await this.resolveDrugTerminology(drug);
      const atcCode =
        concept?.system === TerminologySystem.ATC
          ? concept.code.toUpperCase()
          : null;

      // ─── DB-Driven Renal Rules (KDIGO / FDA guidelines) ───
      // يبحث في قاعدة البيانات أولاً بالـ ATC prefix ثم بالاسم العام
      const renalRule = await this.prisma.renalDoseRequirement.findFirst({
        where: {
          isActive: true,
          OR: [
            ...(atcCode
              ? [{ atcPrefix: { not: null }, AND: [{ isActive: true }] }]
              : []),
            { drugGeneric: { equals: name, mode: 'insensitive' } },
          ],
        },
        orderBy: { renalClass: 'asc' }, // HIGH قبل MODERATE
      });

      // التحقق من ATC prefix يدوياً بعد الجلب (Prisma لا يدعم startsWith في OR مع حقل nullable بشكل مثالي)
      let matchedRule: import('@prisma/client').RenalDoseRequirement | null =
        null;
      if (renalRule) {
        if (
          renalRule.atcPrefix &&
          atcCode &&
          atcCode.startsWith(renalRule.atcPrefix)
        ) {
          matchedRule = renalRule;
        } else if (renalRule.drugGeneric) {
          matchedRule = renalRule;
        }
      }

      // ─── Fallback: hardcoded لأدوية معروفة (safety net) ───
      const hardcodedRenalDrugs = [
        {
          match: (n: string, c: string | null) =>
            c?.startsWith('J01') || c?.startsWith('J02'),
          class: 'HIGH',
        },
        {
          match: (n: string, c: string | null) => c?.startsWith('M01'),
          class: 'MODERATE',
        },
        {
          match: (n: string) =>
            [
              'vancomycin',
              'gentamicin',
              'tobramycin',
              'amikacin',
              'colistin',
              'cisplatin',
              'methotrexate',
              'ibuprofen',
              'naproxen',
            ].some((d) => n.includes(d)),
          class: 'HIGH',
        },
        {
          match: (n: string) =>
            ['metformin', 'digoxin', 'lithium', 'atenolol'].some((d) =>
              n.includes(d),
            ),
          class: 'MODERATE',
        },
      ];

      const requiresRenalReview = matchedRule
        ? egfr < matchedRule.minSafeEgfr
        : hardcodedRenalDrugs.some((r) => r.match(name, atcCode));

      if (requiresRenalReview && egfr < 60) {
        const actionText = matchedRule?.action ?? 'MONITOR';
        const actionAr = matchedRule?.actionAr ?? 'مراجعة الجرعة مطلوبة';
        const evidenceSource =
          matchedRule?.evidenceSource ?? 'Clinical Guidelines';

        alerts.push({
          type: CDSSAlertType.RENAL_DOSE_ADJUST,
          severity:
            egfr < 30 ? CDSSAlertSeverity.CRITICAL : CDSSAlertSeverity.HIGH,
          message: `Renal Adjustment Required: eGFR is ${egfr} mL/min/1.73m². Action: ${actionText} for ${drug.genericName}. Evidence: ${evidenceSource}`,
          messageAr: `تعديل الجرعة الكلوي مطلوب: وظائف الكلى eGFR = ${egfr}. ${actionAr} لدواء ${drug.genericName}. المصدر: ${evidenceSource}`,
          context: {
            egfr,
            drug: drug.genericName,
            latestCreatinine: creaValue,
            atcCode,
            action: actionText,
            evidenceSource,
          },
          requiresOverride: egfr < 30,
        });
      }
    }
    return alerts;
  }

  async checkDoseRange(drugs: DrugCheckInput[]): Promise<CDSSAlertResult[]> {
    const alerts: CDSSAlertResult[] = [];

    // Fetch dose rules for these drugs from DB
    const genericNames = drugs.map((d) => d.genericName.toLowerCase());

    const doseRules = await this.prisma.drugDoseRange.findMany({
      where: {
        drugName: { in: genericNames, mode: 'insensitive' },
      },
    });

    for (const drug of drugs) {
      if (!drug.dose) continue;

      const doseMatch = drug.dose.match(/(\d+(\.\d+)?)/);
      if (!doseMatch) continue;
      const numDose = parseFloat(doseMatch[0]);

      const rule = doseRules.find(
        (r) => r.drugName.toLowerCase() === drug.genericName.toLowerCase(),
      );

      if (rule) {
        if (rule.maxDoseValue && numDose > Number(rule.maxDoseValue)) {
          alerts.push({
            type: CDSSAlertType.DOSAGE_WARNING,
            severity: CDSSAlertSeverity.CRITICAL,
            message: `Dose exceeds maximum limit! ${numDose}mg given, Max is ${rule.maxDoseValue}mg per dose.`,
            messageAr: `الجرعة تتجاوز الحد الأقصى! الجرعة الموصوفة ${numDose} لدواء ${drug.genericName}. الحد الأقصى: ${rule.maxDoseValue}mg`,
            context: {
              drug: drug.genericName,
              inputDose: numDose,
              maxDose: Number(rule.maxDoseValue),
            },
            requiresOverride: true,
          });
        } else if (rule.minDoseValue && numDose < Number(rule.minDoseValue)) {
          alerts.push({
            type: CDSSAlertType.DOSAGE_WARNING,
            severity: CDSSAlertSeverity.MODERATE,
            message: `Dose is below minimum recommended limit! ${numDose}mg given, Min is ${rule.minDoseValue}mg per dose.`,
            messageAr: `الجرعة أقل من الحد الأدنى الموصى به! الجرعة الموصوفة ${numDose} لدواء ${drug.genericName}. الحد الأدنى: ${rule.minDoseValue}mg`,
            context: {
              drug: drug.genericName,
              inputDose: numDose,
              minDose: Number(rule.minDoseValue),
            },
            requiresOverride: false,
          });
        }
      }
    }
    return alerts;
  }

  // ======================== 7. Full Prescription Check ========================

  /**
   * فحص شامل للوصفة الطبية
   * يجمع كل أنواع الفحوصات في نتيجة واحدة
   */
  async checkPrescription(
    input: PrescriptionCheckInput,
  ): Promise<CDSSCheckResult> {
    const allAlerts: CDSSAlertResult[] = [];
    const genericNames = input.drugs.map((d) => d.genericName);

    // 1. فحص التفاعلات الدوائية
    const interactions = await this.checkDrugInteractions(genericNames);
    allAlerts.push(...interactions);

    // 2. فحص الحساسيات
    const allergies = await this.checkDrugAllergies(
      input.patientId,
      genericNames,
    );
    allAlerts.push(...allergies);

    // 3. فحص التكرار
    const duplicates = await this.checkDuplicateTherapy(
      input.patientId,
      genericNames,
      input.drugs,
    );
    allAlerts.push(...duplicates);

    // 4. الفحص الكلوي لملاءمة الجرعة
    const renalAlerts = await this.checkRenalAdjustment(
      input.patientId,
      input.drugs,
    );
    allAlerts.push(...renalAlerts);

    // 5. فحص نطاق الجرعات (Dose Range)
    const doseAlerts = await this.checkDoseRange(input.drugs);
    allAlerts.push(...doseAlerts);

    // تحديد إمكانية المتابعة
    const hasCritical = allAlerts.some(
      (a) => a.severity === CDSSAlertSeverity.CRITICAL,
    );
    const hasBlocker = allAlerts.some((a) => a.requiresOverride);

    return {
      passed: allAlerts.length === 0,
      alerts: allAlerts,
      canProceed: !hasCritical && !hasBlocker,
    };
  }

  // ======================== 7. Alert Management ========================

  /**
   * حفظ تنبيه في قاعدة البيانات
   */
  async saveAlert(
    hospitalId: number,
    patientId: number,
    alert: CDSSAlertResult,
    encounterId?: number,
    prescriptionId?: number,
  ) {
    return this.prisma.cDSSAlert.create({
      data: {
        hospitalId,
        patientId,
        encounterId,
        prescriptionId,
        alertType: alert.type,
        severity: alert.severity,
        message: alert.message,
        messageAr: alert.messageAr,
        context: alert.context as any,
        status: CDSSAlertStatus.ACTIVE,
      },
    });
  }

  /**
   * جلب تنبيهات المريض النشطة
   */
  async getPatientActiveAlerts(hospitalId: number, patientId: number) {
    return this.prisma.cDSSAlert.findMany({
      where: {
        hospitalId,
        patientId,
        status: CDSSAlertStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * الاعتراف بالتنبيه
   */
  async acknowledgeAlert(alertId: number, userId: number) {
    return this.prisma.cDSSAlert.update({
      where: { id: alertId },
      data: {
        status: CDSSAlertStatus.ACKNOWLEDGED,
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
      },
    });
  }

  /**
   * تجاوز التنبيه مع سبب
   */
  async overrideAlert(alertId: number, userId: number, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new Error('يجب تقديم سبب واضح للتجاوز (10 أحرف على الأقل)');
    }

    const updatedAlert = await this.prisma.cDSSAlert.update({
      where: { id: alertId },
      data: {
        status: CDSSAlertStatus.OVERRIDDEN,
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
        overrideReason: reason,
      },
    });

    if (
      updatedAlert.severity === CDSSAlertSeverity.CRITICAL ||
      updatedAlert.severity === CDSSAlertSeverity.HIGH
    ) {
      this.eventEmitter.emit('clinical.variance.cdss', {
        hospitalId: updatedAlert.hospitalId,
        patientId: updatedAlert.patientId,
        alertId: updatedAlert.id,
        alertType: updatedAlert.alertType,
        severity: updatedAlert.severity,
        acknowledgedById: userId,
        overrideReason: reason,
      });
    }

    return updatedAlert;
  }

  // ======================== 8. Integration Methods ========================

  /**
   * جلب الأدوية الحالية الفعالة للمريض
   * تُستخدم للتحقق من التفاعلات مع أدوية جديدة
   */
  async getPatientCurrentMedications(hospitalId: number, patientId: number) {
    // جلب الوصفات النشطة للمريض
    const activePrescriptions = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        patientId,
        status: 'ACTIVE',
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                genericName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // تحويل إلى قائمة أدوية مميزة
    const medications = activePrescriptions.flatMap((rx) =>
      rx.items.map((item) => ({
        prescriptionId: rx.id,
        productId: item.product.id,
        name: item.product.name,
        genericName: item.product.genericName,
        dose: item.dose,
        frequency: item.frequency,
        route: item.route,
        startDate: rx.createdAt,
      })),
    );

    return {
      count: medications.length,
      medications,
    };
  }

  /**
   * جلب السياق السريري الكامل للمريض
   * يشمل: الأدوية الحالية، الحساسيات، آخر العلامات الحيوية، آخر نتائج المختبر
   */
  async getPatientClinicalContext(hospitalId: number, patientId: number) {
    // 1. بيانات المريض الأساسية والحساسيات
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        allergies: true,
      },
    });

    if (!patient) {
      throw new Error('المريض غير موجود');
    }

    // 2. آخر زيارة نشطة
    const activeEncounter = await this.prisma.encounter.findFirst({
      where: {
        hospitalId,
        patientId,
        status: 'OPEN',
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. الأدوية الحالية
    const medications = await this.getPatientCurrentMedications(
      hospitalId,
      patientId,
    );

    // 4. آخر العلامات الحيوية
    let latestVitals: {
      temperature: any;
      bpSystolic: number | null;
      bpDiastolic: number | null;
      pulse: number | null;
      respRate: number | null;
      o2Sat: number | null;
      createdAt: Date;
    } | null = null;
    if (activeEncounter) {
      const vitals = await this.prisma.vitalSign.findFirst({
        where: { encounterId: activeEncounter.id },
        orderBy: { createdAt: 'desc' },
      });
      if (vitals) {
        latestVitals = vitals;
      }
    }

    // 5. آخر نتائج المختبر (آخر 10)
    const recentLabResults = await this.prisma.labOrder.findMany({
      where: {
        order: {
          encounter: {
            patientId,
            hospitalId,
          },
        },
        resultStatus: 'COMPLETED',
      },
      include: {
        test: {
          select: { code: true, name: true },
        },
      },
      orderBy: { resultDate: 'desc' },
      take: 10,
    });

    // 6. التنبيهات النشطة
    const activeAlerts = await this.getPatientActiveAlerts(
      hospitalId,
      patientId,
    );

    return {
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
      },
      allergies: patient.allergies.map((a) => ({
        allergen: a.allergen,
        severity: a.severity,
        reaction: a.reaction,
      })),
      activeEncounter: activeEncounter
        ? {
            id: activeEncounter.id,
            type: activeEncounter.type,
            status: activeEncounter.status,
            startDate: activeEncounter.createdAt,
          }
        : null,
      currentMedications: medications.medications,
      latestVitals: latestVitals
        ? {
            temperature: latestVitals.temperature,
            bpSystolic: latestVitals.bpSystolic,
            bpDiastolic: latestVitals.bpDiastolic,
            pulse: latestVitals.pulse,
            respRate: latestVitals.respRate,
            o2Sat: latestVitals.o2Sat,
            recordedAt: latestVitals.createdAt,
          }
        : null,
      recentLabResults: recentLabResults.map((lab) => ({
        testCode: lab.test.code,
        testName: lab.test.name,
        resultValue: lab.resultValue,
        resultUnit: lab.resultUnit,
        referenceRange: lab.referenceRange,
        resultDate: lab.resultDate,
      })),
      activeAlerts: activeAlerts.length,
    };
  }

  /**
   * فحص نتيجة مختبرية وإنشاء تنبيه إذا كانت حرجة
   */
  async checkLabResultAndAlert(input: {
    hospitalId: number;
    patientId: number;
    encounterId?: number;
    testCode: string;
    value: number;
    unit: string;
    patientAge?: number;
    gender?: Gender;
  }): Promise<{ alert: CDSSAlertResult | null; saved: boolean }> {
    const alert = await this.checkLabCriticalValue({
      testCode: input.testCode,
      value: input.value,
      unit: input.unit,
      patientId: input.patientId,
      patientAge: input.patientAge,
      gender: input.gender,
    });

    if (alert) {
      // حفظ التنبيه في قاعدة البيانات
      await this.saveAlert(
        input.hospitalId,
        input.patientId,
        alert,
        input.encounterId,
      );

      this.logger.warn(
        `Lab Critical Alert: ${input.testCode} = ${input.value} for patient ${input.patientId}`,
      );

      return { alert, saved: true };
    }

    return { alert: null, saved: false };
  }

  /**
   * فحص العلامات الحيوية وإنشاء تنبيهات إذا كانت حرجة
   */
  async checkVitalsAndAlert(input: {
    hospitalId: number;
    patientId: number;
    encounterId: number;
    temperature?: number;
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    respRate?: number;
    o2Sat?: number;
  }): Promise<{ alerts: CDSSAlertResult[]; savedCount: number }> {
    const alerts: CDSSAlertResult[] = [];
    let savedCount = 0;

    // خريطة العلامات الحيوية وأنواعها
    const vitalChecks: { type: string; value: number | undefined }[] = [
      { type: 'TEMP', value: input.temperature },
      { type: 'BP_SYS', value: input.bpSystolic },
      { type: 'BP_DIA', value: input.bpDiastolic },
      { type: 'HR', value: input.pulse },
      { type: 'RR', value: input.respRate },
      { type: 'SPO2', value: input.o2Sat },
    ];

    for (const check of vitalChecks) {
      if (check.value !== undefined && check.value !== null) {
        const alert = await this.checkVitalCriticalValue({
          vitalType: check.type,
          value: check.value,
          patientId: input.patientId,
        });

        if (alert) {
          alerts.push(alert);

          // حفظ التنبيه
          await this.saveAlert(
            input.hospitalId,
            input.patientId,
            alert,
            input.encounterId,
          );
          savedCount++;

          this.logger.warn(
            `Vital Critical Alert: ${check.type} = ${check.value} for patient ${input.patientId}`,
          );
        }
      }
    }

    return { alerts, savedCount };
  }

  // ======================== Helpers ========================

  private mapInteractionSeverity(
    severity: DrugInteractionSeverity,
  ): CDSSAlertSeverity {
    switch (severity) {
      case DrugInteractionSeverity.CONTRAINDICATED:
        return CDSSAlertSeverity.CRITICAL;
      case DrugInteractionSeverity.SEVERE:
        return CDSSAlertSeverity.HIGH;
      case DrugInteractionSeverity.MODERATE:
        return CDSSAlertSeverity.MODERATE;
      case DrugInteractionSeverity.MILD:
      default:
        return CDSSAlertSeverity.LOW;
    }
  }

  private mapAllergySeverity(severity: string): CDSSAlertSeverity {
    switch (severity.toUpperCase()) {
      case 'SEVERE':
        return CDSSAlertSeverity.CRITICAL;
      case 'MODERATE':
        return CDSSAlertSeverity.HIGH;
      case 'MILD':
      default:
        return CDSSAlertSeverity.MODERATE;
    }
  }

  private async resolveDrugTerminology(drug: DrugCheckInput) {
    if (drug.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: drug.productId },
        select: {
          rxNormCode: true,
          terminologyConcept: {
            select: { id: true, system: true, code: true, display: true },
          },
        },
      });

      if (product?.terminologyConcept) {
        return product.terminologyConcept;
      }

      if (product?.rxNormCode) {
        const byRxNorm = await this.prisma.terminologyConcept.findFirst({
          where: {
            isActive: true,
            system: TerminologySystem.RXNORM,
            code: product.rxNormCode,
          },
          select: { id: true, system: true, code: true, display: true },
        });
        if (byRxNorm) return byRxNorm;
      }
    }

    if (!drug.genericName?.trim()) return null;
    const atcCandidates = await this.terminologyService.searchConcepts(
      TerminologySystem.ATC,
      drug.genericName.trim(),
      10,
    );
    const exactAtc = atcCandidates.find(
      (entry) =>
        entry.display.toLowerCase() === drug.genericName.trim().toLowerCase(),
    );
    if (exactAtc) return exactAtc;

    const rxNormCandidates = await this.terminologyService.searchConcepts(
      TerminologySystem.RXNORM,
      drug.genericName.trim(),
      10,
    );
    return (
      rxNormCandidates.find(
        (entry) =>
          entry.display.toLowerCase() === drug.genericName.trim().toLowerCase(),
      ) ?? null
    );
  }

  // ======================== Knowledge Base Search ========================

  /**
   * البحث في قاعدة بيانات التفاعلات الدوائية
   */
  async searchDrugInteractions(drugName: string, limit: number = 20) {
    const normalized = drugName.toLowerCase().trim();

    return this.prisma.drugInteraction.findMany({
      where: {
        isActive: true,
        OR: [
          { drugAGeneric: { contains: normalized, mode: 'insensitive' } },
          { drugBGeneric: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        drugAGeneric: true,
        drugBGeneric: true,
        severity: true,
        description: true,
        descriptionAr: true,
        recommendation: true,
        source: true,
      },
      orderBy: { severity: 'asc' }, // CONTRAINDICATED أولاً
      take: limit,
    });
  }

  // ======================== Renal Function Assessment ========================

  /**
   * حساب eGFR لمريض بناءً على آخر قيمة كرياتينين
   * يرجع تقييم شامل للوظائف الكلوية مع تصنيف CKD (KDIGO)
   */
  async computePatientEGFR(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || !patient.dateOfBirth) {
      return {
        available: false,
        reason: 'بيانات المريض أو تاريخ الميلاد غير متوفرة',
      };
    }

    const age = Math.floor(
      (Date.now() - patient.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    const gender = patient.gender || 'MALE';

    // جلب أحدث فحص كرياتينين
    const latestCrea = await this.prisma.labOrderResult.findFirst({
      where: {
        labOrder: { order: { encounter: { patientId, hospitalId } } },
        OR: [
          { parameterName: { contains: 'Creatinine', mode: 'insensitive' } },
          { parameter: { code: 'CREA' } },
        ],
      },
      orderBy: { labOrder: { resultDate: 'desc' } },
      include: {
        labOrder: { select: { resultDate: true } },
      },
    });

    if (!latestCrea) {
      return {
        available: false,
        reason: 'لم يتم العثور على نتائج كرياتينين للمريض',
      };
    }

    const creaValue = parseFloat(latestCrea.value);
    if (isNaN(creaValue) || creaValue === 0) {
      return {
        available: false,
        reason: 'قيمة الكرياتينين غير صالحة للحساب',
      };
    }

    const egfr = this.calculateEGFR(creaValue, age, gender);

    // تصنيف CKD حسب KDIGO
    let ckdStage: string;
    let ckdDescription: string;
    let ckdDescriptionAr: string;
    let riskLevel: 'NORMAL' | 'MILD' | 'MODERATE' | 'HIGH' | 'CRITICAL';

    if (egfr >= 90) {
      ckdStage = 'G1';
      ckdDescription = 'Normal or high kidney function';
      ckdDescriptionAr = 'وظائف كلوية طبيعية أو مرتفعة';
      riskLevel = 'NORMAL';
    } else if (egfr >= 60) {
      ckdStage = 'G2';
      ckdDescription = 'Mildly decreased kidney function';
      ckdDescriptionAr = 'انخفاض طفيف في وظائف الكلى';
      riskLevel = 'MILD';
    } else if (egfr >= 45) {
      ckdStage = 'G3a';
      ckdDescription = 'Mildly to moderately decreased';
      ckdDescriptionAr = 'انخفاض متوسط في وظائف الكلى';
      riskLevel = 'MODERATE';
    } else if (egfr >= 30) {
      ckdStage = 'G3b';
      ckdDescription = 'Moderately to severely decreased';
      ckdDescriptionAr = 'انخفاض متوسط إلى شديد في وظائف الكلى';
      riskLevel = 'HIGH';
    } else if (egfr >= 15) {
      ckdStage = 'G4';
      ckdDescription = 'Severely decreased kidney function';
      ckdDescriptionAr = 'انخفاض شديد في وظائف الكلى';
      riskLevel = 'HIGH';
    } else {
      ckdStage = 'G5';
      ckdDescription = 'Kidney failure — dialysis consideration';
      ckdDescriptionAr = 'فشل كلوي — يتطلب تقييم غسيل كلوي';
      riskLevel = 'CRITICAL';
    }

    return {
      available: true,
      patientId,
      age,
      gender,
      creatinine: {
        value: creaValue,
        unit: 'mg/dL',
        date: latestCrea.labOrder?.resultDate,
      },
      egfr: {
        value: egfr,
        unit: 'mL/min/1.73m²',
        method: 'Cockcroft-Gault',
      },
      ckd: {
        stage: ckdStage,
        description: ckdDescription,
        descriptionAr: ckdDescriptionAr,
        riskLevel,
      },
      recommendations:
        egfr < 60
          ? [
              'مراجعة جرعات الأدوية المطروحة كلوياً',
              'تجنب مضادات الالتهاب غير الستيرويدية (NSAIDs)',
              'مراقبة مستوى البوتاسيوم والفوسفات',
            ]
          : [],
    };
  }
}

