// server/src/attendance/biometric-attendance.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  AssignBiometricIdDto,
  ClassifyAbsenceDto,
  CreateBiometricDeviceDto,
  CreateHolidayDto,
  DecideAttendanceMovementDto,
  MarkAbsenceDto,
  RecordAttendanceMovementDto,
  UpdateBiometricDeviceDto,
} from './dto/biometric-attendance.dto';
import {
  hashDeviceSecret,
  isTrustedPrivateIp,
  normalizeClientIp,
  parseAdmsAttlogLines,
} from './biometric-adms.util';
import type { AdmsAuthenticatedDevice } from './adms-device.guard';

@Injectable()
export class BiometricAttendanceService {
  public static admsHeartbeats = new Map<
    string,
    { timestamp: Date; ip: string }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  // =========================================================================
  // 1. BIOMETRIC DEVICES REGISTRY (MULTI-TENANT + PRIVATE LAN GUARD)
  // =========================================================================

  async listDevices(hospitalId: number) {
    const devices = await this.prisma.biometricDevice.findMany({
      where: { hospitalId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        hospitalId: true,
        name: true,
        brand: true,
        model: true,
        serialNumber: true,
        ipAddress: true,
        port: true,
        connectionMode: true,
        location: true,
        isActive: true,
        lastSyncAt: true,
        lastSeenIp: true,
        lastError: true,
        createdAt: true,
      },
    });
    const now = Date.now();
    return devices.map((d) => {
      const hb = BiometricAttendanceService.admsHeartbeats.get(d.serialNumber);
      const latestMs = Math.max(
        d.lastSyncAt ? d.lastSyncAt.getTime() : 0,
        hb ? hb.timestamp.getTime() : 0,
      );
      return {
        ...d,
        isOnlineAdms: latestMs > 0 && now - latestMs < 180000,
        lastActivity: latestMs > 0 ? new Date(latestMs) : null,
      };
    });
  }

