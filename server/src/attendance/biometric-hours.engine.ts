// server/src/attendance/biometric-hours.engine.ts
import { buildAttendanceTimeline } from './attendance-periods.engine';

export type HoursPunch = {
  id: number;
  punchedAt: Date;
  declaredType: string;
};

export type HoursPeriod = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type HoursIssue = {
  punchId: number;
  punchedAt: string;
  reason: string;
};

/**
 * Pairs raw biometric punches into work intervals using the shared debounce/pairing
 * engine. Odd trailing punches are surfaced as incomplete-punch issues.
 */
export function calculateRawPeriods(
  punches: HoursPunch[],
  debounceMinutes = 3,
) {
  const periods: HoursPeriod[] = [];
  const issues: HoursIssue[] = [];
  const timeline = buildAttendanceTimeline(punches, debounceMinutes);
  if (!timeline) {
    return { periods, issues, duplicateCount: 0, totalMinutes: 0 };
  }

  for (const [index, period] of timeline.periods.entries()) {
    if (period.endTime !== null && period.durationMinutes !== null) {
      periods.push({
        startTime: period.startTime.toISOString(),
        endTime: period.endTime.toISOString(),
        durationMinutes: period.durationMinutes,
      });
    } else {
      const movement = timeline.movements[index * 2];
      issues.push({
        punchId: movement.punchId,
        punchedAt: period.startTime.toISOString(),
        reason: 'بصمة غير مكتملة دون بصمة مقابلة',
      });
    }
  }

  const validCount = punches.filter(
    (punch) => !Number.isNaN(new Date(punch.punchedAt).getTime()),
  ).length;
  return {
    periods,
    issues,
    duplicateCount: validCount - timeline.movements.length,
    totalMinutes: periods.reduce(
      (sum, period) => sum + period.durationMinutes,
      0,
    ),
  };
}
