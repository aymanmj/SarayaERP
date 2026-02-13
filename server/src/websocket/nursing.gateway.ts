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
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  namespace: '/nursing',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true, // Important for cookies
  },
})
export class NursingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedNurses = new Map<number, Socket>(); // userId -> socket

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      console.log('🔌 WebSocket connection attempt...');
      
      const cookie = client.handshake.headers.cookie;
      const token = this.extractToken(cookie);

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

      const user = {
        id: payload.sub,
        hospitalId: payload.hospitalId,
        username: payload.username,
        roles: payload.roles,
      };

      // Store connection
      this.connectedNurses.set(user.id, client);
      client.data.userId = user.id;
      client.data.hospitalId = user.hospitalId;

      console.log(`✅ User ${user.username} (ID: ${user.id}) connected to nursing station`);

      // Join hospital room
      await client.join(`hospital-${user.hospitalId}`);

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

  private extractToken(cookieString?: string): string | null {
    if (!cookieString) return null;
    const match = cookieString.match(/Authentication=([^;]+)/);
    return match ? match[1] : null;
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const hospitalId = client.data.hospitalId;

    if (userId && hospitalId) {
      this.connectedNurses.delete(userId);
      
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
    const hospitalId = client.data.hospitalId;
    await client.join(`hospital-${hospitalId}-ward-${data.wardId}`);
    
    // Send ward-specific data
    await this.sendWardData(client, hospitalId, data.wardId);
  }

  @SubscribeMessage('medication_administered')
  async handleMedicationAdministered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      encounterId: number;
      medicationName: string;
      administeredBy: string;
      status: string;
    },
  ) {
    const hospitalId = client.data.hospitalId;
    
    // Broadcast to all nurses in hospital
    this.server.to(`hospital-${hospitalId}`).emit('medication_update', {
      type: 'administered',
      encounterId: data.encounterId,
      medication: data.medicationName,
      administeredBy: data.administeredBy,
      status: data.status,
      timestamp: new Date().toISOString(),
    });

    // Check for medication reminders
    await this.checkMedicationReminders(hospitalId, data.encounterId);
  }

  @SubscribeMessage('vitals_updated')
  async handleVitalsUpdated(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      encounterId: number;
      vitals: any;
      nurseName: string;
    },
  ) {
    const hospitalId = client.data.hospitalId;
    
    // Broadcast vitals update
    this.server.to(`hospital-${hospitalId}`).emit('vitals_update', {
      type: 'vitals_updated',
      encounterId: data.encounterId,
      vitals: data.vitals,
      nurseName: data.nurseName,
      timestamp: new Date().toISOString(),
    });

    // Check for critical vitals
    await this.checkCriticalVitals(hospitalId, data.encounterId, data.vitals);
  }

  @SubscribeMessage('patient_alert')
  async handlePatientAlert(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      encounterId: number;
      alertType: 'CRITICAL' | 'WARNING' | 'INFO';
      message: string;
      patientName: string;
    },
  ) {
    const hospitalId = client.data.hospitalId;
    
    // Broadcast alert to all nurses
    this.server.to(`hospital-${hospitalId}`).emit('patient_alert', {
      type: data.alertType,
      encounterId: data.encounterId,
      patientName: data.patientName,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Helper methods
  private async verifyToken(token: string): Promise<any> {
    // Implement JWT verification logic
    // This is simplified - in production, use proper JWT verification
    try {
      // For demo purposes, return mock user
      return {
        id: 1,
        fullName: 'Demo Nurse',
        role: 'NURSE',
        hospitalId: 1,
      };
    } catch {
      return null;
    }
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

  private async sendWardData(client: Socket, hospitalId: number, wardId: number) {
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
          if (now - lastAdmin > 20 * 60 * 60 * 1000) { isDue = true; reason = 'Daily dose due'; }
          break;
        case 'BID':
          // Due if last admin > 10 hours
          if (now - lastAdmin > 10 * 60 * 60 * 1000) { isDue = true; reason = 'BID dose due'; }
          break;
        case 'TID':
           // Due if last admin > 6 hours
           if (now - lastAdmin > 6 * 60 * 60 * 1000) { isDue = true; reason = 'TID dose due'; }
           break;
        case 'QID':
           // Due if last admin > 4 hours
           if (now - lastAdmin > 4 * 60 * 60 * 1000) { isDue = true; reason = 'QID dose due'; }
           break;
        case 'ONCE':
           if (lastAdmin === 0) { isDue = true; reason = 'One-time dose not given'; }
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
            type: 'IPD',    // Only inpatients
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
                 include: { bed: { select: { bedNumber: true, ward: { select: { name: true } } } } }
              }
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const vital of recentVitals) {
        const issues: string[] = [];
        
        // Temperature > 38.5 or < 35
        if (vital.temperature && (Number(vital.temperature) > 38.5 || Number(vital.temperature) < 35.0)) {
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
        if (vital.bpSystolic && (vital.bpSystolic > 180 || vital.bpSystolic < 90)) {
           issues.push(`BP: ${vital.bpSystolic}/${vital.bpDiastolic}`);
        }

        if (issues.length > 0) {
          criticalAlerts.push({
            type: 'CRITICAL',
            patientName: vital.encounter.patient.fullName,
            mrn: vital.encounter.patient.mrn,
            location: vital.encounter.bedAssignments[0]?.bed?.bedNumber || 'Unknown Bed',
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

  private async checkMedicationReminders(hospitalId: number, encounterId: number) {
     // Triggered after specific med updates or scheduled checks
     // Implementation can reuse getPendingMedications logic
  }

  private async checkCriticalVitals(hospitalId: number, encounterId: number, vitals: any) {
    // Check for critical values immediately upon update
    const criticalValues: string[] = [];

    if (vitals.bpSystolic && (vitals.bpSystolic > 180 || vitals.bpSystolic < 90)) {
      criticalValues.push(`BP ${vitals.bpSystolic}/${vitals.bpDiastolic}`);
    }
    if (vitals.pulse && (vitals.pulse > 120 || vitals.pulse < 50)) {
      criticalValues.push(`HR ${vitals.pulse}`);
    }
    if (vitals.temperature && (vitals.temperature > 39 || vitals.temperature < 35)) {
      criticalValues.push(`Temp ${vitals.temperature}`);
    }
    if (vitals.o2Sat && vitals.o2Sat < 90) {
      criticalValues.push(`SpO2 ${vitals.o2Sat}%`);
    }

    if (criticalValues.length > 0) {
      // Get patient info
      const encounter = await this.prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          patient: { select: { fullName: true, mrn: true } },
        },
      });

      this.server.to(`hospital-${hospitalId}`).emit('patient_alert', {
        type: 'CRITICAL',
        encounterId,
        patientName: encounter?.patient.fullName,
        message: `Critical Vitals Detected: ${criticalValues.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Public method for other services to emit events
  public broadcastToHospital(hospitalId: number, event: string, data: any) {
    this.server.to(`hospital-${hospitalId}`).emit(event, data);
  }

  public broadcastToWard(hospitalId: number, wardId: number, event: string, data: any) {
    this.server.to(`hospital-${hospitalId}-ward-${wardId}`).emit(event, data);
  }
}
