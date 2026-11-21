import type { Prisma } from '@prisma/client';

export type NursingRecordNotice = Pick<
  Prisma.NursingNotificationUncheckedCreateInput,
  'kind' | 'hospitalId' | 'encounterId' | 'recordId'
>;

export async function appendNursingNotification(
  tx: Prisma.TransactionClient,
  notice: NursingRecordNotice,
) {
  // Allocate the cursor while holding this hospital's lock until commit.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27018, ${notice.hospitalId}::int)`;
  await tx.nursingNotification.create({ data: notice, select: { id: true } });
}
