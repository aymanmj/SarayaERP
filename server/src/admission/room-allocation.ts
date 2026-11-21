import { BadRequestException } from '@nestjs/common';
import { RoomDayPolicy } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { roomBillableDays, roomLocalDateOrdinal } from './room-billing-policy';
import type { RoomRateSnapshot } from './room-rate-snapshot';

const DAY = 86_400_000;
export type PricedRoomStay = {
  id: number;
  from: Date;
  to: Date | null;
  rate: RoomRateSnapshot;
};
export type RoomAllocation = {
  version: 1;
  periodIndex: number;
  assignmentId: number;
  serviceItemId: number;
  periodStart: string;
  periodEnd: string;
  observedEnd: string;
  occupiedMilliseconds: number;
  periodMilliseconds: number;
  dailyRate: string;
  amount: string;
  insurancePolicyId: number | null;
};

function nextLocalMidnight(start: number, zone: string) {
  const ordinal = roomLocalDateOrdinal(new Date(start), zone);
  let low = start + 1;
  let high = start + 2 * DAY;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (roomLocalDateOrdinal(new Date(middle), zone) > ordinal) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Allocate each counted day once. Partial/minimum days use observed hours, never future occupancy. */
export function allocateRoomDays(
  start: Date,
  end: Date,
  policy: RoomDayPolicy,
  zone: string,
  stays: PricedRoomStay[],
): RoomAllocation[] {
  const days = roomBillableDays(start, end, policy, zone);
  // A request exactly at entry still observes the one-day minimum at that occupied instant.
  const observationEnd = Math.max(end.getTime(), start.getTime() + 1);
  if (days > 36600)
    throw new BadRequestException('مدة الإقامة خارج نطاق المعالجة التلقائية');
  const ordered = [...stays].sort(
    (a, b) => a.from.getTime() - b.from.getTime() || a.id - b.id,
  );
  let previousEnd = -Infinity;
  for (const stay of ordered) {
    const from = stay.from.getTime();
    const to = stay.to?.getTime() ?? observationEnd;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to < from ||
      from < previousEnd
    )
      throw new BadRequestException(
        'سجل إشغال الأسرّة متداخل أو غير صالح؛ تجب مراجعته',
      );
    previousEnd = to;
  }
  const result: RoomAllocation[] = [];
  let periodStart = start.getTime();
  for (let index = 0; index < days; index++) {
    const periodEnd =
      policy === RoomDayPolicy.CALENDAR_NIGHTS
        ? nextLocalMidnight(periodStart, zone)
        : periodStart + DAY;
    const observedEnd = Math.min(observationEnd, periodEnd);
    const denominator = observedEnd - periodStart;
    if (denominator <= 0) {
      periodStart = periodEnd;
      continue;
    }
    const parts = ordered.flatMap((stay) => {
      const duration =
        Math.min(stay.to?.getTime() ?? observationEnd, observedEnd) -
        Math.max(stay.from.getTime(), periodStart);
      if (duration <= 0) return [];
      if (stay.rate.serviceItemId === null || stay.rate.dailyRate === null)
        throw new BadRequestException(
          'جزء من الإقامة بلا تعرفة موثقة؛ تجب مراجعته قبل الفوترة',
        );
      const raw = Money.decimal(stay.rate.dailyRate)
        .times(duration)
        .dividedBy(denominator);
      const floor = raw.toDecimalPlaces(3, 1);
      return [
        { stay, duration, raw, amount: floor, remainder: raw.minus(floor) },
      ];
    });
    // Largest-remainder distribution keeps the rounded daily total exact to one millime.
    const roundedTotal = Money.roundDecimal(
      Money.sumDecimal(...parts.map((p) => p.raw)),
    );
    let mills = roundedTotal
      .minus(Money.sumDecimal(...parts.map((p) => p.amount)))
      .times(1000)
      .toNumber();
    const ranked = [...parts].sort(
      (a, b) => b.remainder.comparedTo(a.remainder) || a.stay.id - b.stay.id,
    );
    for (const part of ranked) {
      if (mills-- > 0) part.amount = part.amount.plus('0.001');
    }
    for (const part of parts)
      result.push({
        version: 1,
        periodIndex: index,
        assignmentId: part.stay.id,
        serviceItemId: part.stay.rate.serviceItemId!,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        observedEnd: new Date(observedEnd).toISOString(),
        occupiedMilliseconds: part.duration,
        periodMilliseconds: denominator,
        dailyRate: part.stay.rate.dailyRate!,
        amount: Money.toDbString(part.amount),
        insurancePolicyId: part.stay.rate.insurancePolicyId,
      });
    periodStart = periodEnd;
  }
  return result;
}
