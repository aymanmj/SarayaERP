import { Test, TestingModule } from '@nestjs/testing';
import { TelehealthService } from './telehealth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '../../common/vault/vault.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

describe('TelehealthService', () => {
  let service: TelehealthService;
  let prismaService: any;
  let vaultService: any;
  let configService: any;

  beforeEach(async () => {
    prismaService = {
      appointment: {
        findUnique: jest.fn(),
      },
      telehealthSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    vaultService = {
      getOptionalSecret: jest.fn().mockResolvedValue('test-secret'),
    };

    configService = {
      get: jest.fn().mockReturnValue('https://meet.test.com'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelehealthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: VaultService, useValue: vaultService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TelehealthService>(TelehealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should throw NotFoundException if appointment is missing', async () => {
      prismaService.appointment.findUnique.mockResolvedValue(null);
      await expect(service.createSession(1)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if appointment is not ONLINE', async () => {
      prismaService.appointment.findUnique.mockResolvedValue({ type: 'IN_PERSON' });
      await expect(service.createSession(1)).rejects.toThrow(BadRequestException);
    });

    it('should return existing session if already created', async () => {
      const existingSession = { id: 10, roomUrl: 'test' };
      prismaService.appointment.findUnique.mockResolvedValue({
        type: 'ONLINE',
        telehealthSession: existingSession,
      });

      const result = await service.createSession(1);
      expect(result).toEqual(existingSession);
    });

    it('should create a new session if valid', async () => {
      prismaService.appointment.findUnique.mockResolvedValue({ type: 'ONLINE' });
      const newSession = { id: 11, roomUrl: 'https://meet.test.com/saraya-room-1-abcd' };
      prismaService.telehealthSession.create.mockResolvedValue(newSession);

      const result = await service.createSession(1);
      expect(result).toEqual(newSession);
      expect(prismaService.telehealthSession.create).toHaveBeenCalled();
    });
  });

  describe('enterWaitingRoom', () => {
    it('should throw NotFoundException if session not found', async () => {
      prismaService.telehealthSession.findUnique.mockResolvedValue(null);
      await expect(service.enterWaitingRoom(1, 100)).rejects.toThrow(NotFoundException);
    });

    it('should set status to WAITING and return message without roomUrl', async () => {
      prismaService.telehealthSession.findUnique.mockResolvedValue({
        id: 5,
        appointment: { patientId: 100 },
      });
      prismaService.telehealthSession.update.mockResolvedValue({ status: 'WAITING' });

      const result = await service.enterWaitingRoom(1, 100);
      expect(result.status).toBe('WAITING');
      expect(result.roomUrl).toBeNull();
    });
  });

  describe('startSession (Doctor)', () => {
    it('should update status to IN_PROGRESS and return roomUrl with JWT', async () => {
      prismaService.telehealthSession.findUnique.mockResolvedValue({
        id: 5,
        roomUrl: 'https://meet.test.com/room-123',
        appointment: { doctorId: 200, doctor: { username: 'dr.test' } },
      });
      prismaService.telehealthSession.update.mockResolvedValue({
        status: 'IN_PROGRESS',
        roomUrl: 'https://meet.test.com/room-123',
      });

      const result = await service.startSession(1, 200);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.roomUrl).toContain('?jwt=');

      // Verify JWT payload
      const token = result.roomUrl.split('?jwt=')[1];
      const decoded = jwt.verify(token, 'test-secret') as any;
      expect(decoded.room).toBe('room-123');
      expect(decoded.context.user.affiliation).toBe('owner');
    });
  });

  describe('getPatientRoomAccess', () => {
    it('should return null roomUrl if session is not IN_PROGRESS', async () => {
      prismaService.telehealthSession.findUnique.mockResolvedValue({
        status: 'WAITING',
        appointment: { patientId: 100 },
      });

      const result = await service.getPatientRoomAccess(1, 100);
      expect(result.status).toBe('WAITING');
      expect(result.roomUrl).toBeNull();
    });

    it('should return roomUrl with Guest JWT if IN_PROGRESS', async () => {
      prismaService.telehealthSession.findUnique.mockResolvedValue({
        status: 'IN_PROGRESS',
        roomUrl: 'https://meet.test.com/room-123',
        appointment: { patientId: 100, patient: { fullName: 'Ali', email: 'ali@test.com' } },
      });

      const result = await service.getPatientRoomAccess(1, 100);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.roomUrl).toContain('?jwt=');

      // Verify JWT payload
      const token = result.roomUrl!.split('?jwt=')[1];
      const decoded = jwt.verify(token, 'test-secret') as any;
      expect(decoded.context.user.affiliation).toBe('member'); // Guest
      expect(decoded.context.user.name).toBe('Ali');
    });
  });
});
