import { Test, TestingModule } from '@nestjs/testing';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

describe('VisitsController', () => {
  let controller: VisitsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [
        {
          provide: VisitsService,
          useValue: {
            listAll: jest.fn(),
            getOne: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<VisitsController>(VisitsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
