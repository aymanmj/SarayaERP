/**
 * Patient Portal — Secure Messaging Service
 * 
 * Enables HIPAA-compliant communication between patients and doctors.
 * All messages are patient-scoped (data isolation enforced).
 * 
 * Polling-first approach (30s intervals) — WebSocket upgrade planned.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PortalMessagingService {
  private readonly logger = new Logger(PortalMessagingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Send a message from a patient to a doctor.
   * Creates a new thread or continues an existing one.
   */
  async sendMessage(
    patientId: number,
    hospitalId: number,
    dto: {
      doctorId: number;
      subject?: string;
      body: string;
      threadId?: string;
    },
  ) {
    // Verify the doctor exists and belongs to the same hospital
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: dto.doctorId,
        hospitalId,
        isDoctor: true,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, fullName: true },
    });

    if (!doctor) {
      throw new BadRequestException('الطبيب المحدد غير متاح');
    }

    // If threadId provided, verify it belongs to this patient
    if (dto.threadId) {
      const existingThread = await this.prisma.patientMessage.findFirst({
        where: { threadId: dto.threadId, patientId },
      });
      if (!existingThread) {
        throw new NotFoundException('المحادثة غير موجودة');
      }
    }

    const message = await this.prisma.patientMessage.create({
      data: {
        patientId,
        doctorId: dto.doctorId,
        hospitalId,
        direction: 'PATIENT_TO_DOCTOR',
        subject: dto.subject,
        body: dto.body,
        threadId: dto.threadId, // If undefined, Prisma will use the @default(uuid())
      },
      include: {
        doctor: { select: { id: true, fullName: true } },
      },
    });

    this.logger.log(
      `💬 Message sent: Patient/${patientId} → Doctor/${dto.doctorId} [Thread: ${message.threadId}]`,
    );

    return message;
  }

  /**
   * Get all message threads for a patient.
   * Returns the latest message per thread with unread count.
   */
  async getThreads(patientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Get distinct threads with their latest message
    const threads = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (m."threadId")
        m."threadId",
        m."subject",
        m."body",
        m."direction",
        m."isRead",
        m."createdAt",
        m."doctorId",
        u."fullName" AS "doctorName",
        (
          SELECT COUNT(*)::int 
          FROM "PatientMessage" unread 
          WHERE unread."threadId" = m."threadId" 
          AND unread."patientId" = ${patientId}
          AND unread."isRead" = false
          AND unread."direction" = 'DOCTOR_TO_PATIENT'
        ) AS "unreadCount"
      FROM "PatientMessage" m
      LEFT JOIN "User" u ON u."id" = m."doctorId"
      WHERE m."patientId" = ${patientId}
      ORDER BY m."threadId", m."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${skip}
    `;

    const totalCountResult = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT "threadId")::int AS count
      FROM "PatientMessage"
      WHERE "patientId" = ${patientId}
    `;

    const totalCount = totalCountResult[0]?.count || 0;

    return {
      items: threads,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  /**
   * Get all messages within a specific thread.
   */
  async getThreadMessages(patientId: number, threadId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    // Verify thread belongs to patient
    const threadExists = await this.prisma.patientMessage.findFirst({
      where: { threadId, patientId },
    });

    if (!threadExists) {
      throw new NotFoundException('المحادثة غير موجودة');
    }

    const where = { threadId, patientId };
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.patientMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          doctor: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.patientMessage.count({ where }),
    ]);

    // Auto-mark incoming messages as read
    await this.prisma.patientMessage.updateMany({
      where: {
        threadId,
        patientId,
        direction: 'DOCTOR_TO_PATIENT',
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    return {
      items,
      meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
    };
  }

  /**
   * Mark a specific message as read.
   */
  async markAsRead(patientId: number, messageId: number) {
    const message = await this.prisma.patientMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.patientId !== patientId) {
      throw new NotFoundException('الرسالة غير موجودة');
    }

    if (message.isRead) {
      return { message: 'مقروءة بالفعل' };
    }

    await this.prisma.patientMessage.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });

    return { message: 'تم التعليم كمقروء' };
  }

  /**
   * Get total unread message count for a patient.
   * Used for notification badge in the portal/app.
   */
  async getUnreadCount(patientId: number) {
    const count = await this.prisma.patientMessage.count({
      where: {
        patientId,
        direction: 'DOCTOR_TO_PATIENT',
        isRead: false,
      },
    });

    return { unreadCount: count };
  }
}
