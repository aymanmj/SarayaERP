import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma/prisma.service';

// Generic mock factory for PrismaService
export const createPrismaMock = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  hospital: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  encounter: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  bed: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  bedAssignment: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  room: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  ward: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  invoice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  prescription: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  prescriptionItem: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  productStock: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  // Add more models as needed
});

// Generic test module factory
export const createTestModule = async (providers: any[], controllers: any[] = []) => {
  return Test.createTestingModule({
    providers: [
      ...providers,
      {
        provide: PrismaService,
        useValue: createPrismaMock(),
      },
    ],
    controllers,
  }).compile();
};
