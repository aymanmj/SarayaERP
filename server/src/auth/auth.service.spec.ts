import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createPrismaMock } from '../test-utils';

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  
  // Comprehensive mock setup
  const mockPrismaService = ({
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
    user: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    patient: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    encounter: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    hospital: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    invoice: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    payment: { findMany: jest.fn(), create: jest.fn() },
    prescription: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    product: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    // Add all other models as needed
  });
  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const mockAccountingService = {
    postBillingEntry: jest.fn(),
    postPharmacyDispenseEntry: jest.fn(),
    createJournalEntry: jest.fn(),
    reverseJournalEntry: jest.fn(),
    getAccountBalance: jest.fn(),
  };
  const mockInsuranceCalcService = {
    calculateCoverage: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
    calculateInsuranceSplit: jest.fn().mockResolvedValue({
      patientShare: { toNumber: () => 100 },
      insuranceShare: { toNumber: () => 0 },
      details: [],
    }),
  };
  const mockFinancialYearsService = {
    getCurrentPeriod: jest.fn().mockResolvedValue({
      id: 1,
      financialYearId: 1,
      isOpen: true,
    }),
  };
  const mockCDSSService = {
    checkDrugInteractions: jest.fn().mockResolvedValue([]),
    checkDrugAllergy: jest.fn().mockResolvedValue([]),
    createAlerts: jest.fn().mockResolvedValue([]),
  };
  const mockSoftDeleteService = {
    softDelete: jest.fn(),
    restore: jest.fn(),
    isDeleted: jest.fn(),
  };


  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock_access_token'),
            verifyAsync: jest.fn().mockResolvedValue({ sub: 1, username: 'test' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                JWT_SECRET: 'test_secret',
                JWT_EXPIRES_IN: '86400',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        passwordHash: '$2b$10$hashedpassword',
        isActive: true,
        hospital: { isActive: true },
        userRoles: [
          {
            role: {
              name: 'DOCTOR',
              rolePermissions: [
                { permission: { code: 'PATIENTS_READ' } }
              ]
            }
          }
        ]
      };

      const prismaService = module.get<PrismaService>(PrismaService);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(mockUser as any);
      
      // Mock bcrypt.compare
      const bcrypt = require('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password');
      
      expect(result).toBeDefined();
      expect(result.username).toBe('testuser');
      expect(result.roles).toContain('DOCTOR');
      expect(result.permissions).toContain('PATIENTS_READ');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const prismaService = module.get<PrismaService>(PrismaService);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      await expect(service.validateUser('invalid', 'password'))
        .rejects.toThrow('بيانات غير صحيحة');
    });
  });

  describe('generateAccessToken', () => {
    it('should generate access token', async () => {
      const jwtService = module.get<JwtService>(JwtService);
      jest.spyOn(jwtService, 'signAsync').mockResolvedValue('mock_token');

      const user = {
        id: 1,
        username: 'test',
        roles: ['DOCTOR'],
        hospitalId: 1,
        permissions: ['PATIENTS_READ']
      };

      const result = await service.generateAccessToken(user);
      
      expect(result).toBe('mock_token');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: user.id,
          username: user.username,
          roles: user.roles,
          hospitalId: user.hospitalId,
          permissions: user.permissions,
        },
        {
          secret: 'test_secret',
          expiresIn: '15m',
        }
      );
    });
  });
});
