import { Test, TestingModule } from '@nestjs/testing';
import { RadiologyController } from './radiology.controller';
import { RadiologyService } from './radiology.service';

describe('RadiologyController', () => {
  let controller: RadiologyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RadiologyController],
      providers: [
        {
          provide: RadiologyService,
          useValue: {
            getCatalog: jest.fn(),
            getWorklist: jest.fn(),
            scheduleStudy: jest.fn(),
            performStudy: jest.fn(),
            addReport: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RadiologyController>(RadiologyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
