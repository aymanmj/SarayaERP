import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { bedLocation } from '../beds/bed-allocation';

type References = {
  admittingDoctorId?: number;
  primaryPhysicianId?: number;
  referringDoctorId?: number;
  attendingNurseId?: number;
  departmentId?: number;
  bedId?: number;
  roomId?: number;
  wardId?: number;
};

export async function validateAdmissionReferences(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  data: References,
) {
  const keys: (keyof References)[] = [
    'admittingDoctorId',
    'primaryPhysicianId',
    'referringDoctorId',
    'attendingNurseId',
    'departmentId',
    'bedId',
    'roomId',
    'wardId',
  ];
  for (const key of keys) {
    const id = data[key];
    if (id === undefined) continue;
    if (
      id === null &&
      (key === 'referringDoctorId' || key === 'attendingNurseId')
    )
      continue;
    if (!Number.isInteger(id) || Number(id) <= 0)
      throw new BadRequestException('مرجع غير صالح ضمن بيانات الدخول');
  }
  const staff = [
    ...new Set(
      [
        data.admittingDoctorId,
        data.primaryPhysicianId,
        data.referringDoctorId,
        data.attendingNurseId,
      ].filter((id): id is number => typeof id === 'number'),
    ),
  ];
  if (staff.length) {
    const users = await tx.user.count({
      where: {
        id: { in: staff },
        hospitalId,
        isActive: true,
        isDeleted: false,
      },
    });
    if (users !== staff.length)
      throw new NotFoundException(
        'أحد أفراد الفريق غير نشط أو غير موجود في هذه المنشأة',
      );
  }
  if (
    data.departmentId !== undefined &&
    !(await tx.department.findFirst({
      where: { id: data.departmentId, hospitalId, isActive: true },
    }))
  ) {
    throw new NotFoundException('القسم غير موجود أو غير نشط في هذه المنشأة');
  }
  const bed =
    data.bedId !== undefined
      ? await bedLocation(tx, hospitalId, data.bedId)
      : null;
  if (bed) {
    if (
      (data.roomId !== undefined && data.roomId !== bed.roomId) ||
      (data.wardId !== undefined && data.wardId !== bed.wardId) ||
      (data.departmentId !== undefined &&
        bed.ward.departmentId !== null &&
        data.departmentId !== bed.ward.departmentId)
    ) {
      throw new BadRequestException(
        'الغرفة أو العنبر أو القسم لا يطابق موقع السرير',
      );
    }
    return { bed, roomId: bed.roomId, wardId: bed.wardId };
  }
  const room =
    data.roomId !== undefined
      ? await tx.room.findFirst({
          where: { id: data.roomId, hospitalId, isActive: true },
          include: { ward: true },
        })
      : null;
  if (data.roomId !== undefined && !room)
    throw new NotFoundException('الغرفة غير موجودة في هذه المنشأة');
  if (
    room &&
    (room.ward.hospitalId !== hospitalId ||
      !room.ward.isActive ||
      (data.wardId !== undefined && data.wardId !== room.wardId))
  )
    throw new BadRequestException('مرجع الغرفة والعنبر غير متسق');
  const wardId = room?.wardId ?? data.wardId;
  if (
    wardId !== undefined &&
    !(await tx.ward.findFirst({
      where: { id: wardId, hospitalId, isActive: true },
    }))
  )
    throw new NotFoundException('العنبر غير موجود في هذه المنشأة');
  return { bed: null, roomId: room?.id, wardId };
}
