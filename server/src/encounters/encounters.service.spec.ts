import { Test, TestingModule } from '@nestjs/testing';
import { EncountersService } from './encounters.service';
import { PrismaService } from '../prisma/prisma.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import { createPrismaMock, mockSoftDeleteService } from '../test-utils';

describe('EncountersService', () => {
  let service: EncountersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncountersService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
        {
          provide: SoftDeleteService,
          useValue: mockSoftDeleteService,
        },
      ],
    }).compile();

    service = module.get<EncountersService>(EncountersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
