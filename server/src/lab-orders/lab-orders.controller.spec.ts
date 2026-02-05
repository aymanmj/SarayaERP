import { Test, TestingModule } from '@nestjs/testing';
import { LabOrdersController } from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';

describe('LabOrdersController', () => {
  let controller: LabOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabOrdersController],
      providers: [
        {
          provide: LabOrdersService,
          useValue: {
            listAll: jest.fn(),
            getOne: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LabOrdersController>(LabOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
