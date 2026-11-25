import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdministrationStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import {
  medicationScheduleDate,
  medicationScheduleZone,
  medicationSlots,
} from './medication-schedule';
import { evaluateFiveRights } from './five-rights.util';
export type AdministrationInput = {
  hospitalId: number;
  userId: number;
  ipAddress?: string;
  clientName?: string;
  encounterId: number;
  prescriptionItemId: number;
  requestId: string;
  scheduledSlot?: string;
  status: AdministrationStatus;
  notes?: string;
  patientBarcode?: string;
  drugBarcode?: string;
  confirmedDose?: string;
  confirmedRoute?: string;
  isEmergencyOverride?: boolean;
  varianceReason?: string;
};
export async function medicationContext(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  itemId: number,
) {
  const identity = await tx.encounter.findFirst({
    where: { id: encounterId, hospitalId, isDeleted: false },
    select: { patientId: true },
  });
  if (!identity) throw new NotFoundException('الحالة غير موجودة ضمن المنشأة');
  const patient = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Patient" WHERE id=${identity.patientId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  if (patient.length !== 1)
    throw new BadRequestException('مراجع المريض غير متسقة');
  // Guard encounter state changes and allow inserts that only reference its key.
  await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${encounterId} AND "hospitalId"=${hospitalId} FOR NO KEY UPDATE`;
  const prescription = await tx.$queryRaw<
    { id: number }[]
  >`SELECT p.id FROM "Prescription" p JOIN "PrescriptionItem" i ON i."prescriptionId"=p.id WHERE i.id=${itemId} AND p."hospitalId"=${hospitalId} AND p."encounterId"=${encounterId} FOR UPDATE OF p`;
  if (prescription.length !== 1)
    throw new NotFoundException('البند لا يخص الحالة والمنشأة');
  await tx.$queryRaw`SELECT id FROM "PrescriptionItem" WHERE id=${itemId} FOR UPDATE`;
  await tx.$queryRaw`SELECT p.id FROM "Product" p JOIN "PrescriptionItem" i ON i."productId"=p.id WHERE i.id=${itemId} AND p."hospitalId"=${hospitalId} FOR SHARE OF p`;
  const encounter = await tx.encounter.findFirstOrThrow({
    where: { id: encounterId, hospitalId },
    select: {
      patientId: true,
      status: true,
      isDeleted: true,
      patient: {
        select: {
          mrn: true,
          fullName: true,
          isActive: true,
          isDeleted: true,
        },
      },
    },
  });
  const item = await tx.prescriptionItem.findUniqueOrThrow({
    where: { id: itemId },
    select: {
      dose: true,
      route: true,
      frequency: true,
      prescription: {
        select: {
          hospitalId: true,
          encounterId: true,
          patientId: true,
          status: true,
          createdAt: true,
          pharmacistVerificationStatus: true,
        },
      },
      product: {
        select: {
          hospitalId: true,
          type: true,
          isActive: true,
          isDeleted: true,
          barcode: true,
          code: true,
          name: true,
        },
      },
    },
  });
  if (
    encounter.patientId !== identity.patientId ||
    encounter.status !== 'OPEN' ||
    encounter.isDeleted ||
    !encounter.patient.isActive ||
    encounter.patient.isDeleted ||
    item.prescription.hospitalId !== hospitalId ||
    item.prescription.encounterId !== encounterId ||
    item.prescription.patientId !== encounter.patientId ||
    item.prescription.status !== 'ACTIVE' ||
    item.product.hospitalId !== hospitalId ||
    item.product.type !== 'DRUG' ||
    !item.product.isActive ||
    item.product.isDeleted
  )
    throw new BadRequestException(
      'الحالة أو الوصفة أو المريض أو الدواء غير متاح للإعطاء',
    );
  return { encounter, item };
}
export function barcodeVerification(
  context: Awaited<ReturnType<typeof medicationContext>>,
  patientBarcode: string,
  drugBarcode: string,
  options?: {
    confirmedDose?: string;
    confirmedRoute?: string;
    scheduledFor?: Date | null;
    administeredAt?: Date;
  },
) {
  const { encounter, item } = context;
  const isPatientMatch = [
    encounter.patient.mrn,
    String(encounter.patientId),
  ].includes(patientBarcode.trim());
  const isDrugMatch = [item.product.barcode, item.product.code]
    .filter(Boolean)
    .includes(drugBarcode.trim());
  const fiveRights = evaluateFiveRights({
    isPatientMatch,
    isDrugMatch,
    expectedDose: item.dose,
    expectedRoute: item.route,
    confirmedDose: options?.confirmedDose,
    confirmedRoute: options?.confirmedRoute,
    scheduledFor: options?.scheduledFor ?? null,
    administeredAt: options?.administeredAt,
    pharmacistVerified:
      item.prescription.pharmacistVerificationStatus === 'VERIFIED',
  });
  return {
    ...fiveRights,
    pharmacistVerificationStatus:
      item.prescription.pharmacistVerificationStatus,
    expectedPatientBarcode: encounter.patient.mrn,
    expectedDrugBarcode: item.product.barcode ?? item.product.code,
    patientName: encounter.patient.fullName,
    drugName: item.product.name,
    dose: item.dose,
    route: item.route,
    frequency: item.frequency,
  };
}
export async function administer(
  tx: Prisma.TransactionClient,
  input: AdministrationInput,
) {
  const {
    hospitalId,
    userId,
    encounterId,
    prescriptionItemId,
    status,
    requestId,
    scheduledSlot,
  } = input;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId ?? '',
    )
  )
    throw new BadRequestException('يلزم معرف UUID للإجراء');
  if (!Object.values(AdministrationStatus).includes(status))
    throw new BadRequestException('حالة الإجراء غير صالحة');
  const requestKey = `medication:${hospitalId}:${requestId.toLowerCase()}`;
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        hospitalId,
        userId,
        encounterId,
        prescriptionItemId,
        status,
        requestId: requestId.toLowerCase(),
        notes: input.notes?.trim() ?? '',
        patientBarcode: input.patientBarcode?.trim() ?? null,
        drugBarcode: input.drugBarcode?.trim() ?? null,
        varianceReason: input.varianceReason?.trim() ?? null,
        isEmergencyOverride: input.isEmergencyOverride ?? false,
        ...(scheduledSlot !== undefined ? { scheduledSlot } : {}),
        ...(input.confirmedDose !== undefined
          ? { confirmedDose: input.confirmedDose.trim() }
          : {}),
        ...(input.confirmedRoute !== undefined
          ? { confirmedRoute: input.confirmedRoute.trim() }
          : {}),
      }),
    )
    .digest('hex');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27009, ${hospitalId}::integer)`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} AND "hospitalId"=${hospitalId} FOR SHARE`;
  const actor = await tx.user.findFirst({
    where: { id: userId, hospitalId, isActive: true, isDeleted: false },
    include: {
      userRoles: {
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  if (!actor) throw new NotFoundException('المستخدم غير نشط ضمن المنشأة');
  const roles = actor.userRoles.map((r) => r.role.name);
  const permissions = new Set(
    actor.userRoles.flatMap((r) =>
      r.role.rolePermissions.map((p) => p.permission.code),
    ),
  );
  const can = (permission: string) =>
    roles.includes('ADMIN') ||
    permissions.has('ADMIN_FULL_ACCESS') ||
    permissions.has(permission);
  if (!can('nursing:medications:administer'))
    throw new ForbiddenException('يلزم تفويض تنفيذ إعطاء الدواء');
  if (input.isEmergencyOverride && !can('nursing:medications:override'))
    throw new ForbiddenException('يلزم تفويض التجاوز الدوائي');
  const replay = await tx.medicationAdministration.findUnique({
    where: { requestKey },
  });
  if (replay) {
    if (replay.requestFingerprint !== hash)
      throw new ConflictException('معرف الإجراء مستخدم لحمولة مختلفة');
    return { record: replay, audit: null };
  }
  const context = await medicationContext(
    tx,
    hospitalId,
    encounterId,
    prescriptionItemId,
  );
  let scheduledFor: Date | undefined;
  if (scheduledSlot !== undefined) {
    if (
      typeof scheduledSlot !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledSlot)
    )
      throw new BadRequestException('هوية الجرعة المجدولة غير صالحة');
    const timezone = await medicationScheduleZone(tx, hospitalId);
    const dateKey = medicationScheduleDate(
      scheduledSlot.slice(0, 10),
      timezone,
    );
    const slot = medicationSlots(
      context.item.frequency,
      dateKey,
      timezone,
    ).find((candidate) => candidate.scheduledSlot === scheduledSlot);
    if (
      !slot ||
      dateKey <
        medicationScheduleDate(context.item.prescription.createdAt, timezone) ||
      dateKey > medicationScheduleDate(new Date(), timezone)
    )
      throw new BadRequestException('الموعد لا يخص جدول الوصفة الساري');
    const recorded = await tx.medicationAdministration.findFirst({
      where: {
        hospitalId,
        encounterId,
        prescriptionItemId,
        scheduledSlot,
        ...(status !== 'HELD' ? { status: { not: 'HELD' } } : {}),
      },
      select: { id: true },
    });
    if (recorded)
      throw new ConflictException(
        'سُجّل إجراء لهذه الجرعة المجدولة؛راجع سجل الدواء',
      );
    scheduledFor = slot.scheduledTime;
  }
  const barcode =
    input.patientBarcode !== undefined && input.drugBarcode !== undefined;
  const verified = barcode
    ? barcodeVerification(context, input.patientBarcode!, input.drugBarcode!, {
        confirmedDose: input.confirmedDose,
        confirmedRoute: input.confirmedRoute,
        scheduledFor: scheduledFor ?? null,
      })
    : null;
  const fiveRightsMismatch =
    verified !== null &&
    (verified.isDoseMatch === false ||
      verified.isRouteMatch === false ||
      (verified.verificationScope === 'FULL_FIVE_RIGHTS' &&
        verified.isTimeWindowMatch === false));
  const requiresOverride =
    status === 'GIVEN' &&
    ((barcode && (!verified?.isBarcodeMatch || fiveRightsMismatch)) ||
      context.item.prescription.pharmacistVerificationStatus !== 'VERIFIED');
  if (requiresOverride && !input.isEmergencyOverride)
    throw new BadRequestException(
      fiveRightsMismatch
        ? `تعارض في التحقق الخماسي للحقوق (${verified?.mismatchReasons.join(', ')})؛ يلزم مراجعة الجرعة/الطريق/الموعد أو تفعيل تجاوز طارئ معتمد`
        : 'الباركود غير مطابق أو اعتماد الصيدلي غير مكتمل؛يلزم إجراء استثنائي معتمد',
    );
  if (
    input.isEmergencyOverride &&
    (!input.varianceReason ||
      input.varianceReason.trim().length < 10 ||
      input.varianceReason.length > 500)
  )
    throw new BadRequestException('يلزم سبب تجاوز واضح من10 إلى500 حرف');
  if (status !== 'GIVEN' && !input.notes?.trim())
    throw new BadRequestException('يلزم توثيق سبب عدم الإعطاء');
  if (
    status === 'GIVEN' &&
    (await tx.medicationAdministration.findFirst({
      where: {
        hospitalId,
        encounterId,
        prescriptionItemId,
        status: 'GIVEN',
        ...(scheduledSlot !== undefined ? { scheduledSlot: null } : {}),
        administeredAt: { gte: new Date(Date.now() - 60000) },
      },
    }))
  )
    throw new ConflictException(
      'إعطاء قريب مسجل؛راجع الجرعة قبل تسجيل إعطاء آخر',
    );
  const record = await tx.medicationAdministration.create({
    data: {
      hospitalId,
      encounterId,
      prescriptionItemId,
      performerId: userId,
      status,
      notes: input.notes?.trim(),
      requestKey,
      scheduledSlot,
      scheduledFor,
      requestFingerprint: hash,
      scannedPatientBarcode: input.patientBarcode?.trim(),
      scannedDrugBarcode: input.drugBarcode?.trim(),
      verificationScope: barcode
        ? (verified?.verificationScope ?? 'PATIENT_AND_DRUG')
        : 'MANUAL',
      verifiedDose: input.confirmedDose?.trim() || null,
      verifiedRoute: input.confirmedRoute?.trim() || null,
      timeVarianceMinutes: verified?.timeVarianceMinutes ?? null,
      isBarcodeMatch: verified?.isBarcodeMatch ?? false,
      isVerified5Rights: verified?.isVerified5Rights ?? false,
      isEmergencyOverride: input.isEmergencyOverride ?? false,
      varianceReason: input.isEmergencyOverride
        ? input.varianceReason?.trim()
        : null,
    },
  });
  const audit = await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    ipAddress: input.ipAddress,
    clientName: input.clientName,
    action: barcode
      ? 'CLMA_MEDICATION_ADMINISTERED'
      : 'EMAR_MEDICATION_ADMINISTERED',
    entity: 'MedicationAdministration',
    entityId: record.id,
    details: {
      encounterId,
      prescriptionItemId,
      status,
      scheduledSlot,
      scheduledFor,
      isBarcodeMatch: record.isBarcodeMatch,
      verificationScope: record.verificationScope,
      verifiedDose: record.verifiedDose,
      verifiedRoute: record.verifiedRoute,
      timeVarianceMinutes: record.timeVarianceMinutes,
      isVerified5Rights: record.isVerified5Rights,
      isEmergencyOverride: record.isEmergencyOverride,
      varianceReason: record.varianceReason,
      notes: record.notes,
      requestKey,
    },
  });
  return { record, audit };
}
