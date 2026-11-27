// server/src/attendance/attendance-periods.engine.spec.ts
import { buildAttendanceTimeline } from './attendance-periods.engine';
import { calculateRawPeriods } from './biometric-hours.engine';

describe('AttendancePeriods & BiometricHours Engines', () => {
  it('debounces rapid punches within window and pairs IN -> TEMP_LEAVE -> RETURN -> OUT', () => {
    const timeline = buildAttendanceTimeline(
      [
        { id: 1, punchedAt: '2026-11-24T08:00:00.000Z' },
        { id: 2, punchedAt: '2026-11-24T08:01:30.000Z' }, // duplicate within 3m debounce
        { id: 3, punchedAt: '2026-11-24T12:00:00.000Z' },
        { id: 4, punchedAt: '2026-11-24T13:00:00.000Z' },
        { id: 5, punchedAt: '2026-11-24T17:00:00.000Z' },
      ],
      3,
    );

    expect(timeline).not.toBeNull();
    expect(timeline!.movements).toHaveLength(4);
    expect(timeline!.movements.map((m) => m.movementType)).toEqual([
      'CHECK_IN',
      'TEMP_LEAVE',
      'RETURN',
      'CHECK_OUT',
    ]);
    expect(timeline!.periods).toHaveLength(2);
    expect(timeline!.workHours).toBe(8);
  });

  it('reports incomplete odd punch issues in calculateRawPeriods', () => {
    const res = calculateRawPeriods(
      [
        {
          id: 10,
          punchedAt: new Date('2026-11-24T08:00:00.000Z'),
          declaredType: 'IN',
        },
        {
          id: 11,
          punchedAt: new Date('2026-11-24T12:00:00.000Z'),
          declaredType: 'OUT',
        },
        {
          id: 12,
          punchedAt: new Date('2026-11-24T13:30:00.000Z'),
          declaredType: 'IN',
        },
      ],
      3,
    );

    expect(res.periods).toHaveLength(1);
    expect(res.totalMinutes).toBe(240);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].punchId).toBe(12);
  });
});
