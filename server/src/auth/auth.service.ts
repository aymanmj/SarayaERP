import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../common/vault/vault.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { LoginLockoutStore } from '../common/security/redis-throttler.storage';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from './jwt-payload.type';
import {
  invalidateStaffSessions,
  lockActiveStaffBranch,
  lockStaffUser,
  hasStaffSessionClaims,
  revokeStaffDevice,
  staffSessionFilter,
} from './staff-session-lock';
import {
  buildOtpAuthUri,
  generateBase32Secret,
  verifyTotpCode,
} from './totp.util';

type FailedLoginAttempt = {
  count: number;
  firstFailedAt: number;
  lockedUntil: number;
};

const LOGIN_LOCKOUT_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly failedAttempts = new Map<string, FailedLoginAttempt>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private vaultService: VaultService,
    private readonly events: EventEmitter2,
    @Optional() private readonly encryptionService?: EncryptionService,
    @Optional() private readonly lockoutStore?: LoginLockoutStore,
  ) {}

  private isLockoutDisabled(): boolean {
    return (
      process.env.DISABLE_THROTTLER === 'true' &&
      process.env.NODE_ENV !== 'production'
    );
  }

  private async assertNotLockedOut(usernameKey: string): Promise<void> {
    if (this.isLockoutDisabled()) return;
    if (this.lockoutStore) {
      if (await this.lockoutStore.isLockedOut(usernameKey)) {
        throw new UnauthorizedException(
          'تم قفل الحساب مؤقتاً بعد عدة محاولات دخول فاشلة. يرجى المحاولة لاحقاً.',
        );
      }
      return;
    }
    const entry = this.failedAttempts.get(usernameKey);
    if (!entry) return;
    const now = Date.now();
    if (entry.lockedUntil > now) {
      throw new UnauthorizedException(
        'تم قفل الحساب مؤقتاً بعد عدة محاولات دخول فاشلة. يرجى المحاولة لاحقاً.',
      );
    }
    if (now - entry.firstFailedAt > LOGIN_LOCKOUT_WINDOW_MS) {
      this.failedAttempts.delete(usernameKey);
    }
  }

  private async recordFailedLogin(usernameKey: string): Promise<void> {
    if (this.isLockoutDisabled()) return;
    if (this.lockoutStore) {
      await this.lockoutStore.recordFailure(usernameKey);
      return;
    }
    const now = Date.now();
    const prev = this.failedAttempts.get(usernameKey);
    if (!prev || now - prev.firstFailedAt > LOGIN_LOCKOUT_WINDOW_MS) {
      this.failedAttempts.set(usernameKey, {
        count: 1,
        firstFailedAt: now,
        lockedUntil: 0,
      });
      return;
    }
    const nextCount = prev.count + 1;
    this.failedAttempts.set(usernameKey, {
      count: nextCount,
      firstFailedAt: prev.firstFailedAt,
      lockedUntil:
        nextCount >= LOGIN_LOCKOUT_MAX_ATTEMPTS
          ? now + LOGIN_LOCKOUT_DURATION_MS
          : 0,
    });
  }

  private async clearFailedLogin(usernameKey: string): Promise<void> {
    if (this.lockoutStore) {
      await this.lockoutStore.clear(usernameKey);
    }
    this.failedAttempts.delete(usernameKey);
  }

  // التحقق من المستخدم (تسجيل الدخول)
  async validateUser(username: string, password: string, mfaCode?: string) {
    const usernameKey = username.trim().toLowerCase();
    await this.assertNotLockedOut(usernameKey);

    const user = await this.prisma.user.findUnique({
      where: { username },
      omit: { passwordHash: false, mfaSecret: false },
      include: {
        hospital: {
          include: {
            organization: { select: { id: true, code: true, name: true } },
          },
        },
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
        // ✅ Multi-Branch: جلب كل الفروع التي يملك المستخدم وصولاً إليها
        accessibleHospitals: {
          include: {
            hospital: {
              select: {
                id: true,
                code: true,
                name: true,
                displayName: true,
                isActive: true,
              },
            },
          },
          orderBy: { isDefault: 'desc' },
        },
      },
    });

    if (!user || !user.isActive || user.isDeleted) {
      await this.recordFailedLogin(usernameKey);
      throw new UnauthorizedException('بيانات غير صحيحة');
    }
    if (!user.hospital?.isActive) {
      await this.recordFailedLogin(usernameKey);
      throw new UnauthorizedException('المنشأة غير مفعلة');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await this.recordFailedLogin(usernameKey);
      throw new UnauthorizedException('بيانات غير صحيحة');
    }

    if (user.mfaEnabled) {
      if (!mfaCode || !mfaCode.trim()) {
        throw new UnauthorizedException('MFA_REQUIRED');
      }
      const decryptedSecret = user.mfaSecret
        ? this.encryptionService?.decrypt(user.mfaSecret) || user.mfaSecret
        : '';
      if (!decryptedSecret || !verifyTotpCode(decryptedSecret, mfaCode)) {
        await this.recordFailedLogin(usernameKey);
        throw new UnauthorizedException('رمز التحقق الثنائي (2FA) غير صحيح');
      }
    }

    await this.clearFailedLogin(usernameKey);

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    // ✅ Multi-Tenancy: استخراج organizationId من المستشفى
    const organizationId = user.hospital?.organizationId || null;
    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    // ✅ Multi-Branch: بناء قائمة الفروع المتاحة
    // نضيف الفرع الافتراضي (hospitalId) تلقائياً إن لم يكن موجوداً في القائمة
    const accessibleBranches = (user.accessibleHospitals || [])
      .filter((a) => a.hospital.isActive)
      .map((a) => ({
        id: a.hospital.id,
        code: a.hospital.code,
        name: a.hospital.displayName || a.hospital.name,
        isDefault: a.isDefault,
      }));

    // إذا لم تكن هناك سجلات في UserHospitalAccess بعد، أضف الفرع الحالي كفرع وحيد
    if (accessibleBranches.length === 0) {
      accessibleBranches.push({
        id: user.hospital.id,
        code: user.hospital.code,
        name: user.hospital.displayName || user.hospital.name,
        isDefault: true,
      });
    }

    return {
      ...user,
      roles,
      permissions,
      organizationId,
      isSuperAdmin,
      accessibleBranches,
    };
  }

  // توليد Access Token
  async generateAccessToken(user: {
    sid: string;
    branchVersion: number;
    id: number;
    username: string;
    roles: string[];
    permissions: string[];
    hospitalId: number;
    organizationId?: number | null;
    isSuperAdmin?: boolean;
    authVersion?: number;
  }) {
    // Keep the signed cookie JWT under RFC 6265's 4096-byte browser limit:
    // JwtStrategy.validate(), EventsGateway, and NursingGateway always reload
    // authoritative roles & permissions from PostgreSQL, while login() returns
    // full user.permissions in the JSON response body for the UI.
    void user.permissions;
    const payload = {
      sid: user.sid,
      branchVersion: user.branchVersion,
      authVersion: user.authVersion ?? 0,
      sub: user.id,
      username: user.username,
      roles: user.roles,
      hospitalId: user.hospitalId,
      organizationId: user.organizationId || null, // ✅ Multi-Tenancy
      isSuperAdmin: user.isSuperAdmin || false, // ✅ Multi-Tenancy
      permissions: [] as string[],
    };

    const kid = this.vaultService.getActiveKeyId();
    const secret = await this.vaultService.getKeyOrSecret(kid);

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: '15m',
      issuer: 'saraya-staff', // Enforce Token Isolation
      header: { kid, alg: 'HS256' },
    });
  }

  // التحقق من التوكن
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const decoded: unknown = this.jwtService.decode(token, {
        complete: true,
      });
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        !('header' in decoded) ||
        !decoded.header ||
        typeof decoded.header !== 'object'
      ) {
        return null;
      }

      const rawKid = (decoded.header as { kid?: unknown }).kid;
      const kid = typeof rawKid === 'string' ? rawKid : undefined;
      const secret = await this.vaultService.getKeyOrSecret(kid);

      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
        issuer: 'saraya-staff', // Token Segregation Validation
      });
    } catch {
      return null;
    }
  }

  private async prepareRefreshToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);
    return { token, hashedToken };
  }

  private async storeRefreshToken(
    tx: Prisma.TransactionClient,
    user: { id: number; authVersion: number },
    activeBranchId: number,
    sessionId: string,
    expiresAt: Date,
    prepared: { token: string; hashedToken: string },
  ) {
    const record = await tx.refreshToken.create({
      data: {
        userId: user.id,
        activeBranchId,
        authVersion: user.authVersion,
        sessionId,
        hashedToken: prepared.hashedToken,
        expiresAt,
      },
      select: { id: true },
    });
    return `${record.id}.${prepared.token}`;
  }

  async login(username: string, password: string, mfaCode?: string) {
    const user = await this.validateUser(username, password, mfaCode);
    const prepared = await this.prepareRefreshToken();
    const tokens = await this.prisma.$transaction(async (tx) => {
      const current = await lockStaffUser(tx, user.id);
      if (
        !current?.isActive ||
        current.isDeleted ||
        current.passwordHash !== user.passwordHash ||
        current.authVersion !== user.authVersion ||
        current.hospitalId !== user.hospitalId
      )
        throw new UnauthorizedException(
          'تغيّرت بيانات الحساب؛ أعد تسجيل الدخول',
        );
      const branch = await lockActiveStaffBranch(
        tx,
        current,
        current.hospitalId,
      );
      if (!branch) throw new UnauthorizedException('المنشأة غير مفعلة');
      const session = await tx.staffSession.create({
        data: {
          userId: current.id,
          authVersion: current.authVersion,
          activeBranchId: branch.id,
          expiresAt: this.nextExpiry(),
        },
      });
      const accessToken = await this.generateAccessToken({
        ...user,
        sid: session.id,
        branchVersion: session.branchVersion,
        organizationId: branch.organizationId,
      });
      return {
        accessToken,
        refreshToken: await this.storeRefreshToken(
          tx,
          current,
          branch.id,
          session.id,
          session.expiresAt,
          prepared,
        ),
      };
    });
    const {
      passwordHash: credentialHash,
      mfaSecret: storedMfaSecret,
      ...safeUser
    } = user;
    void credentialHash;
    void storedMfaSecret;
    return {
      ...tokens,
      user: safeUser,
      accessibleBranches: user.accessibleBranches,
    };
  }

  async setupMfa(actor: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { id: true, username: true, isActive: true, isDeleted: true },
    });
    if (!user || !user.isActive || user.isDeleted) {
      throw new UnauthorizedException('المستخدم غير نشط');
    }

    const secret = generateBase32Secret();
    const encryptedSecret = this.encryptionService
      ? this.encryptionService.encrypt(secret)
      : secret;

    await this.prisma.user.update({
      where: { id: actor.sub },
      data: {
        mfaSecret: encryptedSecret,
        mfaEnabled: false,
      },
    });

    return {
      secret,
      otpauthUrl: buildOtpAuthUri({
        issuer: 'SarayaERP',
        accountName: user.username,
        secret,
      }),
    };
  }

  async enableMfa(actor: JwtPayload, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { id: true, mfaSecret: true, isActive: true, isDeleted: true },
    });
    if (!user || !user.isActive || user.isDeleted || !user.mfaSecret) {
      throw new UnauthorizedException('يرجى بدء إعداد التحقق الثنائي أولاً');
    }

    const plainSecret = this.encryptionService
      ? this.encryptionService.decrypt(user.mfaSecret)
      : user.mfaSecret;
    if (!plainSecret || !verifyTotpCode(plainSecret, code)) {
      throw new UnauthorizedException('رمز التحقق الثنائي (2FA) غير صحيح');
    }

    await this.prisma.user.update({
      where: { id: actor.sub },
      data: { mfaEnabled: true, mfaVerifiedAt: new Date() },
    });

    return { mfaEnabled: true };
  }

  async disableMfa(actor: JwtPayload, password: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: {
        id: true,
        passwordHash: true,
        mfaEnabled: true,
        mfaSecret: true,
        isActive: true,
        isDeleted: true,
      },
    });
    if (!user || !user.isActive || user.isDeleted) {
      throw new UnauthorizedException('المستخدم غير نشط');
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('كلمة المرور غير صحيحة');
    }
    if (user.mfaEnabled && user.mfaSecret) {
      const plainSecret = this.encryptionService
        ? this.encryptionService.decrypt(user.mfaSecret)
        : user.mfaSecret;
      if (!plainSecret || !verifyTotpCode(plainSecret, code)) {
        throw new UnauthorizedException('رمز التحقق الثنائي (2FA) غير صحيح');
      }
    }

    await this.prisma.user.update({
      where: { id: actor.sub },
      data: { mfaEnabled: false, mfaSecret: null, mfaVerifiedAt: null },
    });

    return { mfaEnabled: false };
  }

  switchBranch(
    actor: JwtPayload,
    targetHospitalId: number,
    refreshToken: string,
  ) {
    return this.rotateRefreshToken(refreshToken, { actor, targetHospitalId });
  }

  async logout(actor: JwtPayload, allDevices = false) {
    const user = await this.prisma.$transaction(async (tx) => {
      const { user: locked, session } = await this.lockCurrentSession(
        tx,
        actor,
      );
      if (allDevices) await invalidateStaffSessions(tx, actor.sub);
      else await revokeStaffDevice(tx, actor.sub, session.id);
      return locked;
    });
    if (allDevices) this.emitSessionInvalidated(user);
    else
      this.events.emit('auth.device_session_invalidated', {
        sessionId: actor.sid,
      });
    return true;
  }

  async getMfaStatus(actor: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { mfaEnabled: true, mfaVerifiedAt: true },
    });
    return {
      mfaEnabled: Boolean(user?.mfaEnabled),
      mfaVerifiedAt: user?.mfaVerifiedAt ?? null,
    };
  }

  async listDeviceSessions(actor: JwtPayload) {
    const [sessions, userAccount] = await Promise.all([
      this.prisma.staffSession.findMany({
        where: {
          userId: actor.sub,
          authVersion: actor.authVersion,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          activeBranchId: true,
          createdAt: true,
          lastRenewedAt: true,
        },
        orderBy: [{ lastRenewedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.user.findUnique({
        where: { id: actor.sub },
        select: { mfaEnabled: true },
      }),
    ]);
    const branches = await this.prisma.hospital.findMany({
      where: {
        id: {
          in: [...new Set(sessions.map((session) => session.activeBranchId))],
        },
        isActive: true,
        OR: [
          { users: { some: { id: actor.sub } } },
          { userAccesses: { some: { userId: actor.sub } } },
        ],
      },
      select: { id: true, name: true, displayName: true },
    });
    const names = new Map(
      branches.map((branch) => [branch.id, branch.displayName || branch.name]),
    );
    return {
      userId: actor.sub,
      mfaEnabled: Boolean(userAccount?.mfaEnabled),
      sessions: sessions.map(({ activeBranchId, ...session }) => ({
        ...session,
        branchName: names.get(activeBranchId) ?? null,
        current: session.id === actor.sid,
      })),
    };
  }

  async revokeOtherDevice(actor: JwtPayload, sessionId: string) {
    const revoked = await this.prisma.$transaction(async (tx) => {
      const { session } = await this.lockCurrentSession(tx, actor);
      if (session.id === sessionId)
        throw new ConflictException(
          'استخدم تسجيل الخروج لإنهاء الجلسة الحالية',
        );
      return revokeStaffDevice(tx, actor.sub, sessionId);
    });
    if (revoked)
      this.events.emit('auth.device_session_invalidated', { sessionId });
  }

  private async lockCurrentSession(
    tx: Prisma.TransactionClient,
    actor: JwtPayload,
  ) {
    if (!hasStaffSessionClaims(actor))
      throw new UnauthorizedException('الجلسة غير صالحة');
    const user = await lockStaffUser(tx, actor.sub);
    if (
      !user?.isActive ||
      user.isDeleted ||
      user.authVersion !== actor.authVersion
    )
      throw new UnauthorizedException('الجلسة غير صالحة');
    if (!(await lockActiveStaffBranch(tx, user, actor.hospitalId)))
      throw new UnauthorizedException('صلاحية الوصول إلى الفرع غير سارية');
    const session = await tx.staffSession.findFirst({
      where: staffSessionFilter(
        actor.sid,
        actor.sub,
        actor.hospitalId,
        user.authVersion,
        actor.branchVersion,
      ),
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException('الجلسة غير صالحة');
    return { user, session };
  }

  async refreshTokens(incomingRt: string) {
    const { accessToken, refreshToken, currentBranch, userId } =
      await this.rotateRefreshToken(incomingRt);
    return { accessToken, refreshToken, hospitalId: currentBranch.id, userId };
  }

  private async rotateRefreshToken(
    incomingRt: string,
    branchSwitch?: { actor: JwtPayload; targetHospitalId: number },
  ) {
    const format = /^([1-9]\d{0,9})\.([0-9a-f]{64})$/.exec(incomingRt);
    if (!format || Number(format[1]) > 2147483647)
      throw new ForbiddenException('Invalid Token Format');
    const id = Number(format[1]);
    const proof = await this.prisma.refreshToken.findUnique({
      where: { id },
      select: { userId: true, hashedToken: true },
    });
    if (
      !proof ||
      (branchSwitch && proof.userId !== branchSwitch.actor.sub) ||
      !(await bcrypt.compare(format[2], proof.hashedToken))
    )
      throw new ForbiddenException('Invalid Token');
    const prepared = await this.prepareRefreshToken();
    const result = await this.prisma.$transaction(async (tx) => {
      // Logout and branch changes acquire the same user lock before changing sessions.
      const current = await lockStaffUser(tx, proof.userId);
      if (!current?.isActive || current.isDeleted)
        throw new ForbiddenException('الجلسة غير صالحة');
      const ticket = await tx.refreshToken.findUnique({
        where: { id },
        include: {
          session: true,
          user: {
            select: {
              username: true,
              userRoles: {
                include: {
                  role: {
                    include: {
                      rolePermissions: { include: { permission: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (
        !ticket ||
        ticket.userId !== current.id ||
        ticket.hashedToken !== proof.hashedToken ||
        ticket.authVersion !== current.authVersion ||
        !ticket.session ||
        ticket.session.userId !== current.id ||
        ticket.session.authVersion !== current.authVersion ||
        ticket.session.revokedAt !== null ||
        ticket.session.expiresAt.getTime() <= Date.now() ||
        ticket.expiresAt.getTime() <= Date.now() ||
        (branchSwitch &&
          (branchSwitch.actor.hospitalId !== ticket.activeBranchId ||
            branchSwitch.actor.sid !== ticket.session.id ||
            branchSwitch.actor.authVersion !== current.authVersion))
      )
        throw new ForbiddenException('الجلسة غير صالحة أو منتهية');

      const activeBranch = await lockActiveStaffBranch(
        tx,
        current,
        ticket.activeBranchId,
      );
      if (!activeBranch)
        throw new ForbiddenException('صلاحية الوصول إلى الفرع غير سارية');
      if (ticket.revoked) {
        if (ticket.replacedByToken !== 'ROTATED')
          throw new ForbiddenException('الجلسة ملغاة');
        if (Date.now() - ticket.updatedAt.getTime() < 10000)
          throw new ConflictException('AUTH_REFRESH_CONFLICT');
        await revokeStaffDevice(tx, current.id, ticket.session.id);
        return { invalidated: ticket.session.id } as const;
      }
      if (
        ticket.activeBranchId !== ticket.session.activeBranchId ||
        (branchSwitch &&
          branchSwitch.actor.branchVersion !== ticket.session.branchVersion)
      )
        throw new ForbiddenException('تغير فرع الجلسة');

      const branch =
        !branchSwitch || branchSwitch.targetHospitalId === activeBranch.id
          ? activeBranch
          : await lockActiveStaffBranch(
              tx,
              current,
              branchSwitch.targetHospitalId,
            );
      if (!branch)
        throw new ForbiddenException('لا يوجد تصريح للوصول إلى الفرع المطلوب');

      const roles = ticket.user.userRoles.map(({ role }) => role.name);
      const permissions = [
        ...new Set(
          ticket.user.userRoles.flatMap(({ role }) =>
            role.rolePermissions.map(({ permission }) => permission.code),
          ),
        ),
      ];
      await tx.refreshToken.update({
        where: { id },
        data: { revoked: true, replacedByToken: 'ROTATED' },
      });
      const changedBranch = branch.id !== activeBranch.id;
      const session = await tx.staffSession.update({
        where: { id: ticket.session.id },
        data: {
          ...(changedBranch
            ? { activeBranchId: branch.id, branchVersion: { increment: 1 } }
            : {}),
          expiresAt: this.nextExpiry(),
          lastRenewedAt: new Date(),
        },
      });
      const refreshToken = await this.storeRefreshToken(
        tx,
        current,
        branch.id,
        session.id,
        session.expiresAt,
        prepared,
      );
      const accessToken = await this.generateAccessToken({
        sid: session.id,
        branchVersion: session.branchVersion,
        id: current.id,
        authVersion: current.authVersion,
        username: ticket.user.username,
        roles,
        permissions,
        hospitalId: branch.id,
        organizationId: branch.organizationId,
        isSuperAdmin: roles.includes('SUPER_ADMIN'),
      });
      return {
        accessToken,
        refreshToken,
        userId: current.id,
        previousBranch: changedBranch
          ? {
              sessionId: session.id,
              branchVersion: ticket.session.branchVersion,
            }
          : null,
        currentBranch: {
          id: branch.id,
          code: branch.code,
          name: branch.displayName || branch.name,
        },
      };
    });
    if (typeof result.invalidated === 'string') {
      this.events.emit('auth.device_session_invalidated', {
        sessionId: result.invalidated,
      });
      throw new ForbiddenException('Token Reuse Detected - Access Revoked');
    }
    if (result.previousBranch)
      this.events.emit('auth.device_branch_changed', result.previousBranch);
    return result;
  }

  private nextExpiry() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  private emitSessionInvalidated(user: { id: number; hospitalId: number }) {
    this.events.emit('auth.session_invalidated', {
      hospitalId: user.hospitalId,
      userId: user.id,
    });
  }
}