  async createDevice(
    hospitalId: number,
    createdById: number,
    dto: CreateBiometricDeviceDto,
  ) {
    const ip = normalizeClientIp(dto.ipAddress);
    if (!isTrustedPrivateIp(ip)) {
      throw new BadRequestException(
        'عنوان IP لجهاز البصمة يجب أن يكون ضمن الشبكة المحلية الخاصة أو Loopback أو Tailscale فقط.',
      );
    }
    const serialNumber = dto.serialNumber.trim().toUpperCase();
    if (!serialNumber) {
      throw new BadRequestException('الرقم التسلسلي للجهاز مطلوب.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const dup = await tx.biometricDevice.findUnique({
        where: { serialNumber },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          'الرقم التسلسلي مسجّل مسبقًا لجهاز بصمة آخر.',
        );
      }

      const dev = await tx.biometricDevice.create({
        data: {
          hospitalId,
          name: dto.name.trim(),
          brand: (dto.brand ?? 'ZKTECO').trim().toUpperCase(),
          model: dto.model?.trim() || null,
          serialNumber,
          ipAddress: ip,
          port: dto.port ?? 4370,
          connectionMode: dto.connectionMode ?? 'ADMS',
          location: dto.location?.trim() || null,
          deviceSecretHash: dto.deviceSecret
            ? hashDeviceSecret(dto.deviceSecret)
            : null,
          isActive: true,
          createdById,
        },
        select: {
          id: true,
          hospitalId: true,
          name: true,
          brand: true,
          model: true,
          serialNumber: true,
          ipAddress: true,
          port: true,
          connectionMode: true,
          location: true,
          isActive: true,
          createdAt: true,
        },
      });

      const auditFields = {
        hospitalId,
        userId: createdById,
        action: 'BIOMETRIC_DEVICE_REGISTERED',
        entity: 'BiometricDevice',
        entityId: dev.id,
        details: {
          serialNumber: dev.serialNumber,
          ipAddress: dev.ipAddress,
          connectionMode: dev.connectionMode,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return dev;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async updateDevice(
    hospitalId: number,
    deviceId: number,
    actorUserId: number,
    dto: UpdateBiometricDeviceDto,
  ) {
    let normalizedIp: string | undefined;
    if (dto.ipAddress !== undefined) {
      normalizedIp = normalizeClientIp(dto.ipAddress);
      if (!isTrustedPrivateIp(normalizedIp)) {
        throw new BadRequestException(
          'عنوان IP لجهاز البصمة يجب أن يكون ضمن الشبكة المحلية الخاصة فقط.',
        );
      }
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.biometricDevice.findFirst({
        where: { id: deviceId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('جهاز البصمة غير موجود في هذه المنشأة.');
      }

      const saved = await tx.biometricDevice.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(normalizedIp !== undefined ? { ipAddress: normalizedIp } : {}),
          ...(dto.port !== undefined ? { port: dto.port } : {}),
          ...(dto.connectionMode !== undefined
            ? { connectionMode: dto.connectionMode }
            : {}),
          ...(dto.location !== undefined
            ? { location: dto.location.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.deviceSecret !== undefined
            ? {
                deviceSecretHash: dto.deviceSecret.trim()
                  ? hashDeviceSecret(dto.deviceSecret)
                  : null,
              }
            : {}),
        },
        select: {
          id: true,
          hospitalId: true,
          name: true,
          serialNumber: true,
          ipAddress: true,
          port: true,
          connectionMode: true,
          location: true,
          isActive: true,
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'BIOMETRIC_DEVICE_UPDATED',
        entity: 'BiometricDevice',
        entityId: saved.id,
        details: { serialNumber: saved.serialNumber, isActive: saved.isActive },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async assignEmployeeBiometricId(
    hospitalId: number,
    targetUserId: number,
    actorUserId: number,
    dto: AssignBiometricIdDto,
  ) {
    const bioId = dto.biometricId.trim();
    if (!bioId) {
      throw new BadRequestException('رقم البصمة للموظف مطلوب.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const emp = await tx.user.findFirst({
        where: { id: targetUserId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!emp) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const conflict = await tx.user.findFirst({
        where: {
          hospitalId,
          biometricId: bioId,
          id: { not: targetUserId },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(
          'رقم البصمة هذا مرتبط بموظف آخر في نفس المنشأة.',
        );
      }

      const saved = await tx.user.update({
        where: { id: emp.id },
        data: { biometricId: bioId },
        select: { id: true, fullName: true, username: true, biometricId: true },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_BIOMETRIC_ID_ASSIGNED',
        entity: 'User',
        entityId: saved.id,
        details: { biometricId: bioId },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 2. ZKTECO ADMS CLOUD PUSH INGESTION (IDEMPOTENT + MULTI-TENANT)
  // =========================================================================

  async recordDeviceHeartbeat(
    deviceId: number,
    serialNumber: string,
    ip: string,
  ) {
    BiometricAttendanceService.admsHeartbeats.set(serialNumber, {
      timestamp: new Date(),
      ip,
    });
    await this.prisma.biometricDevice.update({
      where: { id: deviceId },
      data: { lastSyncAt: new Date(), lastSeenIp: ip, lastError: null },
    });
  }

  async ingestAdmsAttlog(
    device: AdmsAuthenticatedDevice,
    rawBody: string,
    source: 'ADMS' | 'DIRECT_TCP' | 'MANUAL' | 'CSV' = 'ADMS',
    tzOffsetHours = 2,
  ) {
    const parsed = parseAdmsAttlogLines(rawBody, tzOffsetHours);
    if (!parsed.length) {
      return {
        received: 0,
        inserted: 0,
        duplicatesSkipped: 0,
        mappedToAttendance: 0,
        unmappedBadges: [] as string[],
      };
    }

    // Sort chronologically so check-in precedes check-out
    parsed.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

    const uniqueBadges = [...new Set(parsed.map((p) => p.biometricId))];
    const matchedUsers = await this.prisma.user.findMany({
      where: {
        hospitalId: device.hospitalId,
        biometricId: { in: uniqueBadges },
        isDeleted: false,
      },
      select: { id: true, biometricId: true },
    });
    const badgeToUserId = new Map<string, number>();
    for (const u of matchedUsers) {
      if (u.biometricId) badgeToUserId.set(u.biometricId, u.id);
    }

    let inserted = 0;
    let duplicatesSkipped = 0;
    let mappedToAttendance = 0;
    const unmappedSet = new Set<string>();

    for (const p of parsed) {
      const userId = badgeToUserId.get(p.biometricId) ?? null;
      if (!userId) unmappedSet.add(p.biometricId);

      // Idempotent insert: duplicate (hospitalId, biometricId, punchTime) is ignored cleanly
      const existing = await this.prisma.biometricPunchLog.findUnique({
        where: {
          hospitalId_biometricId_punchTime: {
            hospitalId: device.hospitalId,
            biometricId: p.biometricId,
            punchTime: p.punchTime,
          },
        },
        select: { id: true },
      });
      if (existing) {
        duplicatesSkipped += 1;
        continue;
      }

      const createdLog = await this.prisma.biometricPunchLog.create({
        data: {
          hospitalId: device.hospitalId,
          deviceId: device.id,
          userId,
          biometricId: p.biometricId,
          punchTime: p.punchTime,
          punchType: p.punchType,
          verifyMode: p.verifyMode,
          source,
          rawLine: p.rawLine,
          processed: false,
        },
      });
      inserted += 1;

      if (userId) {
        await this.attendanceService.processPunch(
          { userId, timestamp: p.punchTime.toISOString() },
          device.hospitalId,
        );
        await this.prisma.biometricPunchLog.update({
          where: { id: createdLog.id },
          data: { processed: true },
        });
        mappedToAttendance += 1;
      }
    }

    await this.prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });

    return {
      received: parsed.length,
      inserted,
      duplicatesSkipped,
      mappedToAttendance,
      unmappedBadges: [...unmappedSet],
    };
  }

  async ingestDevicePunchesAuthenticated(
    hospitalId: number,
    deviceId: number,
    actorUserId: number,
    rawAttlog: string,
    tzOffsetHours = 2,
  ) {
    const dev = await this.prisma.biometricDevice.findFirst({
      where: { id: deviceId, hospitalId },
      select: {
        id: true,
        hospitalId: true,
        serialNumber: true,
        ipAddress: true,
        name: true,
      },
    });
    if (!dev) {
      throw new NotFoundException('جهاز البصمة غير موجود في هذه المنشأة.');
    }

    const summary = await this.ingestAdmsAttlog(
      dev,
      rawAttlog,
      'MANUAL',
      tzOffsetHours,
    );

    const auditFields = {
      hospitalId,
      userId: actorUserId,
      action: 'BIOMETRIC_PUNCHES_INGESTED',
      entity: 'BiometricDevice',
      entityId: dev.id,
      details: summary,
    };
    await this.prisma.$transaction((tx) =>
      appendChainedAuditInTransaction(tx, auditFields),
    );
    publishCommittedCriticalAudit(auditFields);

    return summary;
  }

  async listPunchLogs(hospitalId: number, deviceId?: number, userId?: number) {
    return this.prisma.biometricPunchLog.findMany({
      where: {
        hospitalId,
        ...(deviceId ? { deviceId } : {}),
        ...(userId ? { userId } : {}),
      },
      include: {
        device: { select: { id: true, name: true, serialNumber: true } },
        user: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { punchTime: 'desc' },
      take: 200,
    });
  }

  // =========================================================================
  // 3. ATTENDANCE MOVEMENTS (TEMP LEAVE / RETURN) WITH 4-EYES APPROVAL
  // =========================================================================

  async recordMovement(
    hospitalId: number,
    actorUserId: number,
    dto: RecordAttendanceMovementDto,
  ) {
    const movementTime = new Date(dto.movementTime);
    if (Number.isNaN(movementTime.getTime())) {
      throw new BadRequestException('وقت الحركة المؤقتة غير صالح.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const record = await tx.attendanceRecord.findFirst({
        where: { id: dto.attendanceRecordId, user: { hospitalId } },
        select: { id: true, userId: true },
      });
      if (!record) {
        throw new NotFoundException('سجل الحضور غير موجود في هذه المنشأة.');
      }

      const mov = await tx.attendanceMovement.create({
        data: {
          hospitalId,
          attendanceRecordId: record.id,
          userId: record.userId,
          movementType: dto.movementType,
          movementTime,
          approvalStatus: 'PENDING',
          reason: dto.reason?.trim() || null,
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'ATTENDANCE_MOVEMENT_RECORDED',
        entity: 'AttendanceMovement',
        entityId: mov.id,
        details: {
          attendanceRecordId: record.id,
          movementType: dto.movementType,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return mov;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async decideMovement(
    hospitalId: number,
    movementId: number,
    approverId: number,
    dto: DecideAttendanceMovementDto,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.attendanceMovement.findFirst({
        where: { id: movementId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('الحركة المؤقتة غير موجودة.');
      }
      if (existing.approvalStatus !== 'PENDING') {
        throw new ConflictException('تم البت في هذه الحركة مسبقًا.');
      }
      if (existing.userId === approverId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يمكن للموظف اعتماد مغادرته المؤقتة بنفسه.',
        );
      }

      const saved = await tx.attendanceMovement.update({
        where: { id: existing.id },
        data: {
          approvalStatus: dto.decision,
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      // Recompute total tempLeaveMinutes on the parent AttendanceRecord for paired TEMP_LEAVE -> RETURN
      const allMovs = await tx.attendanceMovement.findMany({
        where: {
          attendanceRecordId: existing.attendanceRecordId,
          approvalStatus: { not: 'REJECTED' },
        },
        orderBy: { movementTime: 'asc' },
      });
      let tempLeaveMinutes = 0;
      let openLeaveStart: Date | null = null;
      for (const m of allMovs) {
        if (m.movementType === 'TEMP_LEAVE') {
          openLeaveStart = m.movementTime;
        } else if (m.movementType === 'RETURN' && openLeaveStart) {
          const mins = Math.max(
            0,
            Math.round(
              (m.movementTime.getTime() - openLeaveStart.getTime()) / 60000,
            ),
          );
          tempLeaveMinutes += mins;
          openLeaveStart = null;
        }
      }

      const parent = await tx.attendanceRecord.findUnique({
        where: { id: existing.attendanceRecordId },
        select: { checkIn: true, checkOut: true },
      });
      let netWorkedHours: string | undefined;
      if (
        parent?.checkIn &&
        parent.checkOut &&
        parent.checkOut > parent.checkIn
      ) {
        const grossMins =
          (parent.checkOut.getTime() - parent.checkIn.getTime()) / 60000;
        const netHours = Math.max(0, (grossMins - tempLeaveMinutes) / 60);
        netWorkedHours = Money.toDbString(Money.roundDecimal(netHours, 3));
      }

      await tx.attendanceRecord.update({
        where: { id: existing.attendanceRecordId },
        data: {
          tempLeaveMinutes,
          ...(netWorkedHours !== undefined
            ? { workedHours: netWorkedHours }
            : {}),
        },
      });

      const auditFields = {
        hospitalId,
        userId: approverId,
        action: `ATTENDANCE_MOVEMENT_${dto.decision}`,
        entity: 'AttendanceMovement',
        entityId: saved.id,
        details: {
          attendanceRecordId: saved.attendanceRecordId,
          tempLeaveMinutes,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 4. HR ABSENCE CLASSIFICATION (AUTHORIZED / UNAUTHORIZED / SICK / VACATION)
  // =========================================================================

  async markAndClassifyAbsence(
    hospitalId: number,
    classifierId: number,
    dto: MarkAbsenceDto,
  ) {
    const rawDate = new Date(dto.date);
    if (Number.isNaN(rawDate.getTime())) {
      throw new BadRequestException('تاريخ الغياب غير صالح.');
    }
    const dayStart = new Date(
      Date.UTC(
        rawDate.getUTCFullYear(),
        rawDate.getUTCMonth(),
        rawDate.getUTCDate(),
      ),
    );

    let committedAudit: Record<string, unknown> | null = null;
    const record = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const emp = await tx.user.findFirst({
        where: { id: dto.userId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!emp) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const saved = await tx.attendanceRecord.upsert({
        where: { userId_date: { userId: dto.userId, date: dayStart } },
        update: {
          status: 'ABSENT',
          absenceAuthorization: dto.classification,
          absenceClassifiedById: classifierId,
          absenceNotes: dto.notes?.trim() || null,
        },
        create: {
          userId: dto.userId,
          date: dayStart,
          status: 'ABSENT',
          absenceAuthorization: dto.classification,
          absenceClassifiedById: classifierId,
          absenceNotes: dto.notes?.trim() || null,
        },
      });

      const auditFields = {
        hospitalId,
        userId: classifierId,
        action: 'ATTENDANCE_ABSENCE_CLASSIFIED',
        entity: 'AttendanceRecord',
        entityId: saved.id,
        details: {
          targetUserId: dto.userId,
          date: dayStart.toISOString().slice(0, 10),
          classification: dto.classification,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return record;
  }

  async classifyAbsence(
    hospitalId: number,
    recordId: number,
    classifierId: number,
    dto: ClassifyAbsenceDto,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.attendanceRecord.findFirst({
        where: { id: recordId, user: { hospitalId } },
      });
      if (!existing) {
        throw new NotFoundException('سجل الحضور غير موجود في هذه المنشأة.');
      }

      const saved = await tx.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          status: 'ABSENT',
          absenceAuthorization: dto.classification,
          absenceClassifiedById: classifierId,
          absenceNotes: dto.notes?.trim() || null,
        },
      });

      const auditFields = {
        hospitalId,
        userId: classifierId,
        action: 'ATTENDANCE_ABSENCE_CLASSIFIED',
        entity: 'AttendanceRecord',
        entityId: saved.id,
        details: { classification: dto.classification },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 5. OFFICIAL HOLIDAYS CALENDAR (MULTI-TENANT)
  // =========================================================================

  async listHolidays(hospitalId: number) {
    return this.prisma.holiday.findMany({
      where: { hospitalId, isActive: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  }

  async createHoliday(
    hospitalId: number,
    createdById: number,
    dto: CreateHolidayDto,
  ) {
    const rawDate = new Date(dto.date);
    if (Number.isNaN(rawDate.getTime())) {
      throw new BadRequestException('تاريخ العطلة الرسمية غير صالح.');
    }
    const dayStart = new Date(
      Date.UTC(
        rawDate.getUTCFullYear(),
        rawDate.getUTCMonth(),
        rawDate.getUTCDate(),
      ),
    );

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const holiday = await tx.holiday.create({
        data: {
          hospitalId,
          name: dto.name.trim(),
          nameEn: dto.nameEn?.trim() || null,
          date: dayStart,
          isAnnual: Boolean(dto.isAnnual),
          isActive: true,
          createdById,
        },
      });

      const auditFields = {
        hospitalId,
        userId: createdById,
        action: 'OFFICIAL_HOLIDAY_CREATED',
        entity: 'Holiday',
        entityId: holiday.id,
        details: {
          name: holiday.name,
          date: dayStart.toISOString().slice(0, 10),
          isAnnual: holiday.isAnnual,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return holiday;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async deactivateHoliday(
    hospitalId: number,
    holidayId: number,
    actorUserId: number,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.holiday.findFirst({
        where: { id: holidayId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('العطلة الرسمية غير موجودة في المنشأة.');
      }
      const saved = await tx.holiday.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'OFFICIAL_HOLIDAY_DEACTIVATED',
        entity: 'Holiday',
        entityId: saved.id,
        details: { name: saved.name },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }
}
