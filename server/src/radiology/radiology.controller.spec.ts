import { Test, TestingModule } from '@nestjs/testing';
import { RadiologyController } from './radiology.controller';
import { RadiologyService } from './radiology.service';

describe('RadiologyController', () => {
  let controller: RadiologyController;

  const mockRadiologyService = {
    // Add methods as needed
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RadiologyController],
      providers: [
        { provide: RadiologyService, useValue: mockRadiologyService },
      ],
    }).compile();

    controller = module.get<RadiologyController>(RadiologyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
