// src/hr/hr.service.ts

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShiftType,
  LeaveType,
  LeaveStatus,
  RosterDayType,
  Prisma,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { assertStaffSchedulingEligibility } from './staff-credentialing.service';

export interface UpsertShiftDayInput {
  employeeId: number;
  rosterDate: string;
  dayType: RosterDayType;
  shiftId?: number | null;
  notes?: string;
}

function toUtcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseShiftDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start === end ? 1440 : (end - start + 1440) % 1440;
}

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  // --- إدارة أنواع الورديات (Shifts Definitions) ---
  async createWorkShift(
    hospitalId: number,
    data: {
      code?: string;
      name: string;
      nameEn?: string;
      type: ShiftType;
      startTime: string; // "08:00"
      endTime: string; // "16:00"
      breakMinutes?: number;
      graceMinutes?: number;
      workHours?: number;
      overtimeMultiplier?: number;
      holidayMultiplier?: number;
      nightAllowance?: number;
      isOvernight?: boolean;
      isFlexible?: boolean;
      isScrubShift?: boolean;
      isActive?: boolean;
    },
  ) {
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('اسم الوردية مطلوب.');
    }
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(data.startTime) || !timeRegex.test(data.endTime)) {
      throw new BadRequestException(
        'صيغة وقت البداية والنهاية يجب أن تكون HH:mm.',
      );
    }
    if (
      data.graceMinutes !== undefined &&
      (!Number.isInteger(data.graceMinutes) ||
        data.graceMinutes < 0 ||
        data.graceMinutes > 240)
    ) {
      throw new BadRequestException(
        'فترة السماحية يجب أن تكون رقماً صحيحاً بين 0 و 240 دقيقة.',
      );
    }

    const durationMinutes = parseShiftDurationMinutes(
      data.startTime,
      data.endTime,
    );
    const derivedHours = Number(Money.toFixed(durationMinutes / 60, 3));
    const effectiveWorkHours =
      data.workHours !== undefined ? Number(data.workHours) : derivedHours;
    if (
      !Number.isFinite(effectiveWorkHours) ||
      effectiveWorkHours <= 0 ||
      effectiveWorkHours * 60 > durationMinutes
    ) {
      throw new BadRequestException(
        'ساعات العمل المعتمدة لا يمكن أن تتجاوز مدة الوردية.',
      );
    }

    const [sh, sm] = data.startTime.split(':').map(Number);
    const [eh, em] = data.endTime.split(':').map(Number);
    const inferredOvernight = data.isOvernight ?? eh * 60 + em <= sh * 60 + sm;

    return this.prisma.workShift.create({
      data: {
        hospitalId,
        code: data.code?.trim().toUpperCase() || null,
        name: data.name.trim(),
        nameEn: data.nameEn?.trim() || null,
        type: data.type,
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes ?? 0,
        graceMinutes: data.graceMinutes ?? 15,
        workHours: Money.toDbString(Money.roundDecimal(effectiveWorkHours, 3)),
        overtimeMultiplier: Money.toDbString(
          Money.roundDecimal(data.overtimeMultiplier ?? 1.5, 3),
        ),
        holidayMultiplier: Money.toDbString(
          Money.roundDecimal(data.holidayMultiplier ?? 2.0, 3),
        ),
        nightAllowance: Money.toDbString(data.nightAllowance ?? 0),
        isOvernight: inferredOvernight,
        isFlexible: Boolean(data.isFlexible),
        isScrubShift: Boolean(data.isScrubShift),
        isActive: data.isActive ?? true,
      },
    });
  }

  async getWorkShifts(hospitalId: number) {
    return this.prisma.workShift.findMany({
      where: { hospitalId, isActive: true },
      include: {
        _count: {
          select: { assignments: true, shiftDays: true },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async updateWorkShift(
    hospitalId: number,
    id: number,
    data: {
      code?: string;
      name?: string;
      nameEn?: string;
      type?: ShiftType;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      graceMinutes?: number;
      workHours?: number;
      overtimeMultiplier?: number;
      holidayMultiplier?: number;
      nightAllowance?: number;
      isOvernight?: boolean;
      isFlexible?: boolean;
      isScrubShift?: boolean;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.workShift.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
    }

    const startTime = data.startTime ?? existing.startTime;
    const endTime = data.endTime ?? existing.endTime;
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new BadRequestException(
        'صيغة وقت البداية والنهاية يجب أن تكون HH:mm.',
      );
    }

    const durationMinutes = parseShiftDurationMinutes(startTime, endTime);
    const workHoursNum =
      data.workHours !== undefined
        ? Number(data.workHours)
        : Number(existing.workHours);
    if (workHoursNum * 60 > durationMinutes) {
      throw new BadRequestException(
        'ساعات العمل المعتمدة لا يمكن أن تتجاوز مدة الوردية.',
      );
    }

    return this.prisma.workShift.update({
      where: { id: existing.id },
      data: {
        ...(data.code !== undefined
          ? { code: data.code?.trim().toUpperCase() || null }
          : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.nameEn !== undefined
          ? { nameEn: data.nameEn?.trim() || null }
          : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        startTime,
        endTime,
        ...(data.breakMinutes !== undefined
          ? { breakMinutes: data.breakMinutes }
          : {}),
        ...(data.graceMinutes !== undefined
          ? { graceMinutes: data.graceMinutes }
          : {}),
        ...(data.workHours !== undefined
          ? { workHours: Money.toDbString(Money.roundDecimal(workHoursNum, 3)) }
          : {}),
        ...(data.overtimeMultiplier !== undefined
          ? {
              overtimeMultiplier: Money.toDbString(
                Money.roundDecimal(data.overtimeMultiplier, 3),
              ),
            }
          : {}),
        ...(data.holidayMultiplier !== undefined
          ? {
              holidayMultiplier: Money.toDbString(
                Money.roundDecimal(data.holidayMultiplier, 3),
              ),
            }
          : {}),
        ...(data.nightAllowance !== undefined
          ? { nightAllowance: Money.toDbString(data.nightAllowance) }
          : {}),
        ...(data.isOvernight !== undefined
          ? { isOvernight: data.isOvernight }
          : {}),
        ...(data.isFlexible !== undefined
          ? { isFlexible: data.isFlexible }
          : {}),
        ...(data.isScrubShift !== undefined
          ? { isScrubShift: data.isScrubShift }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async deleteWorkShift(hospitalId: number, id: number) {
    const existing = await this.prisma.workShift.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
    }
    return this.prisma.workShift.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  // --- إدارة تعيينات الورديات وجدول المناوبات الشهري (ShiftAssignments & EmployeeShiftDays) ---

  private parseAssignmentRange(startDateStr: string, endDateStr?: string) {
    const startDate = new Date(`${startDateStr.slice(0, 10)}T00:00:00.000Z`);
    const endDate = endDateStr
      ? new Date(`${endDateStr.slice(0, 10)}T23:59:59.999Z`)
      : null;
    if (
      Number.isNaN(startDate.getTime()) ||
      (endDate && Number.isNaN(endDate.getTime()))
    ) {
      throw new BadRequestException('فترة تعيين الوردية غير صالحة.');
    }
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'تاريخ نهاية التعيين يجب ألا يسبق تاريخ البداية.',
      );
    }
    return { startDate, endDate };
  }

  async listShiftAssignments(
    hospitalId: number,
    filter?: { employeeId?: number; departmentId?: number },
  ) {
    return this.prisma.shiftAssignment.findMany({
      where: {
        hospitalId,
        isActive: true,
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter?.departmentId
          ? { employee: { departmentId: filter.departmentId } }
          : {}),
      },
      include: {
        shift: true,
        employee: {
          select: {
            id: true,
            employeeNo: true,
            fullName: true,
            staffCategory: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
  }

  async assignShiftToEmployee(
    hospitalId: number,
    actorUserId: number,
    dto: {
      employeeId: number;
      shiftId: number;
      startDate: string;
      endDate?: string;
    },
  ) {
    const range = this.parseAssignmentRange(dto.startDate, dto.endDate);
    let committedAudit: Record<string, unknown> | null = null;
    const saved = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const employee = await tx.employee.findFirst({
        where: {
          id: dto.employeeId,
          hospitalId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, userId: true, employeeNo: true, fullName: true },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود أو غير نشط.');
      }

      await assertStaffSchedulingEligibility(
        tx,
        hospitalId,
        employee.userId,
        range.endDate ?? range.startDate,
        employee.id,
      );

      const shift = await tx.workShift.findFirst({
        where: { id: dto.shiftId, hospitalId, isActive: true },
        select: { id: true, name: true },
      });
      if (!shift) {
        throw new NotFoundException('الوردية غير موجودة أو غير مفعلة.');
      }

      const overlap = await tx.shiftAssignment.findFirst({
        where: {
          hospitalId,
          employeeId: dto.employeeId,
          isActive: true,
          startDate: {
            lte: range.endDate ?? new Date('9999-12-31T23:59:59.999Z'),
          },
          OR: [{ endDate: null }, { endDate: { gte: range.startDate } }],
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ConflictException(
          `يوجد تعيين وردية متداخل للموظف ${employee.fullName} ضمن الفترة المحددة.`,
        );
      }

      const created = await tx.shiftAssignment.create({
        data: {
          hospitalId,
          employeeId: dto.employeeId,
          shiftId: dto.shiftId,
          startDate: range.startDate,
          endDate: range.endDate,
          isActive: true,
        },
        include: {
          shift: true,
          employee: {
            select: { id: true, employeeNo: true, fullName: true },
          },
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'SHIFT_ASSIGNMENT_CREATED',
        entity: 'ShiftAssignment',
        entityId: created.id,
        details: {
          employeeId: dto.employeeId,
          shiftId: dto.shiftId,
          startDate: range.startDate.toISOString().slice(0, 10),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return created;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return saved;
  }

  async bulkAssignShift(
    hospitalId: number,
    actorUserId: number,
    dto: {
      employeeIds?: number[];
      departmentId?: number;
      shiftId: number;
      startDate: string;
      endDate?: string;
    },
  ) {
    let targetEmployeeIds = dto.employeeIds
      ? [...new Set(dto.employeeIds)]
      : [];
    if (!targetEmployeeIds.length && dto.departmentId) {
      const deptEmps = await this.prisma.employee.findMany({
        where: {
          hospitalId,
          departmentId: dto.departmentId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      targetEmployeeIds = deptEmps.map((e) => e.id);
    }
    if (!targetEmployeeIds.length) {
      throw new BadRequestException(
        'حدد قائمة الموظفين أو القسم لتعيين الوردية.',
      );
    }

    const assignments: unknown[] = [];
    for (const employeeId of targetEmployeeIds) {
      assignments.push(
        await this.assignShiftToEmployee(hospitalId, actorUserId, {
          employeeId,
          shiftId: dto.shiftId,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      );
    }
    return { count: assignments.length, assignments };
  }

  async removeShiftAssignment(hospitalId: number, id: number) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('تعيين الوردية غير موجود.');
    }
    return this.prisma.shiftAssignment.delete({ where: { id: existing.id } });
  }

  async getMonthlyShiftGrid(
    hospitalId: number,
    params: {
      month?: string;
      fromDate?: string;
      toDate?: string;
      departmentId?: number;
      employeeId?: number;
    },
  ) {
    let start: Date;
    let end: Date;
    if (params.fromDate && params.toDate) {
      start = new Date(`${params.fromDate.slice(0, 10)}T00:00:00.000Z`);
      end = new Date(`${params.toDate.slice(0, 10)}T00:00:00.000Z`);
    } else {
      const refMonth =
        params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? params.month
          : new Date().toISOString().slice(0, 7);
      const [y, m] = refMonth.split('-').map(Number);
      start = new Date(Date.UTC(y, m - 1, 1));
      end = new Date(Date.UTC(y, m, 0));
    }

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      throw new BadRequestException('نطاق التواريخ غير صالح.');
    }

    const [shifts, employees, days] = await Promise.all([
      this.prisma.workShift.findMany({
        where: { hospitalId, isActive: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: {
          hospitalId,
          isActive: true,
          deletedAt: null,
          ...(params.departmentId ? { departmentId: params.departmentId } : {}),
          ...(params.employeeId ? { id: params.employeeId } : {}),
        },
        select: {
          id: true,
          employeeNo: true,
          fullName: true,
          staffCategory: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
          jobTitle: { select: { id: true, name: true } },
        },
        orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.employeeShiftDay.findMany({
        where: {
          hospitalId,
          rosterDate: { gte: start, lte: end },
          ...(params.employeeId ? { employeeId: params.employeeId } : {}),
          ...(params.departmentId
            ? { employee: { departmentId: params.departmentId } }
            : {}),
        },
        include: {
          shift: {
            select: {
              id: true,
              code: true,
              name: true,
              startTime: true,
              endTime: true,
              type: true,
            },
          },
        },
        orderBy: [{ rosterDate: 'asc' }, { employeeId: 'asc' }],
      }),
    ]);

    return {
      fromDate: start.toISOString().slice(0, 10),
      toDate: end.toISOString().slice(0, 10),
      shifts,
      employees,
      days,
    };
  }

  async upsertShiftDay(
    hospitalId: number,
    actorUserId: number,
    dto: UpsertShiftDayInput,
  ) {
    const rosterDate = new Date(`${dto.rosterDate.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(rosterDate.getTime())) {
      throw new BadRequestException('تاريخ جدول المناوبة غير صالح.');
    }
    if (dto.dayType === RosterDayType.WORK && !dto.shiftId) {
      throw new BadRequestException('يجب تحديد الوردية ليوم العمل (WORK).');
    }
    if (dto.dayType !== RosterDayType.WORK && dto.shiftId) {
      throw new BadRequestException(
        'لا يجوز ربط يوم الراحة أو الإجازة بوردية عمل.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: dto.employeeId,
          hospitalId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, userId: true },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود أو غير نشط.');
      }

      if (dto.dayType === RosterDayType.WORK) {
        await assertStaffSchedulingEligibility(
          tx,
          hospitalId,
          employee.userId,
          rosterDate,
          employee.id,
        );
        const shift = await tx.workShift.findFirst({
          where: { id: dto.shiftId!, hospitalId, isActive: true },
          select: { id: true },
        });
        if (!shift) {
          throw new NotFoundException('الوردية غير موجودة أو غير مفعلة.');
        }
      }

      return tx.employeeShiftDay.upsert({
        where: {
          employeeId_rosterDate: { employeeId: dto.employeeId, rosterDate },
        },
        create: {
          hospitalId,
          employeeId: dto.employeeId,
          rosterDate,
          dayType: dto.dayType,
          shiftId: dto.dayType === RosterDayType.WORK ? dto.shiftId : null,
          notes: dto.notes?.trim() || null,
          createdById: actorUserId,
        },
        update: {
          dayType: dto.dayType,
          shiftId: dto.dayType === RosterDayType.WORK ? dto.shiftId : null,
          notes: dto.notes?.trim() || null,
          createdById: actorUserId,
        },
        include: { shift: true },
      });
    });
  }

  async bulkUpsertShiftDays(
    hospitalId: number,
    actorUserId: number,
    days: UpsertShiftDayInput[],
  ) {
    if (!days?.length) {
      throw new BadRequestException('قائمة الأيام المطلوب حفظها فارغة.');
    }
    const saved: unknown[] = [];
    for (const day of days) {
      saved.push(await this.upsertShiftDay(hospitalId, actorUserId, day));
    }
    return { count: saved.length, days: saved };
  }

  async deleteShiftDay(hospitalId: number, id: number) {
    const existing = await this.prisma.employeeShiftDay.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('سجل اليوم غير موجود في الجدول.');
    }
    return this.prisma.employeeShiftDay.delete({ where: { id: existing.id } });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (quoted) {
      throw new BadRequestException('ملف CSV يحتوي على اقتباس غير مغلق.');
    }
    values.push(current.trim());
    return values;
  }

  private async parseRosterCsv(hospitalId: number, content: string) {
    const lines = String(content || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new BadRequestException(
        'ملف CSV يجب أن يحتوي على سطر العناوين وصف واحد على الأقل.',
      );
    }
    if (lines.length > 10001) {
      throw new BadRequestException('الحد الأقصى للاستيراد 10000 صف.');
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idxOf = (...names: string[]) =>
      names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

    const empIdx = idxOf('employeeno', 'employee_no', 'رقم الموظف');
    const dateIdx = idxOf('date', 'rosterdate', 'التاريخ');
    const codeIdx = idxOf('code', 'shift', 'shiftcode', 'الوردية');
    const notesIdx = idxOf('notes', 'ملاحظات');

    if ([empIdx, dateIdx, codeIdx].some((i) => i < 0)) {
      throw new BadRequestException(
        'العناوين المطلوبة: employeeNo,date,code (وnotes اختياري).',
      );
    }

    const rawRows = lines.slice(1).map((line, offset) => {
      const vals = this.parseCsvLine(line);
      return {
        line: offset + 2,
        employeeNo: vals[empIdx]?.trim() || '',
        date: vals[dateIdx]?.trim() || '',
        code: (vals[codeIdx]?.trim() || '').toUpperCase(),
        notes: notesIdx >= 0 ? vals[notesIdx]?.trim() : undefined,
      };
    });

    const empNos = [
      ...new Set(rawRows.map((r) => r.employeeNo).filter(Boolean)),
    ];
    const [employees, shifts] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          hospitalId,
          employeeNo: { in: empNos },
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, employeeNo: true, fullName: true },
      }),
      this.prisma.workShift.findMany({
        where: { hospitalId, isActive: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const empByNo = new Map(employees.map((e) => [e.employeeNo, e]));
    const resolveShift = (code: string) => {
      if (!code) return undefined;
      const byCode = shifts.find((s) => s.code?.toUpperCase() === code);
      if (byCode) return byCode;
      if (/^\d+$/.test(code)) {
        const byId = shifts.find((s) => s.id === Number(code));
        if (byId) return byId;
      }
      return shifts.find(
        (s) =>
          s.name.toUpperCase() === code || s.nameEn?.toUpperCase() === code,
      );
    };

    const errors: Array<{ line: number; message: string }> = [];
    const seenKeys = new Set<string>();
    const rows: Array<{
      employeeId: number;
      employeeNo: string;
      employeeName: string;
      rosterDate: string;
      dayType: RosterDayType;
      shiftId: number | null;
      shiftName: string | null;
      notes?: string;
    }> = [];

    for (const raw of rawRows) {
      const emp = empByNo.get(raw.employeeNo);
      const parsedDate = new Date(`${raw.date}T00:00:00.000Z`);
      const validDate =
        /^\d{4}-\d{2}-\d{2}$/.test(raw.date) &&
        !Number.isNaN(parsedDate.getTime()) &&
        parsedDate.toISOString().slice(0, 10) === raw.date
          ? raw.date
          : '';
      const dayType: RosterDayType = (
        ['REST', 'OFF', 'LEAVE'].includes(raw.code) ? raw.code : 'WORK'
      ) as RosterDayType;
      const key = `${raw.employeeNo}|${validDate}`;

      if (!emp) {
        errors.push({
          line: raw.line,
          message: `رقم الموظف غير موجود أو غير نشط: ${raw.employeeNo || 'فارغ'}`,
        });
      }
      if (!validDate) {
        errors.push({
          line: raw.line,
          message: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD',
        });
      }
      if (seenKeys.has(key)) {
        errors.push({
          line: raw.line,
          message: 'تكرار الموظف والتاريخ داخل الملف',
        });
      }
      seenKeys.add(key);

      const shift =
        dayType === RosterDayType.WORK ? resolveShift(raw.code) : null;
      if (dayType === RosterDayType.WORK && !shift) {
        errors.push({
          line: raw.line,
          message: `رمز الوردية غير معروف: ${raw.code || 'فارغ'}`,
        });
      }
      if (emp && validDate && (dayType !== RosterDayType.WORK || shift)) {
        rows.push({
          employeeId: emp.id,
          employeeNo: emp.employeeNo,
          employeeName: emp.fullName,
          rosterDate: validDate,
          dayType,
          shiftId: shift?.id ?? null,
          shiftName: shift?.name ?? null,
          notes: raw.notes,
        });
      }
    }

    return { rows, errors, total: rawRows.length };
  }

  async previewRosterCsvImport(hospitalId: number, content: string) {
    return this.parseRosterCsv(hospitalId, content);
  }

  async applyRosterCsvImport(
    hospitalId: number,
    actorUserId: number,
    content: string,
  ) {
    const preview = await this.parseRosterCsv(hospitalId, content);
    if (preview.errors.length) {
      throw new BadRequestException({
        message: 'لا يمكن اعتماد ملف يحتوي على أخطاء.',
        errors: preview.errors,
      });
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const results: unknown[] = [];
      for (const row of preview.rows) {
        const rosterDate = new Date(`${row.rosterDate}T00:00:00.000Z`);
        if (row.dayType === RosterDayType.WORK) {
          const emp = await tx.employee.findUnique({
            where: { id: row.employeeId },
            select: { userId: true },
          });
          await assertStaffSchedulingEligibility(
            tx,
            hospitalId,
            emp?.userId ?? null,
            rosterDate,
            row.employeeId,
          );
        }
        results.push(
          await tx.employeeShiftDay.upsert({
            where: {
              employeeId_rosterDate: {
                employeeId: row.employeeId,
                rosterDate,
              },
            },
            create: {
              hospitalId,
              employeeId: row.employeeId,
              rosterDate,
              dayType: row.dayType,
              shiftId: row.shiftId,
              notes: row.notes || null,
              createdById: actorUserId,
            },
            update: {
              dayType: row.dayType,
              shiftId: row.shiftId,
              notes: row.notes || null,
              createdById: actorUserId,
            },
          }),
        );
      }
      return results;
    });

    return { count: saved.length, total: preview.total, errors: [] };
  }

  // --- إدارة الجدول الشهري التقليدي (Legacy User Rostering - Kept for Backwards Compatibility) ---

  // توزيع وردية لموظف في نطاق تاريخي معين
  async assignRoster(params: {
    hospitalId: number;
    userId: number;
    workShiftId: number;
    fromDate: Date;
    toDate: Date;
    isOffDay?: boolean;
  }) {
    const { hospitalId, userId, workShiftId, fromDate, toDate, isOffDay } =
      params;

    const rawStart = new Date(fromDate);
    const rawEnd = new Date(toDate);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new BadRequestException('تاريخ بداية أو نهاية الجدول غير صالح.');
    }

    const start = toUtcDayStart(rawStart);
    const end = toUtcDayStart(rawEnd);
    if (end < start) {
      throw new BadRequestException(
        'تاريخ نهاية الجدول يجب أن يكون مساوياً أو بعد تاريخ البداية.',
      );
    }

    const spanDays =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 366) {
      throw new BadRequestException(
        'لا يمكن جدولة أكثر من 366 يوماً في عملية واحدة.',
      );
    }

    const rostersData: Prisma.EmployeeRosterCreateManyInput[] = [];
    for (
      let d = new Date(start.getTime());
      d <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      rostersData.push({
        hospitalId,
        userId,
        workShiftId,
        date: new Date(d.getTime()),
        isOffDay: Boolean(isOffDay),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({
        where: { id: userId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      // CAP12: منع جدولة ورديات عمل لموظف انتهى/عُلّق إذن مزاولته أو شهادته الصحية
      if (!isOffDay) {
        await assertStaffSchedulingEligibility(tx, hospitalId, userId, end);
      }

      const shift = await tx.workShift.findFirst({
        where: { id: workShiftId, hospitalId },
        select: { id: true },
      });
      if (!shift) {
        throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
      }

      // 1. حذف أي جدول سابق في هذه الأيام لهذا الموظف
      await tx.employeeRoster.deleteMany({
        where: {
          hospitalId,
          userId,
          date: { gte: start, lte: end },
        },
      });

      // 2. إضافة الجدول الجديد
      return tx.employeeRoster.createMany({
        data: rostersData,
      });
    });
  }

  async getRoster(hospitalId: number, from: Date, to: Date, userId?: number) {
    return this.prisma.employeeRoster.findMany({
      where: {
        hospitalId,
        date: { gte: from, lte: to },
        userId: userId || undefined,
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
      orderBy: { date: 'asc' },
    });
  }

  // تعديل إدخال roster واحد
  async updateRosterEntry(
    hospitalId: number,
    id: number,
    data: { workShiftId?: number; isOffDay?: boolean },
  ) {
    const entry = await this.prisma.employeeRoster.findUnique({
      where: { id },
    });

    if (!entry || entry.hospitalId !== hospitalId) {
      throw new NotFoundException('إدخال الجدول غير موجود');
    }

    if (data.workShiftId !== undefined) {
      const shift = await this.prisma.workShift.findFirst({
        where: { id: data.workShiftId, hospitalId },
        select: { id: true },
      });
      if (!shift) {
        throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
      }
    }

    return this.prisma.employeeRoster.update({
      where: { id },
      data: {
        workShiftId: data.workShiftId ?? entry.workShiftId,
        isOffDay: data.isOffDay ?? entry.isOffDay,
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
    });
  }

  // حذف إدخال roster واحد
  async deleteRosterEntry(hospitalId: number, id: number) {
    const entry = await this.prisma.employeeRoster.findUnique({
      where: { id },
    });

    if (!entry || entry.hospitalId !== hospitalId) {
      throw new NotFoundException('إدخال الجدول غير موجود');
    }

    return this.prisma.employeeRoster.delete({
      where: { id },
    });
  }

  // --- إدارة الإجازات (Leaves) ---

  async requestLeave(params: {
    hospitalId: number;
    userId: number;
    type: LeaveType;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }) {
    const rawStart = new Date(params.startDate);
    const rawEnd = new Date(params.endDate);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new BadRequestException('تاريخ بداية أو نهاية الإجازة غير صالح.');
    }

    const start = toUtcDayStart(rawStart);
    const end = toUtcDayStart(rawEnd);
    if (end < start) {
      throw new BadRequestException(
        'تاريخ نهاية الإجازة يجب أن يكون مساوياً أو بعد تاريخ البداية.',
      );
    }

    const daysCount =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

    return this.prisma.$transaction(async (tx) => {
      const lockedUsers = await tx.$queryRaw<
        Array<{ id: number; hospitalId: number; isDeleted: boolean }>
      >`SELECT "id", "hospitalId", "isDeleted" FROM "User" WHERE "id" = ${params.userId} AND "hospitalId" = ${params.hospitalId} FOR UPDATE`;

      if (!lockedUsers.length || lockedUsers[0].isDeleted) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const overlapping = await tx.leaveRequest.findFirst({
        where: {
          hospitalId: params.hospitalId,
          userId: params.userId,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (overlapping) {
        throw new BadRequestException(
          'يوجد طلب إجازة معلق أو معتمد يتداخل مع هذه الفترة.',
        );
      }

      if (params.type === LeaveType.ANNUAL) {
        const user = await tx.user.findUnique({
          where: { id: params.userId },
          select: { annualLeaveBalance: true },
        });
        const pendingAnnual = await tx.leaveRequest.aggregate({
          where: {
            hospitalId: params.hospitalId,
            userId: params.userId,
            type: LeaveType.ANNUAL,
            status: LeaveStatus.PENDING,
          },
          _sum: { daysCount: true },
        });
        const reservedDays = pendingAnnual._sum.daysCount ?? 0;
        const availableBalance = (user?.annualLeaveBalance ?? 0) - reservedDays;

        if (availableBalance < daysCount) {
          throw new BadRequestException('رصيد الإجازات السنوية لا يكفي.');
        }
      }

      return tx.leaveRequest.create({
        data: {
          hospitalId: params.hospitalId,
          userId: params.userId,
          type: params.type,
          startDate: start,
          endDate: end,
          reason: params.reason,
          daysCount,
          status: LeaveStatus.PENDING,
        },
      });
    });
  }

  async approveLeave(
    hospitalId: number,
    requestId: number,
    approverId: number,
    status: LeaveStatus,
  ) {
    if (status !== LeaveStatus.APPROVED && status !== LeaveStatus.REJECTED) {
      throw new BadRequestException(
        'حالة البت في الإجازة يجب أن تكون APPROVED أو REJECTED.',
      );
    }

    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const lockedLeaves = await tx.$queryRaw<
        Array<{
          id: number;
          hospitalId: number;
          userId: number;
          status: string;
        }>
      >`SELECT "id", "hospitalId", "userId", "status" FROM "LeaveRequest" WHERE "id" = ${requestId} FOR UPDATE`;

      if (!lockedLeaves.length || lockedLeaves[0].hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود');
      }

      const leave = await tx.leaveRequest.findUnique({
        where: { id: requestId },
      });
      if (!leave || leave.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود');
      }

      if (leave.status !== LeaveStatus.PENDING) {
        throw new BadRequestException(
          'تم البت في طلب الإجازة مسبقاً ولا يمكن تغيير حالته مرة أخرى.',
        );
      }
      if (leave.userId === null) {
        throw new BadRequestException(
          'المستخدم المرتبط بطلب الإجازة غير محدد.',
        );
      }
      const targetUserId = leave.userId;

      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetUserId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      if (status === LeaveStatus.APPROVED) {
        const overlappingApproved = await tx.leaveRequest.findFirst({
          where: {
            hospitalId,
            userId: targetUserId,
            id: { not: requestId },
            status: LeaveStatus.APPROVED,
            startDate: { lte: leave.endDate },
            endDate: { gte: leave.startDate },
          },
        });
        if (overlappingApproved) {
          throw new BadRequestException(
            'توجد إجازة معتمدة أخرى للموظف تتداخل مع هذه الفترة.',
          );
        }

        if (leave.type === LeaveType.ANNUAL) {
          const user = await tx.user.findUnique({
            where: { id: targetUserId },
            select: { annualLeaveBalance: true },
          });
          if (!user || user.annualLeaveBalance < leave.daysCount) {
            throw new BadRequestException('رصيد الإجازات السنوية لا يكفي.');
          }

          await tx.user.update({
            where: { id: targetUserId },
            data: { annualLeaveBalance: { decrement: leave.daysCount } },
          });
        }
      }

      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status, approvedById: approverId },
      });

      committedAudit = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: approverId,
        action:
          status === LeaveStatus.APPROVED
            ? 'APPROVE_LEAVE_REQUEST'
            : 'REJECT_LEAVE_REQUEST',
        entity: 'LeaveRequest',
        entityId: requestId,
        details: {
          employeeId: leave.userId,
          type: leave.type,
          daysCount: leave.daysCount,
          previousStatus: leave.status,
          newStatus: status,
        },
      });

      return updated;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }

  async getLeaves(hospitalId: number, status?: LeaveStatus) {
    return this.prisma.leaveRequest.findMany({
      where: {
        hospitalId,
        status: status || undefined,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
