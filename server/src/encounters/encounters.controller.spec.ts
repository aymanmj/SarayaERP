import { Test, TestingModule } from '@nestjs/testing';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

describe('EncountersController', () => {
  let controller: EncountersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncountersController],
      providers: [
        {
          provide: EncountersService,
          useValue: {
            getOne: jest.fn(),
            listAll: jest.fn(),
            start: jest.fn(),
            complete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<EncountersController>(EncountersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
