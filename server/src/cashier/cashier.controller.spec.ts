import { Test, TestingModule } from '@nestjs/testing';
import { CashierController } from './cashier.controller';
import { CashierService } from './cashier.service';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('CashierController', () => {
  let controller: CashierController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashierController],
      providers: [
        {
          provide: CashierService,
          useValue: {
            getPaymentReceiptData: jest.fn(),
            collectPayment: jest.fn(),
            listPayments: jest.fn(),
            getWorklist: jest.fn(),
            recordPayment: jest.fn(),
            getPatientStatement: jest.fn(),
            getInvoiceDetails: jest.fn(),
            getPaymentReceipt: jest.fn(),
            getDailyReport: jest.fn(),
            listCashierUsers: jest.fn(),
            getCashierUserReport: jest.fn(),
            closeCashierShift: jest.fn(),
            listCashierShifts: jest.fn(),
          },
        },
        {
          provide: PdfService,
          useValue: {
            generatePdf: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    controller = module.get<CashierController>(CashierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
