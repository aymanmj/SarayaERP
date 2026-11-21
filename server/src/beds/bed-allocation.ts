import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BedStatus, Prisma } from '@prisma/client';
import { captureRoomRate } from '../admission/room-rate-snapshot';

export const ACTIVE_ADMISSIONS = [
  'ADMITTED',
  'IN_PROGRESS',
  'DISCHARGE_PENDING',
] as const;
export const ACTIVE_BED_TRANSFERS = ['REQUESTED', 'APPROVED'];
export const ACTIVE_TRANSFER_ORDERS = [
  'REQUESTED',
  'BED_ALLOCATED',
  'HANDOVER_DRAFTED',
  'HANDOVER_SIGNED',
] as const;

/** All clinical bed writers lock patient -> encounter -> admission/transfer. */
export async function lockBedEncounter(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  requireOpen = true,
) {
  const identity = await tx.encounter.findFirst({
    where: { id: encounterId, hospitalId, isDeleted: false },
  });
  if (!identity)
    throw new NotFoundException('الحالة غير موجودة في هذه المنشأة');
  await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${identity.patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Encounter" WHERE "id" = ${encounterId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  const encounter = await tx.encounter.findFirst({
    where: { id: encounterId, hospitalId, isDeleted: false },
  });
  if (!encounter || encounter.patientId !== identity.patientId)
    throw new BadRequestException('تغير مرجع الحالة أثناء العملية');
  if (
    requireOpen &&
    (encounter.status === 'CLOSED' || encounter.status === 'CANCELLED')
  )
    throw new BadRequestException('الحالة مغلقة ولا تسمح بتعديل الحجز');
  if (requireOpen) {
    const admission = await tx.admission.findFirst({
      where: { hospitalId, encounterId },
    });
    if (
      admission &&
      !ACTIVE_ADMISSIONS.some((status) => status === admission.admissionStatus)
    )
      throw new BadRequestException('الدخول غير نشط ولا يسمح بتعديل الحجز');
  }
  return encounter;
}

