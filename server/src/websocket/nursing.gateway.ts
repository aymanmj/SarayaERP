// src/websocket/nursing.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import type { VitalsRecordedEvent } from '../vitals/events/vitals-recorded.event';
import { NURSING_RECORD_RECEIVED } from './staff-realtime.bus';
import type { NursingRecordNotice } from '../nursing/nursing-notification-journal';
import { NursingNotificationService } from '../nursing/nursing-notification.service';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { hasNursingSocketRead } from '../nursing/nursing-socket-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  matchesStaffSocketScope,
  readStaffSocketCookie,
  staffSocketOptions,
} from './staff-socket-options';

@WebSocketGateway({
  ...staffSocketOptions,
  namespace: '/nursing',
})
export class NursingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Namespace;

  private readonly nextRecoveryAt = new WeakMap<Socket, number>();

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private jwtStrategy: JwtStrategy,
    private notifications: NursingNotificationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      console.log('🔌 WebSocket connection attempt...');

      const token = readStaffSocketCookie(client.handshake.headers.cookie);

      if (!token) {
        console.log('❌ No token found in cookies, disconnecting...');
        client.disconnect();
        return;
      }

      const payload = await this.authService.verifyToken(token);

      if (!payload) {
        console.log('❌ Invalid token, disconnecting...');
        client.disconnect();
        return;
      }

      const identity = await this.jwtStrategy.validate(payload);
      if (
        !matchesStaffSocketScope(client.handshake.auth?.staffScope, identity) ||
        !hasNursingSocketRead(identity.roles, identity.permissions)
      ) {
        client.disconnect();
        return;
      }
      const user = {
        id: identity.sub,
        hospitalId: identity.hospitalId,
        username: identity.username,
      };

      console.log(
        `✅ User ${user.username} (ID: ${user.id}) connected to nursing station`,
      );

      // Join hospital room
      await client.join(`hospital-${user.hospitalId}`);
      await client.join(`HOSPITAL_${user.hospitalId}:USER_${user.id}`);
      await client.join(`STAFF_USER:${user.id}`);
      await client.join(`STAFF_SESSION:${identity.sid}`);
      await client.join(
        `STAFF_SESSION:${identity.sid}:BRANCH:${identity.branchVersion}`,
      );
      client.data = {
        staffClaims: payload,
        sessionId: identity.sid,
        branchVersion: identity.branchVersion,
        authVersion: identity.authVersion,
        userId: user.id,
        hospitalId: user.hospitalId,
        roles: identity.roles,
        requiresNursingRead: true,
      };
      if (!(await this.currentNurse(client))) return;

      // Send initial data
      await this.sendInitialData(client, user.hospitalId);

      // Notify others
      client.to(`hospital-${user.hospitalId}`).emit('nurse_connected', {
        nurseId: user.id,
        nurseName: user.username,
      });
    } catch (error) {
      console.error('❌ Connection unauthorized:', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const hospitalId = client.data.hospitalId;

    if (userId && hospitalId) {
      // Notify others
      client.to(`hospital-${hospitalId}`).emit('nurse_disconnected', {
        nurseId: userId,
      });

      console.log(`Nurse ${userId} disconnected`);
    }
  }

  @SubscribeMessage('join_ward')
  async handleJoinWard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { wardId: number },
  ) {
    const identity = await this.currentNurse(client);
    if (!identity) return;
    const hospitalId = identity.hospitalId;
    await client.join(`hospital-${hospitalId}-ward-${data.wardId}`);

    // Send ward-specific data
    await this.sendWardData(client, hospitalId, data.wardId);
  }

  @OnEvent('nursing.medication_administered')
  publishMedicationRecord(event: {
    hospitalId: number;
    encounterId: number;
    administrationId: number;
  }) {
    return this.publishRecord({
      kind: 'medication',
      hospitalId: event.hospitalId,
      encounterId: event.encounterId,
      recordId: event.administrationId,
    });
  }

  @OnEvent('vitals.recorded')
  publishVitalRecord(
    event: Pick<
      VitalsRecordedEvent,
      'hospitalId' | 'encounterId' | 'vitalSignId'
    >,
  ) {
    return this.publishRecord({
      kind: 'vital',
      hospitalId: event.hospitalId,
      encounterId: event.encounterId,
      recordId: event.vitalSignId,
    });
  }

  @OnEvent(NURSING_RECORD_RECEIVED)
  async publishRecord(notice: NursingRecordNotice) {
    const room = `hospital-${notice.hospitalId}`;
    if (!notice.recordId || !this.server?.adapter.rooms.has(room)) return;
    const messages = await this.notifications.resolve(notice);
    for (const { event, payload } of messages)
      this.server.local.to(room).emit(event, payload);
  }

  @SubscribeMessage('recover_notifications')
  async recoverNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { after?: unknown } | undefined,
  ) {
    const after = data?.after;
    if (
      after !== null &&
      (typeof after !== 'string' ||
        !/^(0|[1-9]\d{0,18})$/.test(after) ||
        BigInt(after) > 9223372036854775807n)
    )
      return { error: 'invalid_cursor' };

    const now = Date.now();
    if ((this.nextRecoveryAt.get(client) ?? 0) > now) return { error: 'retry' };
    this.nextRecoveryAt.set(client, now + 250);

    const identity = await this.currentNurse(client);
    if (!identity) return { error: 'unauthorized' };
    try {
      const page = await this.notifications.recover(
        identity.hospitalId,
        after === null ? null : BigInt(after),
      );
      if (!(await this.currentNurse(client))) return { error: 'unauthorized' };
      return page;
    } catch {
      return { error: 'retry' };
    }
  }

  private async currentNurse(client: Socket) {
    const claims = (client.data as { staffClaims?: JwtPayload }).staffClaims;
    try {
      if (claims && client.connected) {
        const identity = await this.jwtStrategy.validate(claims);
        if (
          client.connected &&
          hasNursingSocketRead(identity.roles, identity.permissions)
        )
          return identity;
      }
    } catch {
      // Unverified or revoked sessions cannot issue nursing events.
    }
    client.disconnect();
    return null;
  }

  private async sendInitialData(client: Socket, hospitalId: number) {
    try {
      // Get current inpatients
      const inpatients = await this.prisma.encounter.findMany({
        where: {
          hospitalId,
          type: 'IPD',
          status: 'OPEN',
          bedAssignments: {
            some: { to: null },
          },
        },
        include: {
          patient: { select: { fullName: true, mrn: true } },
          bedAssignments: {
            where: { to: null },
            include: {
              bed: {
                include: {
                  ward: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });

      // Get pending medications
      const pendingMeds = await this.getPendingMedications(hospitalId);

      // Get critical alerts
      const criticalAlerts = await this.getCriticalAlerts(hospitalId);

      client.emit('initial_data', {
        inpatients,
        pendingMedications: pendingMeds,
        criticalAlerts,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  private async sendWardData(
    client: Socket,
    hospitalId: number,
    wardId: number,
  ) {
    try {
      const wardPatients = await this.prisma.encounter.findMany({
        where: {
          hospitalId,
          type: 'IPD',
          status: 'OPEN',
          bedAssignments: {
            some: {
              to: null,
              bed: { wardId },
            },
          },
        },
        include: {
          patient: { select: { fullName: true, mrn: true } },
          bedAssignments: {
            where: { to: null },
            include: {
              bed: { select: { bedNumber: true } },
            },
          },
        },
      });

      client.emit('ward_data', {
        wardId,
        patients: wardPatients,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error sending ward data:', error);
    }
  }

  private async getPendingMedications(hospitalId: number) {
    // Get ACTIVE prescriptions for current inpatients
    const activePrescriptions = await this.prisma.prescriptionItem.findMany({
      where: {
        prescription: {
          hospitalId,
          status: 'ACTIVE',
          encounter: {
            status: 'OPEN',
            type: 'IPD',
          },
        },
      },
      include: {
        product: { select: { name: true } },
        prescription: {
          include: {
            patient: { select: { fullName: true, mrn: true } },
            encounter: { select: { id: true } },
          },
        },
        administrations: {
          orderBy: { administeredAt: 'desc' },
          take: 1,
        },
      },
    });

    const pendingMeds: any[] = [];
    const now = Date.now();

    for (const item of activePrescriptions) {
      const lastAdmin = item.administrations[0]?.administeredAt
        ? new Date(item.administrations[0].administeredAt).getTime()
        : 0;

      let isDue = false;
      let reason = '';

      // Basic frequency logic
      switch (item.frequency) {
        case 'DAILY':
          // Due if last admin was > 20 hours ago (buffer allowed)
          if (now - lastAdmin > 20 * 60 * 60 * 1000) {
            isDue = true;
            reason = 'Daily dose due';
          }
          break;
        case 'BID':
          // Due if last admin > 10 hours
          if (now - lastAdmin > 10 * 60 * 60 * 1000) {
            isDue = true;
            reason = 'BID dose due';
          }
          break;
        case 'TID':
          // Due if last admin > 6 hours
          if (now - lastAdmin > 6 * 60 * 60 * 1000) {
            isDue = true;
            reason = 'TID dose due';
          }
          break;
        case 'QID':
          // Due if last admin > 4 hours
          if (now - lastAdmin > 4 * 60 * 60 * 1000) {
            isDue = true;
            reason = 'QID dose due';
          }
          break;
        case 'ONCE':
          if (lastAdmin === 0) {
            isDue = true;
            reason = 'One-time dose not given';
          }
          break;
      }

      if (isDue) {
        pendingMeds.push(item);
      }
    }

    return pendingMeds.slice(0, 20); // Limit return size
  }

  private async getCriticalAlerts(hospitalId: number) {
    const criticalAlerts: any[] = [];

    try {
      // 1. Check Vital Signs from the last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      const recentVitals = await this.prisma.vitalSign.findMany({
        where: {
          encounter: {
            hospitalId,
            status: 'OPEN', // Only open encounters
            type: 'IPD', // Only inpatients
          },
          createdAt: {
            gte: fourHoursAgo,
          },
        },
        include: {
          encounter: {
            include: {
              patient: { select: { fullName: true, mrn: true } },
              bedAssignments: {
                where: { to: null },
                include: {
                  bed: {
                    select: {
                      bedNumber: true,
                      ward: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const vital of recentVitals) {
        const issues: string[] = [];

        // Temperature > 38.5 or < 35
        if (
          vital.temperature &&
          (Number(vital.temperature) > 38.5 || Number(vital.temperature) < 35.0)
        ) {
          issues.push(`Temp: ${vital.temperature}°C`);
        }

        // O2 Sat < 92%
        if (vital.o2Sat && vital.o2Sat < 92) {
          issues.push(`SpO2: ${vital.o2Sat}%`);
        }

        // Heart Rate > 120 or < 50
        if (vital.pulse && (vital.pulse > 120 || vital.pulse < 50)) {
          issues.push(`HR: ${vital.pulse} bpm`);
        }

        // Systolic BP > 180 or < 90
        if (
          vital.bpSystolic &&
          (vital.bpSystolic > 180 || vital.bpSystolic < 90)
        ) {
          issues.push(`BP: ${vital.bpSystolic}/${vital.bpDiastolic}`);
        }

        if (issues.length > 0) {
          criticalAlerts.push({
            type: 'CRITICAL',
            vitalSignId: vital.id,
            patientName: vital.encounter.patient.fullName,
            mrn: vital.encounter.patient.mrn,
            location:
              vital.encounter.bedAssignments[0]?.bed?.bedNumber ||
              'Unknown Bed',
            message: `Abnormal Vitals: ${issues.join(', ')}`,
            timestamp: vital.createdAt.toISOString(),
            encounterId: vital.encounterId,
          });
        }
      }
    } catch (error) {
      console.error('Error getting critical alerts:', error);
    }

    return criticalAlerts;
  }

  // Public method for other services to emit events
  public broadcastToHospital(hospitalId: number, event: string, data: any) {
    this.server.to(`hospital-${hospitalId}`).emit(event, data);
  }

  public broadcastToWard(
    hospitalId: number,
    wardId: number,
    event: string,
    data: any,
  ) {
    this.server.to(`hospital-${hospitalId}-ward-${wardId}`).emit(event, data);
  }
}
