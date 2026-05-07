import { Test, TestingModule } from '@nestjs/testing';
import { OutboxRelayService } from './outbox-relay.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundQueueService } from './outbound-queue.service';

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;
  let prisma: any;
  let outboundQueueService: any;

  beforeEach(async () => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    outboundQueueService = {
      enqueue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboundQueueService, useValue: outboundQueueService },
      ],
    }).compile();

    service = module.get<OutboxRelayService>(OutboxRelayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processOutbox', () => {
    it('should do nothing if no pending events are found', async () => {
      prisma.outboxEvent.findMany.mockResolvedValue([]);

      await service.processOutbox();

      expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
          take: 50,
        }),
      );
      expect(outboundQueueService.enqueue).not.toHaveBeenCalled();
    });

    it('should process pending events and mark them as PROCESSED', async () => {
      const mockEvents = [
        {
          id: 1,
          type: 'push-notification',
          payload: { foo: 'bar' },
          hospitalId: 10,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          attempts: 0,
        },
      ];

      prisma.outboxEvent.findMany.mockResolvedValue(mockEvents);
      outboundQueueService.enqueue.mockResolvedValue('job-id-123');

      await service.processOutbox();

      expect(outboundQueueService.enqueue).toHaveBeenCalledWith({
        type: 'push-notification',
        payload: { foo: 'bar' },
        hospitalId: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      });
    });

    it('should increment attempts and mark as FAILED if processing fails 5 times', async () => {
      const mockEvents = [
        {
          id: 2,
          type: 'external-api',
          payload: {},
          createdAt: new Date(),
          attempts: 4, // Next attempt will be the 5th
        },
      ];

      prisma.outboxEvent.findMany.mockResolvedValue(mockEvents);
      outboundQueueService.enqueue.mockRejectedValue(new Error('Queue Error'));

      await service.processOutbox();

      expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          attempts: { increment: 1 },
          error: 'Queue Error',
          status: 'FAILED',
        },
      });
    });
  });

  describe('cleanupOldOutboxEvents', () => {
    it('should delete events older than 30 days', async () => {
      prisma.outboxEvent.deleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupOldOutboxEvents();

      expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PROCESSED',
            processedAt: expect.anything(),
          }),
        }),
      );
    });
  });
});
