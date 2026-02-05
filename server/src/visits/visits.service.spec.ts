import { Test, TestingModule } from '@nestjs/testing';
import { VisitsService } from './visits.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('VisitsService', () => {
  let service: VisitsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
