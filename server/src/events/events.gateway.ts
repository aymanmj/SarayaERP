import type { JwtPayload } from '../auth/jwt-payload.type';
// src/events/events.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../common/vault/vault.service';
import { PrismaService } from '../prisma/prisma.service';
import { hasNursingSocketRead } from '../nursing/nursing-socket-access';
import {
  hasStaffSessionClaims,
  staffSessionFilter,
} from '../auth/staff-session-lock';
import {
  matchesStaffSocketScope,
  readStaffSocketCookie,
  staffSocketOptions,
} from '../websocket/staff-socket-options';

@WebSocketGateway(staffSocketOptions)
export class EventsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private staffRevalidationTimer?: NodeJS.Timeout;
  private revalidating = false;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    @Optional() private vaultService?: VaultService,
  ) {}

  afterInit() {
    this.staffRevalidationTimer = setInterval(() => {
      void this.revalidateStaffSockets();
    }, 15000);
    this.staffRevalidationTimer.unref();
  }

  onModuleDestroy() {
    if (this.staffRevalidationTimer) clearInterval(this.staffRevalidationTimer);
  }

  async revalidateStaffSockets() {
    if (this.revalidating || !this.server) return;
    const sockets = [
      ...this.server.sockets.sockets.values(),
      ...this.server.of('/nursing').sockets.values(),
    ].flatMap((socket) => {
      const identity = socket.data as {
        sessionId?: string;
        userId: number;
        hospitalId: number;
        authVersion: number;
        branchVersion: number;
        roles: string[];
        requiresNursingRead?: boolean;
      };
      return identity.sessionId
        ? [{ socket, identity, sessionId: identity.sessionId }]
        : [];
    });
    if (!sockets.length) return;
    this.revalidating = true;
    try {
      for (let offset = 0; offset < sockets.length; offset += 250) {
        const chunk = sockets.slice(offset, offset + 250);
        const sessions = await this.prisma.staffSession.findMany({
          where: {
            id: { in: [...new Set(chunk.map(({ sessionId }) => sessionId))] },
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: {
            user: {
              select: {
                isActive: true,
                isDeleted: true,
                authVersion: true,
                hospitalId: true,
                hospital: { select: { isActive: true } },
                accessibleHospitals: {
                  where: { hospital: { isActive: true } },
                  select: { hospitalId: true },
                },
                userRoles: {
                  select: {
                    role: {
                      select: {
                        name: true,
                        rolePermissions: {
                          select: { permission: { select: { code: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const byId = new Map(sessions.map((session) => [session.id, session]));
        for (const { socket, identity, sessionId } of chunk) {
          const session = byId.get(sessionId);
          const user = session?.user;
          const nursingAccess =
            !identity.requiresNursingRead ||
            (!!user &&
              hasNursingSocketRead(
                user.userRoles.map(({ role }) => role.name),
                user.userRoles.flatMap(({ role }) =>
                  role.rolePermissions.map(({ permission }) => permission.code),
                ),
              ));
          const validBranch =
            user?.hospitalId === identity.hospitalId
              ? user.hospital.isActive
              : user?.accessibleHospitals.some(
                  ({ hospitalId }) => hospitalId === identity.hospitalId,
                );
          if (
            !session ||
            session.userId !== identity.userId ||
            session.activeBranchId !== identity.hospitalId ||
            session.branchVersion !== identity.branchVersion ||
            session.authVersion !== identity.authVersion ||
            !user?.isActive ||
            user.isDeleted ||
            user.authVersion !== identity.authVersion ||
            !validBranch ||
            !nursingAccess ||
            user.userRoles.length !== identity.roles.length ||
            user.userRoles.some(
              ({ role }) => !identity.roles.includes(role.name),
            )
          )
            socket.disconnect(false);
        }
      }
    } catch {
      this.logger.warn(
        'Staff socket revalidation unavailable; closing unverified connections',
      );
      for (const { socket } of sockets) socket.disconnect(false);
    } finally {
      this.revalidating = false;
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token: unknown =
        readStaffSocketCookie(client.handshake.headers?.cookie) ||
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;
      if (typeof token !== 'string' || !token) {
        this.logger.warn(`Client ${client.id} has no token, disconnecting...`);
        client.disconnect();
        return;
      }

      const cleanToken = token.replace(/^Bearer\s+/i, '');
      const decoded = this.jwtService.decode<{ header?: { kid?: string } }>(
        cleanToken,
        { complete: true },
      );
      const secret = this.vaultService
        ? await this.vaultService.getKeyOrSecret(decoded?.header?.kid)
        : this.config.get<string>('JWT_SECRET');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        cleanToken,
        {
          secret,
          issuer: 'saraya-staff',
          algorithms: ['HS256'],
        },
      );

      if (
        !matchesStaffSocketScope(client.handshake.auth?.staffScope, payload) ||
        !hasStaffSessionClaims(payload) ||
        !Number.isSafeInteger(payload.sub) ||
        payload.sub <= 0 ||
        !Number.isSafeInteger(payload.hospitalId) ||
        payload.hospitalId <= 0
      ) {
        this.logger.warn(
          `Client ${client.id} has invalid claims, disconnecting...`,
        );
        client.disconnect();
        return;
      }

      // Verify active user & hospital in DB (never trust stale JWT claims)
      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          isActive: true,
          isDeleted: false,
          OR: [
            { hospitalId: payload.hospitalId, hospital: { isActive: true } },
            {
              accessibleHospitals: {
                some: {
                  hospitalId: payload.hospitalId,
                  hospital: { isActive: true },
                },
              },
            },
          ],
        },
        include: {
          userRoles: {
            include: { role: true },
          },
          hospital: { select: { isActive: true } },
        },
      });

      if (!user || (payload.authVersion ?? 0) !== (user.authVersion ?? 0)) {
        this.logger.warn(
          `Socket auth rejected: User ${payload.sub} inactive, deleted, or hospital disabled`,
        );
        client.disconnect();
        return;
      }
      const sessionWhere = staffSessionFilter(
        payload.sid,
        user.id,
        payload.hospitalId,
        user.authVersion ?? 0,
        payload.branchVersion,
      );
      if (
        !(await this.prisma.staffSession.findFirst({
          where: sessionWhere,
          select: { id: true },
        }))
      ) {
        client.disconnect(true);
        return;
      }

      const activeRoles = user.userRoles.map((ur) => ur.role.name);

      // Join isolated hospital role rooms
      for (const role of activeRoles) {
        const roomName = `HOSPITAL_${payload.hospitalId}:ROLE_${role}`;
        await client.join(roomName);
        this.logger.debug(`User ${payload.sub} joined room: ${roomName}`);
      }

      // Join user-specific isolated room
      await client.join(`HOSPITAL_${payload.hospitalId}:USER_${payload.sub}`);

      // Join hospital-wide broadcast room
      await client.join(`HOSPITAL_${payload.hospitalId}:ALL`);

      await client.join(`STAFF_USER:${user.id}`);
      await client.join(`STAFF_SESSION:${payload.sid}`);
      await client.join(
        `STAFF_SESSION:${payload.sid}:BRANCH:${payload.branchVersion}`,
      );
      const current = await this.prisma.user.findFirst({
        where: {
          id: user.id,
          isActive: true,
          isDeleted: false,
          OR: [
            { hospitalId: payload.hospitalId, hospital: { isActive: true } },
            {
              accessibleHospitals: {
                some: {
                  hospitalId: payload.hospitalId,
                  hospital: { isActive: true },
                },
              },
            },
          ],
        },
        select: { authVersion: true },
      });
      if (
        !current ||
        (current.authVersion ?? 0) !== (payload.authVersion ?? 0) ||
        !(await this.prisma.staffSession.findFirst({
          where: sessionWhere,
          select: { id: true },
        }))
      ) {
        client.disconnect(true);
        return;
      }
      client.data = {
        sessionId: payload.sid,
        branchVersion: payload.branchVersion,
        authVersion: user.authVersion ?? 0,
        userId: user.id,
        hospitalId: payload.hospitalId,
        roles: activeRoles,
      };

      this.logger.log(
        `✅ Socket Connected: ${client.id} (User: ${payload.sub}, Hospital: ${payload.hospitalId})`,
      );
    } catch (e: any) {
      this.logger.error(`Socket auth failed: ${e.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Socket Disconnected: ${client.id}`);
  }

  // --- Real-time Security Invalidation Handlers (SEC04) ---

  @OnEvent('user.deactivated')
  handleUserDeactivated(payload: { hospitalId: number; userId: number }) {
    if (!payload?.hospitalId || !payload?.userId) return;
    this.logger.warn(
      `🔒 Security Invalidation: Disconnecting user ${payload.userId} in hospital ${payload.hospitalId}`,
    );
    const room = `STAFF_USER:${payload.userId}`;
    this.disconnectStaffRoom(room);
  }

  @OnEvent('user.roles_updated')
  handleUserRolesUpdated(payload: { hospitalId: number; userId: number }) {
    if (!payload?.hospitalId || !payload?.userId) return;
    this.logger.warn(
      `🔄 Privilege Change: Disconnecting user ${payload.userId} in hospital ${payload.hospitalId} for re-auth`,
    );
    const room = `STAFF_USER:${payload.userId}`;
    this.disconnectStaffRoom(room);
  }

  @OnEvent('auth.session_invalidated')
  handleSessionInvalidated(payload: { hospitalId: number; userId: number }) {
    if (!payload?.hospitalId || !payload?.userId) return;
    this.logger.warn(
      `🚪 Session Revoked: Disconnecting user ${payload.userId} in hospital ${payload.hospitalId}`,
    );
    const room = `STAFF_USER:${payload.userId}`;
    this.disconnectStaffRoom(room);
  }

  @OnEvent('auth.branch_access_revoked')
  handleBranchAccessRevoked(payload: { hospitalId: number; userId: number }) {
    if (!payload?.hospitalId || !payload?.userId) return;
    this.disconnectStaffRoom(
      `HOSPITAL_${payload.hospitalId}:USER_${payload.userId}`,
    );
  }

  @OnEvent('auth.device_session_invalidated')
  handleDeviceSessionInvalidated({ sessionId }: { sessionId: string }) {
    this.disconnectStaffRoom(`STAFF_SESSION:${sessionId}`);
  }

  @OnEvent('auth.device_branch_changed')
  handleDeviceBranchChanged({
    sessionId,
    branchVersion,
  }: {
    sessionId: string;
    branchVersion: number;
  }) {
    this.disconnectStaffRoom(
      `STAFF_SESSION:${sessionId}:BRANCH:${branchVersion}`,
    );
  }

  private disconnectStaffRoom(room: string) {
    this.server?.in(room).disconnectSockets(false);
    this.server?.of('/nursing').in(room).disconnectSockets(false);
  }

  // --- Clinical & Financial Hospital Notifications ---

  @OnEvent('invoice.issued')
  handleInvoiceIssued(payload: {
    hospitalId?: number;
    invoiceId?: number;
    totalAmount?: number;
  }) {
    if (
      typeof payload?.hospitalId !== 'number' ||
      !Number.isSafeInteger(payload.hospitalId) ||
      payload.hospitalId <= 0
    )
      return;
    this.logger.log(`🔔 Notification: Invoice #${payload.invoiceId ?? ''}`);

    this.server
      .to(
        ['ROLE_CASHIER', 'ROLE_ACCOUNTANT', 'ROLE_ADMIN'].map(
          (role) => `HOSPITAL_${payload.hospitalId}:${role}`,
        ),
      )
      .emit('notification', {
        title: 'فاتورة جديدة',
        message: `تم إصدار فاتورة بقيمة ${payload.totalAmount ?? ''} د.ل`,
        type: 'INFO',
        link: `/billing/invoices/${payload.invoiceId ?? ''}`,
      });
  }

  @OnEvent('pharmacy.dispense_completed')
  handleDispense(payload: { hospitalId?: number; dispenseRecordId?: number }) {
    if (
      typeof payload?.hospitalId !== 'number' ||
      !Number.isSafeInteger(payload.hospitalId) ||
      payload.hospitalId <= 0
    )
      return;
    this.logger.log(
      `🔔 Notification: Dispense #${payload.dispenseRecordId ?? ''}`,
    );

    this.server
      .to(
        ['ROLE_STORE_KEEPER', 'ROLE_PHARMACIST', 'ROLE_ADMIN'].map(
          (role) => `HOSPITAL_${payload.hospitalId}:${role}`,
        ),
      )
      .emit('notification', {
        title: 'صرف أدوية',
        message: 'تم صرف الوصفة وتحديث المخزون',
        type: 'WARNING',
      });
  }

  @OnEvent('lab.order_created')
  handleLabOrder(payload: {
    hospitalId?: number;
    orderId?: number;
    patientName?: string;
    testsCount?: number;
  }) {
    if (
      typeof payload?.hospitalId !== 'number' ||
      !Number.isSafeInteger(payload.hospitalId) ||
      payload.hospitalId <= 0
    )
      return;
    this.logger.log(`🔔 Notification: Lab Order #${payload.orderId ?? ''}`);

    this.server
      .to(
        ['ROLE_LAB_TECH', 'ROLE_ADMIN', 'ROLE_DOCTOR'].map(
          (role) => `HOSPITAL_${payload.hospitalId}:${role}`,
        ),
      )
      .emit('notification', {
        title: 'طلب تحليل جديد',
        message: `المريض: ${payload.patientName ?? ''} - عدد التحاليل: ${payload.testsCount ?? ''}`,
        type: 'INFO',
        link: '/lab/',
      });
  }

  @OnEvent('radiology.order_created')
  handleRadiologyOrder(payload: {
    hospitalId?: number;
    orderId?: number;
    patientName?: string;
    studyName?: string;
  }) {
    if (
      typeof payload?.hospitalId !== 'number' ||
      !Number.isSafeInteger(payload.hospitalId) ||
      payload.hospitalId <= 0
    )
      return;
    this.logger.log(
      `🔔 Notification: Radiology Order #${payload.orderId ?? ''}`,
    );

    this.server
      .to(
        ['ROLE_CASHIER', 'ROLE_ACCOUNTANT', 'ROLE_ADMIN'].map(
          (role) => `HOSPITAL_${payload.hospitalId}:${role}`,
        ),
      )
      .emit('notification', {
        title: 'طلب أشعة جديد',
        message: `المريض: ${payload.patientName ?? ''} - الفحص: ${payload.studyName ?? ''}`,
        type: 'INFO',
        link: '/cashier',
      });
  }

  // --- Nursing & CLMA Events (UI14 / CAP03 / SEC04) ---

  @OnEvent('nursing.medication_administered')
  handleMedicationAdministered(payload: {
    hospitalId: number;
    encounterId: number;
    performerId: number;
    administrationId: number;
    prescriptionItemId: number;
    drugName?: string;
    status: string;
    administeredAt: Date;
  }) {
    if (!payload?.hospitalId) return;
    this.server
      .to([
        `HOSPITAL_${payload.hospitalId}:ROLE_NURSE`,
        `HOSPITAL_${payload.hospitalId}:ROLE_DOCTOR`,
        `HOSPITAL_${payload.hospitalId}:ROLE_ADMIN`,
      ])
      .emit('nursing:medication_update', {
        encounterId: payload.encounterId,
        drugName: payload.drugName,
        status: payload.status,
        administeredAt: payload.administeredAt,
      });
  }

  @OnEvent('clinical.variance.clma')
  handleClmaVariance(payload: {
    hospitalId: number;
    encounterId: number;
    performerId: number;
    varianceReason?: string;
    prescribedBarcode?: string;
    scannedBarcode?: string;
    administrationId: number;
  }) {
    if (!payload?.hospitalId) return;
    this.server
      .to([
        `HOSPITAL_${payload.hospitalId}:ROLE_ADMIN`,
        `HOSPITAL_${payload.hospitalId}:ROLE_NURSE`,
      ])
      .emit('notification', {
        title: '⚠️ تجاوز مطابقة دوائية (CLMA Override)',
        message: `سُجّل تجاوز للتحقق في إجراء دوائي. السبب: ${payload.varianceReason || 'غير محدد'}`,
        type: 'WARNING',
        link: `/nursing/encounters/${payload.encounterId}`,
      });
  }

  @OnEvent('nursing.medication.overdue')
  handleMedicationOverdue(payload: {
    hospitalId: number;
    encounterId: number;
    overdueCount: number;
    items: { drug: string; scheduled: Date }[];
  }) {
    if (!payload?.hospitalId) return;
    this.server
      .to([
        `HOSPITAL_${payload.hospitalId}:ROLE_NURSE`,
        `HOSPITAL_${payload.hospitalId}:ROLE_ADMIN`,
      ])
      .emit('notification', {
        title: '⏰ تنبيه: أدوية متأخرة الإعطاء',
        message: `يوجد ${payload.overdueCount} أدوية متأخرة عن موعدها للحالة #${payload.encounterId}`,
        type: 'WARNING',
        link: `/nursing/encounters/${payload.encounterId}`,
      });
  }
}