export async function lockActiveAdmission(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  admissionId: number,
  requireActive = true,
) {
  const identity = await tx.admission.findFirst({
    where: { id: admissionId, hospitalId },
  });
  if (!identity) throw new NotFoundException('الدخول غير موجود في هذه المنشأة');
  const encounter = await lockBedEncounter(
    tx,
    hospitalId,
    identity.encounterId,
    requireActive,
  );
  await tx.$queryRaw`SELECT "id" FROM "admissions" WHERE "id" = ${admissionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  const admission = await tx.admission.findFirst({
    where: { id: admissionId, hospitalId },
  });
  if (
    !admission ||
    admission.encounterId !== encounter.id ||
    admission.patientId !== encounter.patientId
  )
    throw new BadRequestException('مرجع الدخول لا يطابق الحالة والمريض');
  if (
    requireActive &&
    !ACTIVE_ADMISSIONS.some((status) => status === admission.admissionStatus)
  )
    throw new BadRequestException('الدخول غير نشط ولا يسمح بتعديل الموقع');
  return { admission, encounter };
}

export async function assertNoPendingBedMovement(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  exclude: { bedTransferId?: number; transferOrderId?: number } = {},
) {
  const legacy = await tx.bedTransfer.count({
    where: {
      hospitalId,
      admission: { hospitalId, encounterId },
      status: { in: ACTIVE_BED_TRANSFERS },
      ...(exclude.bedTransferId ? { id: { not: exclude.bedTransferId } } : {}),
    },
  });
  const modern = await tx.transferOrder.count({
    where: {
      hospitalId,
      encounterId,
      status: { in: [...ACTIVE_TRANSFER_ORDERS] },
      ...(exclude.transferOrderId
        ? { id: { not: exclude.transferOrderId } }
        : {}),
    },
  });
  if (legacy || modern)
    throw new BadRequestException(
      'يوجد طلب نقل نشط. يجب استكماله أو إلغاؤه قبل تغيير الحجز',
    );
}

export async function bedLocation(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  bedId: number,
) {
  const bed = await tx.bed.findFirst({
    where: { id: bedId, hospitalId, isActive: true },
    include: { room: true, ward: true },
  });
  if (!bed) throw new NotFoundException('السرير غير موجود في هذه المنشأة');
  if (
    !bed.room.isActive ||
    !bed.ward.isActive ||
    bed.room.hospitalId !== hospitalId ||
    bed.ward.hospitalId !== hospitalId ||
    bed.room.wardId !== bed.wardId
  ) {
    throw new BadRequestException('موقع السرير غير متسق أو غير نشط');
  }
  return bed;
}

export async function assertNoActiveIcuSupport(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
) {
  const equipment = await tx.iCUEquipmentUsage.count({
    where: { hospitalId, encounterId, stoppedAt: null },
  });
  const drips = await tx.iCUMedicationDrip.count({
    where: { hospitalId, encounterId, stoppedAt: null },
  });
  if (equipment || drips)
    throw new BadRequestException(
      'توجد أجهزة عناية مركزة أو أدوية وريدية مستمرة؛ تجب مراجعة الفريق السريري واستكمال مسار النقل قبل تغيير السرير',
    );
}

/** Caller owns the patient/encounter locks and runs this inside its business transaction. */
export async function moveBed(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  toBedId: number,
  options: {
    expectedFromBedId?: number | null;
    targetStatus?: 'AVAILABLE' | 'BLOCKED';
    bedTransferId?: number;
    transferOrderId?: number;
  } = {},
) {
  await assertNoPendingBedMovement(tx, hospitalId, encounterId, options);
  await assertNoActiveIcuSupport(tx, hospitalId, encounterId);
  const encounter = await tx.encounter.findFirst({
    where: { id: encounterId, hospitalId, isDeleted: false },
  });
  if (
    !encounter ||
    encounter.status === 'CLOSED' ||
    encounter.status === 'CANCELLED'
  )
    throw new BadRequestException('الحالة مغلقة ولا تسمح بالنقل');
  const assignments = await tx.bedAssignment.findMany({
    where: { hospitalId, encounterId, to: null },
  });
  if (assignments.length > 1)
    throw new BadRequestException(
      'توجد حجوزات متعارضة لهذه الحالة؛ تجب مراجعتها',
    );
  const current = assignments[0];
  if (
    options.expectedFromBedId !== undefined &&
    (current?.bedId ?? null) !== options.expectedFromBedId
  )
    throw new BadRequestException('تغير سرير المصدر منذ طلب النقل');
  if (current?.bedId === toBedId)
    throw new BadRequestException('الحالة مرتبطة بسرير الوجهة بالفعل');
  const other = await tx.bedAssignment.count({
    where: {
      hospitalId,
      to: null,
      encounterId: { not: encounterId },
      encounter: { patientId: encounter.patientId },
    },
  });
  if (other) throw new BadRequestException('المريض يشغل سريرًا في حالة أخرى');
  const bed = await bedLocation(tx, hospitalId, toBedId);
  const claimed = await tx.bed.updateMany({
    where: {
      id: bed.id,
      hospitalId,
      isActive: true,
      status: options.targetStatus ?? BedStatus.AVAILABLE,
      assignments: { none: { to: null } },
    },
    data: { status: BedStatus.OCCUPIED },
  });
  if (claimed.count !== 1)
    throw new BadRequestException('سرير الوجهة لم يعد متاحًا لهذا النقل');
  const at = new Date();
  const roomRateSnapshot = await captureRoomRate(
    tx,
    hospitalId,
    encounterId,
    bed.ward.serviceItemId,
    at,
  );
  if (current) {
    const conflict = await tx.bedAssignment.count({
      where: {
        hospitalId,
        bedId: current.bedId,
        to: null,
        encounterId: { not: encounterId },
      },
    });
    if (conflict)
      throw new BadRequestException('يوجد تعارض في حجز سرير المصدر');
    const released = await tx.bed.updateMany({
      where: { id: current.bedId, hospitalId, status: BedStatus.OCCUPIED },
      data: { status: BedStatus.CLEANING },
    });
    if (released.count !== 1)
      throw new BadRequestException('حالة سرير المصدر غير متسقة؛ تجب مراجعتها');
    await tx.bedAssignment.update({
      where: { id: current.id },
      data: { to: at },
    });
  }
  const assignment = await tx.bedAssignment.create({
    data: {
      hospitalId,
      encounterId,
      bedId: bed.id,
      from: at,
      roomRateSnapshot,
    },
  });
  await tx.admission.updateMany({
    where: {
      hospitalId,
      encounterId,
      admissionStatus: { in: [...ACTIVE_ADMISSIONS] },
    },
    data: {
      bedId: bed.id,
      roomId: bed.roomId,
      wardId: bed.wardId,
      departmentId: bed.ward.departmentId ?? undefined,
    },
  });
  if (bed.ward.departmentId)
    await tx.encounter.update({
      where: { id: encounterId, hospitalId },
      data: { departmentId: bed.ward.departmentId },
    });
  return { assignment, bed };
}
