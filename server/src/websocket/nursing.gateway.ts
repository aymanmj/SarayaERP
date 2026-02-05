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
    // Get medications due in next 2 hours
    const twoHoursFromNow = new Date();
    twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

    const pendingMeds = await this.prisma.prescriptionItem.findMany({
      where: {
        prescription: {
          hospitalId,
          status: 'ACTIVE',
        },
        // Add logic for scheduled medications
      },
      include: {
        prescription: {
          include: {
            patient: { select: { fullName: true, mrn: true } },
            encounter: { select: { id: true } },
          },
        },
        product: { select: { name: true } },
      },
      take: 10, // Limit for performance
    });

    return pendingMeds;
  }

  private async getCriticalAlerts(hospitalId: number) {
    // For now, return empty array as patientAlert table doesn't exist
    // In production, this should query from a proper alerts/notifications table
    const criticalAlerts = [];
    
    // Alternative: Check for critical vitals or medication issues
    // This is a placeholder implementation
    try {
      // You could check for critical vitals here
      // Or check for overdue medications
      // Or check for other critical patient data
    } catch (error) {
      console.error('Error getting critical alerts:', error);
    }

    return criticalAlerts;
  }

  private async checkMedicationReminders(hospitalId: number, encounterId: number) {
    // Check if there are upcoming medications for this patient
    const upcomingMeds = await this.getPendingMedications(hospitalId);
    
    const patientMeds = upcomingMeds.filter(
      med => med.prescription.encounterId === encounterId
    );

    if (patientMeds.length > 0) {
      this.server.to(`hospital-${hospitalId}`).emit('medication_reminder', {
        encounterId,
        medications: patientMeds,
        message: `There are ${patientMeds.length} upcoming medications for this patient`,
      });
    }
  }

  private async checkCriticalVitals(hospitalId: number, encounterId: number, vitals: any) {
    // Check for critical values
    const criticalValues: string[] = [];

    if (vitals.bloodPressure?.systolic > 180 || vitals.bloodPressure?.systolic < 90) {
      criticalValues.push('Blood Pressure');
    }
    if (vitals.heartRate > 120 || vitals.heartRate < 50) {
      criticalValues.push('Heart Rate');
    }
    if (vitals.temperature > 39 || vitals.temperature < 35) {
      criticalValues.push('Temperature');
    }
    if (vitals.oxygenSaturation < 90) {
      criticalValues.push('Oxygen Saturation');
    }

    if (criticalValues.length > 0) {
      // Get patient info
      const patient = await this.prisma.encounter.findUnique({
        where: { id: encounterId },
        include: {
          patient: { select: { fullName: true, mrn: true } },
        },
      });

      this.server.to(`hospital-${hospitalId}`).emit('critical_vitals_alert', {
        encounterId,
        patientName: patient?.patient.fullName,
        criticalValues,
        vitals,
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
