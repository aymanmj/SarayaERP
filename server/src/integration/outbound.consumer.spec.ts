import { Test, TestingModule } from '@nestjs/testing';
import { OutboundConsumer } from './outbound.consumer';
import { ConnectivityService } from '../common/services/connectivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { Job } from 'bullmq';

describe('OutboundConsumer', () => {
  let consumer: OutboundConsumer;
  let connectivityService: any;
  let prismaService: any;

  beforeEach(async () => {
    connectivityService = {
      isOnline: jest.fn().mockReturnValue(true),
    };

    prismaService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundConsumer,
        { provide: ConnectivityService, useValue: connectivityService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    consumer = module.get<OutboundConsumer>(OutboundConsumer);
    
    const mockWorker = {
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
    };

    // Mock the bullmq worker
    Object.defineProperty(consumer, 'worker', {
      get: () => mockWorker,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('Offline Handling (Pause/Resume)', () => {
    it('should pause worker on initialization if offline', async () => {
      connectivityService.isOnline.mockReturnValue(false);
      
      // Use fake timers to test the setTimeout in onModuleInit
      jest.useFakeTimers();
      await consumer.onModuleInit();
      jest.runAllTimers();
      jest.useRealTimers();

      expect((consumer as any).worker.pause).toHaveBeenCalled();
    });

    it('should pause worker when handleOffline is called', async () => {
      await consumer.handleOffline();
      expect((consumer as any).worker.pause).toHaveBeenCalled();
    });

    it('should resume worker when handleOnline is called', async () => {
      await consumer.handleOnline();
      expect((consumer as any).worker.resume).toHaveBeenCalled();
    });
  });

  describe('process', () => {
    it('should throw error if attempting to process while offline (failsafe)', async () => {
      connectivityService.isOnline.mockReturnValue(false);

      const mockJob = {
        id: 'job-123',
        data: { type: 'external-api', payload: {} },
      } as unknown as Job;

      await expect(consumer.process(mockJob)).rejects.toThrow(
        'OFFLINE: Internet connectivity unavailable — will retry',
      );
    });
  });
});
