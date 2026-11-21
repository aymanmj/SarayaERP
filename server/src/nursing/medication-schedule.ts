import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DEFAULT_TIME_ZONE, TimeZoneUtils } from '../common/utils/date.util';

const schedule: Record<string, readonly string[]> = {
  DAILY: ['08:00'],
  BID: ['08:00', '20:00'],
  TID: ['08:00', '14:00', '20:00'],
  QID: ['06:00', '12:00', '18:00', '23:59'],
  QHS: ['22:00'],
};

export async function medicationScheduleZone(
  db: Pick<Prisma.TransactionClient, 'hospital'>,
  hospitalId: number,
) {
  const facility = await db.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { organization: { select: { timezone: true } } },
  });
  return facility.organization?.timezone ?? DEFAULT_TIME_ZONE;
}

export function medicationSlots(
  frequency: string,
  dateKey: string,
  timeZone: string,
) {
  const times = Object.hasOwn(schedule, frequency) ? schedule[frequency] : [];
  return times.map((time) => ({
    scheduledSlot: `${dateKey}T${time}`,
    scheduledTime: TimeZoneUtils.fromLocal(dateKey, time, timeZone, 'earlier'),
  }));
}

export function medicationScheduleDate(date: Date | string, timeZone: string) {
  try {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      TimeZoneUtils.startOfLocalDay(date, timeZone);
      return date;
    }
    return TimeZoneUtils.localDateKey(date, timeZone);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new BadRequestException('تاريخ جدول الدواء غير صالح');
  }
}
