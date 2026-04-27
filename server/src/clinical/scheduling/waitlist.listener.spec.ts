import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WaitlistListener', () => {
  let listener: WaitlistListener;
  let prismaService: any;
  let waitlistService: any;

  beforeEach(async () => {
    prismaService = {
      waitlist: { findMany: jest.fn() },
    };

    waitlistService = {
      updateWaitlistStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistListener,
        { provide: PrismaService, useValue: prismaService },
        { provide: WaitlistService, useValue: waitlistService },
      ],
    }).compile();

    listener = module.get<WaitlistListener>(WaitlistListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleBookingCancelled', () => {
    it('should find highest priority candidate and mark as NOTIFIED', async () => {
      const payload = {
        bookingId: 1,
        resourceId: 2,
        departmentId: 10,
        hospitalId: 100,
        freedSlotStart: new Date(),
        freedSlotEnd: new Date(),
      };

      prismaService.waitlist.findMany.mockResolvedValue([
        { id: 50, patientId: 999 },
      ]);

      await listener.handleBookingCancelled(payload);

      expect(prismaService.waitlist.findMany).toHaveBeenCalledWith({
        where: {
          hospitalId: 100,
          status: 'WAITING',
          resourceId: 2,
        },
        orderBy: [{ priority: 'asc' }, { requestedDate: 'asc' }],
        take: 1,
      });

      expect(waitlistService.updateWaitlistStatus).toHaveBeenCalledWith(50, 'NOTIFIED');
    });

    it('falls back to department candidates when no resource-specific entry exists', async () => {
      const payload = {
        bookingId: 1,
        resourceId: 2,
        departmentId: 10,
        hospitalId: 100,
        freedSlotStart: new Date(),
        freedSlotEnd: new Date(),
      };

      prismaService.waitlist.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 51, patientId: 1001 }]);

      await listener.handleBookingCancelled(payload);

      expect(prismaService.waitlist.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          hospitalId: 100,
          status: 'WAITING',
          resourceId: null,
          departmentId: 10,
        },
        orderBy: [{ priority: 'asc' }, { requestedDate: 'asc' }],
        take: 1,
      });
      expect(waitlistService.updateWaitlistStatus).toHaveBeenCalledWith(51, 'NOTIFIED');
    });

    it('should do nothing if no candidate is found', async () => {
      const payload = {
        bookingId: 1,
        resourceId: 2,
        hospitalId: 100,
        freedSlotStart: new Date(),
        freedSlotEnd: new Date(),
      };

      prismaService.waitlist.findMany.mockResolvedValue([]);

      await listener.handleBookingCancelled(payload);

      expect(waitlistService.updateWaitlistStatus).not.toHaveBeenCalled();
    });
  });
});
