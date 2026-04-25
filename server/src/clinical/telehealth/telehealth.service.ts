import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../../common/vault/vault.service';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

@Injectable()
export class TelehealthService {
  private readonly logger = new Logger(TelehealthService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private vaultService: VaultService,
  ) {}

  /**
   * Initializes a telehealth session for a given appointment.
   * Called automatically when the patient checks in, or manually by the doctor.
   */
  async createSession(appointmentId: number) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { telehealthSession: true, doctor: true, patient: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.telehealthSession) {
      return appointment.telehealthSession; // Return existing
    }

    if (appointment.type !== 'ONLINE') {
      throw new BadRequestException('Appointment is not a virtual consultation');
    }

    // Generate secure randomized tokens for host and guest
    const hostToken = crypto.randomBytes(32).toString('hex');
    const guestToken = crypto.randomBytes(32).toString('hex');
    const roomName = `saraya-room-${appointmentId}-${crypto.randomBytes(4).toString('hex')}`;
    const baseUrl = this.configService.get<string>('TELEHEALTH_DOMAIN', 'https://meet.sarayamed.com');
    const roomUrl = `${baseUrl}/${roomName}`;

    const session = await this.prisma.telehealthSession.create({
      data: {
        appointmentId,
        hostToken,
        guestToken,
        roomUrl,
        status: 'SCHEDULED',
      },
    });

    this.logger.log(`Telehealth session initialized for Appointment ${appointmentId}`);
    return session;
  }

  /**
   * Generate a JWT for Jitsi Meet authentication
   */
  private async generateJitsiToken(roomName: string, user: { name: string, email: string, isModerator: boolean }) {
    const jitsiAppId = await this.vaultService.getOptionalSecret('JITSI_APP_ID') || 'saraya-jitsi-app';
    const jitsiSecret = await this.vaultService.getOptionalSecret('JITSI_APP_SECRET') || 'default-jitsi-secret-override-in-vault';

    const payload = {
      context: {
        user: {
          name: user.name,
          email: user.email,
          affiliation: user.isModerator ? 'owner' : 'member',
        },
      },
      aud: 'jitsi',
      iss: jitsiAppId,
      sub: '*',
      room: roomName,
    };

    return jwt.sign(payload, jitsiSecret, { expiresIn: '2h', algorithm: 'HS256' });
  }

  /**
   * Patient enters the waiting room
   */
  async enterWaitingRoom(appointmentId: number, patientId: number) {
    const session = await this.prisma.telehealthSession.findUnique({
      where: { appointmentId },
      include: { appointment: { include: { patient: true } } },
    });

    if (!session || session.appointment.patientId !== patientId) {
      throw new NotFoundException('Session not found or access denied');
    }

    const updatedSession = await this.prisma.telehealthSession.update({
      where: { id: session.id },
      data: { status: 'WAITING' },
    });

    // Notify doctor (via websockets in future)
    this.logger.log(`Patient ${patientId} entered virtual waiting room for Appointment ${appointmentId}`);

    return {
      status: updatedSession.status,
      message: 'You are now in the virtual waiting room. Please wait for the doctor.',
      roomUrl: null, // Room URL is hidden until doctor starts the session
    };
  }

  /**
   * Doctor starts the session, allowing the patient to enter the actual room
   */
  async startSession(appointmentId: number, doctorId: number) {
    const session = await this.prisma.telehealthSession.findUnique({
      where: { appointmentId },
      include: { appointment: { include: { doctor: true } } },
    });

    if (!session || session.appointment.doctorId !== doctorId) {
      throw new NotFoundException('Session not found or access denied');
    }

    const updatedSession = await this.prisma.telehealthSession.update({
      where: { id: session.id },
      data: { 
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    // Generate JWT for the Doctor (Moderator)
    const roomName = updatedSession.roomUrl!.split('/').pop()!;
    const token = await this.generateJitsiToken(roomName, {
      name: session.appointment.doctor!.username,
      email: `${session.appointment.doctor!.username}@saraya.local`,
      isModerator: true,
    });

    return {
      status: updatedSession.status,
      roomUrl: `${updatedSession.roomUrl}?jwt=${token}`,
    };
  }

  /**
   * Patient polls to get the actual room URL once the doctor starts the session
   */
  async getPatientRoomAccess(appointmentId: number, patientId: number) {
    const session = await this.prisma.telehealthSession.findUnique({
      where: { appointmentId },
      include: { appointment: { include: { patient: true } } },
    });

    if (!session || session.appointment.patientId !== patientId) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'IN_PROGRESS') {
      return { status: session.status, roomUrl: null };
    }

    // Generate JWT for the Patient (Guest)
    const roomName = session.roomUrl!.split('/').pop()!;
    const token = await this.generateJitsiToken(roomName, {
      name: session.appointment.patient!.fullName,
      email: session.appointment.patient!.email || `patient${patientId}@saraya.local`,
      isModerator: false,
    });

    return {
      status: session.status,
      roomUrl: `${session.roomUrl}?jwt=${token}`,
    };
  }
}
