import { BadRequestException } from '@nestjs/common';
import { Prisma, RoomDayPolicy, type SystemSetting } from '@prisma/client';

export const ROOM_POLICY_KEY = 'billing.roomDayPolicy';
export const ROOM_ZONE_KEY = 'billing.roomTimeZone';
export const DEFAULT_ROOM_ZONE = 'Africa/Tripoli';

export function parseRoomDayPolicy(value: unknown): RoomDayPolicy {
  if (
    typeof value !== 'string' ||
    !Object.values(RoomDayPolicy).includes(value as RoomDayPolicy)
  ) {
    throw new BadRequestException('طريقة احتساب أيام الإقامة غير صالحة');
  }
  return value as RoomDayPolicy;
}

export function parseRoomTimeZone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) {
    throw new BadRequestException('المنطقة الزمنية للإقامة غير صالحة');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.trim() }).format(
      new Date(0),
    );
  } catch {
    throw new BadRequestException(
      'يجب تحديد منطقة زمنية صحيحة، مثل Africa/Tripoli',
    );
  }
  return value.trim();
}

export function roomLocalDateOrdinal(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000;
}

/** Every policy has a one-day minimum; calendar nights count local midnight boundaries. */
export function roomBillableDays(
  start: Date,
  end: Date,
  policy: RoomDayPolicy,
  timeZone: string,
): number {
  const elapsed = end.getTime() - start.getTime();
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(elapsed) ||
    elapsed < 0
  ) {
    throw new BadRequestException('تاريخ الدخول غير صالح لاحتساب الإقامة');
  }
  parseRoomDayPolicy(policy);
  const zone = parseRoomTimeZone(timeZone);
  if (policy === RoomDayPolicy.CALENDAR_NIGHTS)
    return Math.max(
      1,
      roomLocalDateOrdinal(end, zone) - roomLocalDateOrdinal(start, zone),
    );
  const days = elapsed / 86_400_000;
  return Math.max(
    1,
    policy === RoomDayPolicy.STARTED_24H ? Math.ceil(days) : Math.floor(days),
  );
}

export function defaultRoomSettings(hospitalId: number): SystemSetting[] {
  return [
    {
      key: ROOM_POLICY_KEY,
      value: RoomDayPolicy.COMPLETED_24H,
      description:
        'طريقة احتساب أيام الإقامة للحالات الجديدة؛ لا تغير طريقة حساب الدخول القائم.',
    },
    {
      key: ROOM_ZONE_KEY,
      value: DEFAULT_ROOM_ZONE,
      description:
        'التوقيت المحلي لليالي المبيت للحالات الجديدة، مثل Africa/Tripoli. كل عبور لمنتصف الليل يعد ليلة، بحد أدنى يوم.',
    },
  ].map((setting) => ({
    ...setting,
    id: 0,
    hospitalId,
    type: 'STRING',
    group: 'BILLING',
    updatedAt: new Date(0),
  }));
}

export async function roomBillingConfiguration(
  prisma: Pick<Prisma.TransactionClient, 'systemSetting'>,
  hospitalId: number,
) {
  const settings = await prisma.systemSetting.findMany({
    where: { hospitalId, key: { in: [ROOM_POLICY_KEY, ROOM_ZONE_KEY] } },
  });
  return {
    roomBillingPolicy: parseRoomDayPolicy(
      settings.find((setting) => setting.key === ROOM_POLICY_KEY)?.value ??
        RoomDayPolicy.COMPLETED_24H,
    ),
    roomBillingTimeZone: parseRoomTimeZone(
      settings.find((setting) => setting.key === ROOM_ZONE_KEY)?.value ??
        DEFAULT_ROOM_ZONE,
    ),
  };
}
