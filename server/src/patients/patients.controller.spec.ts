import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ClinicalABACGuard } from '../auth/guards/clinical-abac.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('PatientsController', () => {
  let controller: PatientsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        {
          provide: PatientsService,
          useValue: {
            findOne: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            encounter: { findFirst: jest.fn() },
            appointment: { findFirst: jest.fn() },
          },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: JwtAuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: RolesGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: ClinicalABACGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    controller = module.get<PatientsController>(PatientsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
