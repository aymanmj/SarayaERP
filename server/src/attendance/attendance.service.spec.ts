import type { Prisma } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('approved paid leave and payroll attendance', () => {
  it('excludes paid leave from absence but keeps other missed roster days', async () => {
    const day = new Date('2026-11-01T00:00:00Z');
    const otherDay = new Date('2026-11-02T00:00:00Z');
    const findMany = jest
      .fn<
        Promise<{ startDate: Date; endDate: Date }[]>,
        [Prisma.LeaveRequestFindManyArgs]
      >()
      .mockResolvedValue([{ startDate: day, endDate: day }]);
    const prisma = {
      attendanceRecord: { findMany: () => Promise.resolve([]) },
      employeeRoster: {
        findMany: () =>
          Promise.resolve([
            { date: day, isOffDay: false },
            { date: otherDay, isOffDay: false },
          ]),
      },
      leaveRequest: { findMany },
    } as unknown as PrismaService;
    const stats = await new AttendanceService(prisma).getEmployeeMonthlyStats(
      7,
      day,
      otherDay,
    );
    expect(stats.absentDays).toBe(1);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: 7,
      status: 'APPROVED',
      type: { not: 'UNPAID' },
    });
  });
});
