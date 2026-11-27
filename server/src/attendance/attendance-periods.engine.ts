// server/src/attendance/attendance-periods.engine.ts
import { Money } from '../common/utils/money.util';

export type AttendanceTimelinePunch = {
  id: number;
  punchedAt: Date | string;
};

export type AttendanceTimelineMovementType =
  | 'CHECK_IN'
  | 'TEMP_LEAVE'
  | 'RETURN'
  | 'CHECK_OUT';

export type AttendanceTimeline = {
  checkIn: Date;
  checkOut: Date | null;
  workHours: number;
  periods: Array<{
    startTime: Date;
    endTime: Date | null;
    durationMinutes: number | null;
    periodType: 'WORK';
    isApproved: boolean;
  }>;
  movements: Array<{
    punchId: number;
    movementType: AttendanceTimelineMovementType;
    movementTime: Date;
    approval: 'AUTO_APPROVED' | 'PENDING';
  }>;
};

/**
 * Converts an ordered biometric stream into work periods and approval events.
 * For four punches the state is IN -> TEMP_LEAVE -> RETURN -> OUT; an odd
 * final punch remains an open work period until a later punch closes it.
 */
export function buildAttendanceTimeline(
  punches: AttendanceTimelinePunch[],
  debounceMinutes = 3,
): AttendanceTimeline | null {
  const ordered = [...punches]
    .map((punch) => ({ ...punch, punchedAt: new Date(punch.punchedAt) }))
    .filter((punch) => !Number.isNaN(punch.punchedAt.getTime()))
    .sort(
      (left, right) => left.punchedAt.getTime() - right.punchedAt.getTime(),
    );

  const deduplicated = ordered.filter((punch, index) => {
    if (index === 0) return true;
    return (
      punch.punchedAt.getTime() - ordered[index - 1].punchedAt.getTime() >=
      debounceMinutes * 60_000
    );
  });
  if (deduplicated.length === 0) return null;

  const movements = deduplicated.map((punch, index) => {
    const last = index === deduplicated.length - 1;
    let movementType: AttendanceTimelineMovementType;
    if (index === 0) movementType = 'CHECK_IN';
    else if (last && index % 2 === 1) movementType = 'CHECK_OUT';
    else if (index % 2 === 1) movementType = 'TEMP_LEAVE';
    else movementType = 'RETURN';

    return {
      punchId: punch.id,
      movementType,
      movementTime: punch.punchedAt,
      approval:
        movementType === 'TEMP_LEAVE'
          ? ('PENDING' as const)
          : ('AUTO_APPROVED' as const),
    };
  });

  const periods: AttendanceTimeline['periods'] = [];
  for (let index = 0; index < deduplicated.length; index += 2) {
    const start = deduplicated[index].punchedAt;
    const end = deduplicated[index + 1]?.punchedAt ?? null;
    periods.push({
      startTime: start,
      endTime: end,
      durationMinutes: end
        ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000))
        : null,
      periodType: 'WORK',
      isApproved: true,
    });
  }

  const durationMinutes = periods.reduce(
    (total, period) => total + (period.durationMinutes ?? 0),
    0,
  );
  return {
    checkIn: deduplicated[0].punchedAt,
    checkOut:
      movements.at(-1)?.movementType === 'CHECK_OUT'
        ? deduplicated.at(-1)!.punchedAt
        : null,
    workHours: Money.round(durationMinutes / 60, 2),
    periods,
    movements,
  };
}
