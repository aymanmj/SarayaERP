/**
 * Portal Messaging Service — Unit Tests
 *
 * Tests:
 * - Send message (patient → doctor) with doctor validation
 * - Thread ownership enforcement (data isolation)
 * - Get threads with unread count
 * - Get thread messages with auto-mark-read
 * - Mark message as read (data isolation)
 * - Unread count
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalMessagingService } from './portal-messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PortalMessagingService', () => {
  let service: PortalMessagingService;
  let prisma: any;

  const mockPrisma = {
    user: { findFirst: jest.fn() },
    patientMessage: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalMessagingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PortalMessagingService>(PortalMessagingService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  SEND MESSAGE
  // ===========================================
  describe('sendMessage', () => {
    it('should send message to a valid doctor in the same hospital', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 5, fullName: 'د. محمد',
      });
      mockPrisma.patientMessage.create.mockResolvedValue({
        id: 1,
        patientId: 1,
        doctorId: 5,
        hospitalId: 1,
        direction: 'PATIENT_TO_DOCTOR',
        body: 'مرحباً دكتور',
        threadId: 'thread-uuid-1',
        doctor: { id: 5, fullName: 'د. محمد' },
      });

      const result = await service.sendMessage(1, 1, {
        doctorId: 5,
        body: 'مرحباً دكتور',
      });

      expect(result.id).toBe(1);
      expect(result.direction).toBe('PATIENT_TO_DOCTOR');
      expect(result.threadId).toBe('thread-uuid-1');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 5,
            hospitalId: 1,
            isDoctor: true,
            isActive: true,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should REJECT sending message to non-existent or inactive doctor', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(1, 1, { doctorId: 999, body: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT sending to a doctor from a different hospital', async () => {
      // findFirst returns null because hospitalId doesn't match
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(1, 1, { doctorId: 5, body: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should continue existing thread when threadId is valid and belongs to patient', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 5, fullName: 'Dr. X' });
      mockPrisma.patientMessage.findFirst.mockResolvedValue({
        id: 10, threadId: 'existing-thread', patientId: 1,
      });
      mockPrisma.patientMessage.create.mockResolvedValue({
        id: 2,
        threadId: 'existing-thread',
        body: 'ردي',
        direction: 'PATIENT_TO_DOCTOR',
        doctor: { id: 5, fullName: 'Dr. X' },
      });

      const result = await service.sendMessage(1, 1, {
        doctorId: 5,
        body: 'ردي',
        threadId: 'existing-thread',
      });

      expect(result.threadId).toBe('existing-thread');
    });

    it('should REJECT sending to a thread owned by another patient', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 5, fullName: 'Dr. X' });
      // Thread does NOT belong to patient 1
      mockPrisma.patientMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(1, 1, {
          doctorId: 5,
          body: 'test',
          threadId: 'other-patient-thread',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  GET THREAD MESSAGES
  // ===========================================
  describe('getThreadMessages', () => {
    it('should return messages and auto-mark incoming as read', async () => {
      mockPrisma.patientMessage.findFirst.mockResolvedValue({
        id: 1, threadId: 'thread-1', patientId: 1,
      });
      mockPrisma.$transaction.mockResolvedValue([
        [
          { id: 1, body: 'hello', direction: 'PATIENT_TO_DOCTOR', doctor: { id: 5, fullName: 'Dr.' } },
          { id: 2, body: 'reply', direction: 'DOCTOR_TO_PATIENT', doctor: { id: 5, fullName: 'Dr.' } },
        ],
        2,
      ]);
      mockPrisma.patientMessage.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.getThreadMessages(1, 'thread-1');

      expect(result.items).toHaveLength(2);
      expect(result.meta.totalCount).toBe(2);
      // Verify auto-mark-read was called for doctor-to-patient messages
      expect(mockPrisma.patientMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            threadId: 'thread-1',
            patientId: 1,
            direction: 'DOCTOR_TO_PATIENT',
            isRead: false,
          }),
        }),
      );
    });

    it('should REJECT access to a thread not owned by the patient', async () => {
      mockPrisma.patientMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.getThreadMessages(1, 'other-thread'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  MARK AS READ
  // ===========================================
  describe('markAsRead', () => {
    it('should mark a message as read for owning patient', async () => {
      mockPrisma.patientMessage.findUnique.mockResolvedValue({
        id: 10, patientId: 1, isRead: false,
      });
      mockPrisma.patientMessage.update.mockResolvedValue({ id: 10, isRead: true });

      const result = await service.markAsRead(1, 10);
      expect(result.message).toContain('مقروء');
    });

    it('should return early for already-read message', async () => {
      mockPrisma.patientMessage.findUnique.mockResolvedValue({
        id: 10, patientId: 1, isRead: true,
      });

      const result = await service.markAsRead(1, 10);
      expect(result.message).toContain('مقروءة');
      expect(mockPrisma.patientMessage.update).not.toHaveBeenCalled();
    });

    it('should REJECT marking message of another patient as read', async () => {
      mockPrisma.patientMessage.findUnique.mockResolvedValue({
        id: 10, patientId: 999, isRead: false,
      });

      await expect(service.markAsRead(1, 10)).rejects.toThrow(NotFoundException);
    });

    it('should REJECT marking non-existent message', async () => {
      mockPrisma.patientMessage.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  UNREAD COUNT
  // ===========================================
  describe('getUnreadCount', () => {
    it('should return correct unread count for patient', async () => {
      mockPrisma.patientMessage.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(1);

      expect(result.unreadCount).toBe(7);
      expect(mockPrisma.patientMessage.count).toHaveBeenCalledWith({
        where: {
          patientId: 1,
          direction: 'DOCTOR_TO_PATIENT',
          isRead: false,
        },
      });
    });

    it('should return 0 when no unread messages', async () => {
      mockPrisma.patientMessage.count.mockResolvedValue(0);

      const result = await service.getUnreadCount(1);
      expect(result.unreadCount).toBe(0);
    });
  });
});
