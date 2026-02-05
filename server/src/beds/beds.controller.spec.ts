import { Test, TestingModule } from '@nestjs/testing';
import { BedsController } from './beds.controller';
import { BedsService } from './beds.service';

describe('BedsController', () => {
  let controller: BedsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BedsController],
      providers: [
        {
          provide: BedsService,
          useValue: {
            listAll: jest.fn(),
            getOne: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BedsController>(BedsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
