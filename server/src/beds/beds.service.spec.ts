import { Test, TestingModule } from '@nestjs/testing';
import { BedsService } from './beds.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('BedsService', () => {
  let service: BedsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BedsService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    service = module.get<BedsService>(BedsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
