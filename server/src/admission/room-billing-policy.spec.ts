import { RoomDayPolicy } from '@prisma/client';
import {
  parseRoomDayPolicy,
  parseRoomTimeZone,
  roomBillableDays,
} from './room-billing-policy';

describe('Room-day billing policies', () => {
  const start = new Date('2026-11-01T08:00:00.000Z');
  it.each<[RoomDayPolicy, number, number]>([
    [RoomDayPolicy.COMPLETED_24H, 0, 1],
    [RoomDayPolicy.COMPLETED_24H, 23, 1],
    [RoomDayPolicy.COMPLETED_24H, 24, 1],
    [RoomDayPolicy.COMPLETED_24H, 36, 1],
    [RoomDayPolicy.COMPLETED_24H, 48, 2],
    [RoomDayPolicy.COMPLETED_24H, 60, 2],
    [RoomDayPolicy.STARTED_24H, 0, 1],
    [RoomDayPolicy.STARTED_24H, 23, 1],
    [RoomDayPolicy.STARTED_24H, 24, 1],
    [RoomDayPolicy.STARTED_24H, 36, 2],
    [RoomDayPolicy.STARTED_24H, 48, 2],
    [RoomDayPolicy.STARTED_24H, 60, 3],
  ])(
    '%s after %s elapsed hours charges %s day(s)',
    (policy, hours, expected) => {
      expect(
        roomBillableDays(
          start,
          new Date(start.getTime() + hours * 3600000),
          policy,
          'Africa/Tripoli',
        ),
      ).toBe(expected);
    },
  );

  it('distinguishes an exact boundary from one millisecond of a started day', () => {
    const end = new Date(start.getTime() + 86400001);
    expect(
      roomBillableDays(start, end, RoomDayPolicy.COMPLETED_24H, 'UTC'),
    ).toBe(1);
    expect(roomBillableDays(start, end, RoomDayPolicy.STARTED_24H, 'UTC')).toBe(
      2,
    );
  });
  it('uses the admission timezone for calendar nights rather than the server clock', () => {
    const arrival = new Date('2026-11-01T21:30:00Z');
    const end = new Date('2026-11-02T22:15:00Z');
    expect(
      roomBillableDays(
        arrival,
        end,
        RoomDayPolicy.CALENDAR_NIGHTS,
        'Africa/Tripoli',
      ),
    ).toBe(2);
    expect(
      roomBillableDays(arrival, end, RoomDayPolicy.CALENDAR_NIGHTS, 'UTC'),
    ).toBe(1);
  });
  it('does not count a same-local-date stay as zero days', () => {
    expect(
      roomBillableDays(
        start,
        new Date('2026-11-01T12:00:00Z'),
        RoomDayPolicy.CALENDAR_NIGHTS,
        'Africa/Tripoli',
      ),
    ).toBe(1);
  });
  it.each([
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
  ])(
    'counts one local night across a DST boundary from %s to %s',
    (arrival, end) => {
      expect(
        roomBillableDays(
          new Date(arrival),
          new Date(end),
          RoomDayPolicy.CALENDAR_NIGHTS,
          'America/New_York',
        ),
      ).toBe(1);
    },
  );
  it('rejects invalid dates, reversed intervals, unknown policies and invalid timezones', () => {
    expect(() =>
      roomBillableDays(
        new Date('invalid'),
        start,
        RoomDayPolicy.COMPLETED_24H,
        'UTC',
      ),
    ).toThrow();
    expect(() =>
      roomBillableDays(
        start,
        new Date(start.getTime() - 1),
        RoomDayPolicy.COMPLETED_24H,
        'UTC',
      ),
    ).toThrow();
    expect(() => parseRoomDayPolicy('ROUND_WHATEVER')).toThrow();
    expect(() => parseRoomTimeZone('Mars/Medical')).toThrow();
  });
});
