import { Test, TestingModule } from '@nestjs/testing';
import { LabController } from './labs.controller';
import { LabService } from './labs.service';

describe('LabController', () => {
  let controller: LabController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabController],
      providers: [
        {
          provide: LabService,
          useValue: {
            getWorklist: jest.fn(),
            createOrdersForEncounter: jest.fn(),
            completeOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LabController>(LabController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
