export const ROOM_DAY_OPTIONS = [
  { value: 'COMPLETED_24H', labelKey: 'settings.system.roomCompletedDays', label: 'كل 24 ساعة مكتملة، بحد أدنى يوم (الافتراضي)' },
  { value: 'STARTED_24H', labelKey: 'settings.system.roomStartedDays', label: 'كل 24 ساعة أو جزء منها، بحد أدنى يوم' },
  { value: 'CALENDAR_NIGHTS', labelKey: 'settings.system.roomCalendarNights', label: 'ليالي المبيت حسب توقيت المنشأة، بحد أدنى يوم' },
] as const;
