import { Test, TestingModule } from '@nestjs/testing';
import { BedsController } from './beds.controller';

describe('BedsController', () => {
  let controller: BedsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BedsController],
    }).compile();

    controller = module.get<BedsController>(BedsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
