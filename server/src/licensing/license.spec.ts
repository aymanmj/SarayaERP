import { Test, TestingModule } from '@nestjs/testing';
import { LicenseService } from './license.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('LicenseService', () => {
  let service: LicenseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
