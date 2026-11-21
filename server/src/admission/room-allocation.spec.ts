import { RoomDayPolicy } from '@prisma/client';
import { allocateRoomDays, type PricedRoomStay } from './room-allocation';
import { Money } from '../common/utils/money.util';

describe('Room tariff allocation by actual occupancy', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const time = (hours: number) => new Date(start.getTime() + hours * 3600000);
  const stay = (
    id: number,
    from: number,
    to: number | null,
    price = '100.000',
  ): PricedRoomStay => ({
    id,
    from: time(from),
    to: to === null ? null : time(to),
    rate: {
      version: 1,
      serviceItemId: id,
      serviceName: 'Synthetic',
      dailyRate: price,
      priceListId: null,
      insurancePolicyId: null,
      capturedAt: time(from).toISOString(),
    },
  });
  const allocate = (
    hours: number,
    stays: PricedRoomStay[],
    policy: RoomDayPolicy = 'COMPLETED_24H',
  ) => allocateRoomDays(start, time(hours), policy, 'UTC', stays);
  it('allocates one completed day once across two wards instead of charging two full days', () => {
    const parts = allocate(30, [
      stay(1, 0, 6, '100.000'),
      stay(2, 6, null, '200.000'),
    ]);
    expect(parts.map((p) => p.amount)).toEqual(['25.000', '150.000']);
    expect(new Set(parts.map((p) => p.periodIndex)).size).toBe(1);
    expect(Money.sumDecimal(...parts.map((p) => p.amount)).toString()).toBe(
      '175',
    );
  });
  it('preserves the one-day minimum and shares it by observed occupied hours', () => {
    expect(
      allocate(6, [stay(1, 0, 2, '90.000'), stay(2, 2, null, '180.000')]).map(
        (p) => p.amount,
      ),
    ).toEqual(['30.000', '120.000']);
  });
  it('honors the one-day minimum at the exact occupied admission instant', () => {
    expect(allocate(0, [stay(1, 0, null)]).map((part) => part.amount)).toEqual([
      '100.000',
    ]);
  });
  it('leaves completed days stable as a later partial day grows', () => {
    const stays = [stay(1, 0, 12), stay(2, 12, null, '200.000')];
    expect(allocate(36, stays)).toEqual(allocate(47, stays));
    expect(
      allocate(48, stays)
        .filter((p) => p.periodIndex === 1)
        .map((p) => p.amount),
    ).toEqual(['200.000']);
  });
  it('counts a partial started day once and prorates its actual observed hours', () => {
    const parts = allocate(
      36,
      [stay(1, 0, 30), stay(2, 30, null, '200.000')],
      'STARTED_24H',
    );
    expect(parts.map((p) => [p.periodIndex, p.amount])).toEqual([
      [0, '100.000'],
      [1, '50.000'],
      [1, '100.000'],
    ]);
  });
  it('does not bill a released-bed gap or time before admission or after the observation', () => {
    expect(
      allocate(24, [stay(1, -3, 6), stay(2, 18, 30)]).map((p) => p.amount),
    ).toEqual(['25.000', '25.000']);
  });
  it('distributes rounding remainders deterministically and keeps the daily total exact', () => {
    const parts = allocate(24, [
      stay(3, 16, null, '0.001'),
      stay(2, 8, 16, '0.001'),
      stay(1, 0, 8, '0.001'),
    ]);
    expect(parts.map((p) => p.amount)).toEqual(['0.001', '0.000', '0.000']);
    expect(Money.sumDecimal(...parts.map((p) => p.amount)).toString()).toBe(
      '0.001',
    );
  });
  it("uses banker's rounding for the complete weighted day", () => {
    expect(
      allocate(24, [stay(1, 0, 12, '0.001'), stay(2, 12, null, '0.002')]).map(
        (p) => p.amount,
      ),
    ).toEqual(['0.001', '0.001']);
  });
  it('rejects overlapping or reversed historical occupancy instead of charging it twice', () => {
    expect(() => allocate(24, [stay(1, 0, 13), stay(2, 12, null)])).toThrow(
      'متداخل',
    );
    expect(() => allocate(24, [stay(1, 8, 2)])).toThrow('غير صالح');
  });
  it('requires a documented rate for every occupied part of a counted day', () => {
    const missing = stay(1, 0, null);
    missing.rate.dailyRate = null;
    missing.rate.serviceItemId = null;
    expect(() => allocate(24, [missing])).toThrow('بلا تعرفة');
  });
  it('counts calendar nights in the saved local timezone', () => {
    const entry = new Date('2026-11-01T21:00:00Z');
    const parts = allocateRoomDays(
      entry,
      new Date('2026-11-02T01:00:00Z'),
      'CALENDAR_NIGHTS',
      'Africa/Tripoli',
      [{ ...stay(1, 0, null), from: entry }],
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].periodEnd).toBe('2026-11-01T22:00:00.000Z');
    expect(parts[0].amount).toBe('100.000');
  });
  it.each([
    ['2026-03-07T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-10-31T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ])(
    'uses the actual local-day duration across DST from %s',
    (from, to, hours) => {
      const entry = new Date(from);
      const end = new Date(to);
      const parts = allocateRoomDays(
        entry,
        end,
        'CALENDAR_NIGHTS',
        'America/New_York',
        [{ ...stay(1, 0, null), from: entry }],
      );
      expect(parts).toHaveLength(2);
      expect(parts[1].periodMilliseconds).toBe(Number(hours) * 3600000);
      expect(parts.map((p) => p.amount)).toEqual(['100.000', '100.000']);
    },
  );
});
