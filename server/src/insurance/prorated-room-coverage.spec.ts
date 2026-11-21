import { InsuranceCalculationService } from './insurance-calculation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Coverage of snapshotted, prorated room lines', () => {
  const patient = {
    insurancePolicy: {
      id: 1,
      isActive: true,
      priceListId: 2,
      endDate: null,
      patientCopayRate: '0.2',
      plan: null as unknown,
    },
  };
  const prisma = {
    patient: { findUnique: jest.fn() },
    serviceItem: { findUnique: jest.fn() },
    priceListItem: { findFirst: jest.fn() },
    preAuthorization: { findFirst: jest.fn() },
  };
  const service = new InsuranceCalculationService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    patient.insurancePolicy.plan = null;
    prisma.patient.findUnique.mockResolvedValue(patient);
    prisma.serviceItem.findUnique.mockResolvedValue({ categoryId: null });
    prisma.priceListItem.findFirst.mockResolvedValue({ price: '900' });
  });
  it('does not replace a prorated line with a full daily contracted price', async () => {
    const result = await service.calculateCoverage(1, 2, 50, {
      preserveServicePrice: true,
      benefitUnits: '0.5',
    });
    expect(result).toMatchObject({
      patientShare: 10,
      insuranceShare: 40,
      contractedPrice: undefined,
    });
    expect(prisma.priceListItem.findFirst).not.toHaveBeenCalled();
  });
  it('prorates fixed copay and its cap to the same fraction of a day', async () => {
    patient.insurancePolicy.plan = {
      defaultCopayRate: '0',
      maxCopayAmount: '20',
      rules: [
        {
          id: 1,
          serviceItemId: 2,
          ruleType: 'INCLUSION',
          copayType: 'FIXED',
          copayValue: '40',
        },
      ],
    };
    const result = await service.calculateCoverage(1, 2, 50, {
      preserveServicePrice: true,
      benefitUnits: '0.25',
    });
    expect(result).toMatchObject({ patientShare: 5, insuranceShare: 45 });
  });
  it('preserves the existing contract lookup for ordinary service lines', async () => {
    const result = await service.calculateCoverage(1, 2, 50);
    expect(result.contractedPrice).toBe(900);
    expect(prisma.priceListItem.findFirst).toHaveBeenCalled();
  });
});
