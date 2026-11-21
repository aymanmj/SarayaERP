import type { Prisma } from '@prisma/client';

export async function lockStaffUser(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  const [user] = await tx.$queryRaw<
    {
      id: number;
      hospitalId: number;
      authVersion: number;
      isActive: boolean;
      isDeleted: boolean;
      passwordHash: string;
    }[]
  >`
    SELECT id, "hospitalId", "authVersion", "isActive", "isDeleted", "passwordHash"
    FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  return user;
}

export async function invalidateStaffSessions(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  await tx.$executeRaw`UPDATE "User" SET "authVersion" = "authVersion" + 1 WHERE id = ${userId}`;
  await tx.staffSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

export async function revokeStaffDevice(
  tx: Prisma.TransactionClient,
  userId: number,
  sessionId: string,
) {
  const result = await tx.staffSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count)
    await tx.refreshToken.updateMany({
      where: { userId, sessionId, revoked: false },
      data: { revoked: true },
    });
  return result.count === 1;
}

export function staffSessionFilter(
  sid: string,
  userId: number,
  hospitalId: number,
  authVersion: number,
  branchVersion: number,
) {
  return {
    id: sid,
    userId,
    activeBranchId: hospitalId,
    authVersion,
    branchVersion,
    revokedAt: null,
    expiresAt: { gt: new Date() },
  } satisfies Prisma.StaffSessionWhereInput;
}

export function hasStaffSessionClaims(payload: {
  sid?: string;
  branchVersion?: number;
}): payload is { sid: string; branchVersion: number } {
  return (
    typeof payload.sid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      payload.sid,
    ) &&
    typeof payload.branchVersion === 'number' &&
    Number.isSafeInteger(payload.branchVersion) &&
    payload.branchVersion >= 0 &&
    payload.branchVersion <= 2147483647
  );
}

export async function lockActiveStaffBranch(
  tx: Prisma.TransactionClient,
  user: { id: number; hospitalId: number },
  branchId: number,
) {
  if (branchId !== user.hospitalId) {
    const grants = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "UserHospitalAccess" WHERE "userId" = ${user.id} AND "hospitalId" = ${branchId}
      FOR SHARE
    `;
    if (!grants.length) return undefined;
  }
  const [branch] = await tx.$queryRaw<
    {
      id: number;
      code: string;
      name: string;
      displayName: string | null;
      organizationId: number | null;
    }[]
  >`
    SELECT id, code, name, "displayName", "organizationId" FROM "Hospital" WHERE id = ${branchId}
      AND "isActive" FOR SHARE
  `;
  return branch;
}
