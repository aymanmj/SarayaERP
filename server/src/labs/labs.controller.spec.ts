import { Test, TestingModule } from '@nestjs/testing';
import { LabController } from './labs.controller';
import { LabService } from './labs.service';

describe('LabController', () => {
  let controller: LabController;

  const mockLabService = {
    // Add methods as needed by controller tests
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabController],
      providers: [
        { provide: LabService, useValue: mockLabService },
      ],
    }).compile();

    controller = module.get<LabController>(LabController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
