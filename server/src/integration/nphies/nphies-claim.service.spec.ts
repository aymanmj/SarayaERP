import { Test, TestingModule } from '@nestjs/testing';
import { NphiesClaimService } from './nphies-claim.service';
import { NphiesEligibilityService } from './nphies-eligibility.service';
import { NphiesAuthService } from './nphies-auth.service';
import { NphiesService } from './nphies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectivityService } from '../../common/services/connectivity.service';
import { OutboundQueueService } from '../outbound-queue.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClaimStatus } from '@prisma/client';

describe('Nphies Services Tenant Isolation', () => {
  let claimService: NphiesClaimService;
  let eligibilityService: NphiesEligibilityService;
  let prismaService: any;
  let nphiesService: any;
  let authService: any;

  beforeEach(async () => {
    prismaService = {
      claim: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      claimHistory: {
        create: jest.fn(),
      },
      patient: {
        findFirst: jest.fn(),
      },
    };

    nphiesService = {
      buildPatient: jest.fn().mockReturnValue({}),
      buildCoverage: jest.fn().mockReturnValue({}),
      buildMessageHeader: jest.fn().mockReturnValue({}),
      buildBundle: jest.fn().mockReturnValue({}),
    };

    authService = {
      sendFhirRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NphiesClaimService,
        NphiesEligibilityService,
        { provide: PrismaService, useValue: prismaService },
        { provide: NphiesService, useValue: nphiesService },
        { provide: NphiesAuthService, useValue: authService },
        {
          provide: ConnectivityService,
          useValue: { isOnline: jest.fn().mockReturnValue(true) },
        },
        {
          provide: OutboundQueueService,
          useValue: { enqueue: jest.fn() },
        },
      ],
    }).compile();

    claimService = module.get<NphiesClaimService>(NphiesClaimService);
    eligibilityService = module.get<NphiesEligibilityService>(
      NphiesEligibilityService,
    );
  });

  describe('NphiesEligibilityService - checkEligibility', () => {
    it('should throw NotFoundException if patient does not belong to the hospital tenant', async () => {
      prismaService.patient.findFirst.mockResolvedValue(null);

      await expect(
        eligibilityService.checkEligibility(
          1, // hospitalId
          { id: '99', fullName: 'Ali' },
          { memberId: 'M1', payerIdentifier: 'P1', payerName: 'Payer' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 99, hospitalId: 1 },
      });
    });

    it('should proceed if patient belongs to the hospital tenant', async () => {
      prismaService.patient.findFirst.mockResolvedValue({
        id: 99,
        hospitalId: 1,
      });
      authService.sendFhirRequest.mockResolvedValue({
        entry: [
          {
            resource: {
              resourceType: 'CoverageEligibilityResponse',
              outcome: 'complete',
            },
          },
        ],
      });

      const res = await eligibilityService.checkEligibility(
        1,
        { id: '99', fullName: 'Ali' },
        { memberId: 'M1', payerIdentifier: 'P1', payerName: 'Payer' },
      );

      expect(res.eligible).toBe(true);
    });
  });

  describe('NphiesClaimService - submitClaim', () => {
    it('should throw NotFoundException if claim does not belong to the hospital tenant', async () => {
      prismaService.claim.findFirst.mockResolvedValue(null);

      await expect(claimService.submitClaim(1, 100)).rejects.toThrow(
        NotFoundException,
      );

      expect(prismaService.claim.findFirst).toHaveBeenCalledWith({
        where: { id: 100, hospitalId: 1 },
        include: expect.any(Object),
      });
    });

    it('should proceed if claim belongs to the hospital tenant', async () => {
      const mockClaim = {
        id: 100,
        hospitalId: 1,
        status: ClaimStatus.DRAFT,
        claimedAmount: 150,
        invoice: {
          patient: { id: 5 },
          charges: [],
        },
      };
      prismaService.claim.findFirst.mockResolvedValue(mockClaim);
      authService.sendFhirRequest.mockResolvedValue({
        entry: [
          { resource: { resourceType: 'ClaimResponse', outcome: 'queued' } },
        ],
      });

      const res = await claimService.submitClaim(1, 100);
      expect(res.status).toBe('queued');
    });
  });

  describe('NphiesClaimService - checkClaimStatus', () => {
    it('should throw NotFoundException if claim does not belong to the hospital tenant', async () => {
      prismaService.claim.findFirst.mockResolvedValue(null);

      await expect(claimService.checkClaimStatus(1, 'EXT-123')).rejects.toThrow(
        NotFoundException,
      );

      expect(prismaService.claim.findFirst).toHaveBeenCalledWith({
        where: { externalClaimId: 'EXT-123', hospitalId: 1 },
      });
    });

    it('should proceed if claim belongs to the hospital tenant', async () => {
      prismaService.claim.findFirst.mockResolvedValue({
        id: 100,
        hospitalId: 1,
      });
      authService.sendFhirRequest.mockResolvedValue({
        status: 'active',
        outcome: 'complete',
      });

      const res = await claimService.checkClaimStatus(1, 'EXT-123');
      expect(res.found).toBe(true);
      expect(res.status).toBe('active');
    });
  });

  describe('NphiesClaimService - submitPreAuthorization', () => {
    it('should throw NotFoundException if patient does not belong to the hospital tenant', async () => {
      prismaService.patient.findFirst.mockResolvedValue(null);

      await expect(
        claimService.submitPreAuthorization(
          1,
          { id: '99', fullName: 'Ali' },
          { memberId: 'M1', payerIdentifier: 'P1', payerName: 'Payer' },
          [],
          [],
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
