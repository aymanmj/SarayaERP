import { Prisma, ServiceType } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ConsolidatedReportingService } from '../common/tenant/consolidated-reporting.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CommissionService } from '../commission/commission.service';
import type { TenantService } from '../common/tenant/tenant.service';

describe('ReportsService & ConsolidatedReportingService Money precision (FIN02 & FLOW04)', () => {
  it('preserves 3-decimal LYD precision in getDoctorPerformance, getRevenueByDepartment, and getFinancialSummary net of refunds', async () => {
    const prismaMock = {
      payment: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal('1000.375') },
        }),
      },
      invoiceRefund: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal('100.125') },
        }),
      },
      purchaseInvoice: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { netAmount: new Prisma.Decimal('300.050') },
        }),
      },
      payrollRun: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalNet: new Prisma.Decimal('200.100') },
        }),
      },
      encounter: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ doctorId: 5, _count: { id: 3 } }]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 5,
            fullName: 'د. سالم',
            commissionRate: new Prisma.Decimal('0.1500'),
            specialty: { name: 'باطنة' },
          },
        ]),
      },
      admission: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      surgeryTeam: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      encounterCharge: {
        groupBy: jest
          .fn()
          // 1st call: getDoctorPerformance revenueByDoctor
          .mockResolvedValueOnce([
            {
              performerId: 5,
              _sum: { totalAmount: new Prisma.Decimal('333.335') },
            },
          ])
          // 2nd call: getRevenueByDepartment byServiceType
          .mockResolvedValueOnce([
            {
              serviceItemId: 1,
              _sum: { totalAmount: new Prisma.Decimal('120.125') },
              _count: { _all: 2 },
            },
          ]),
        findMany: jest.fn().mockResolvedValue([
          {
            totalAmount: new Prisma.Decimal('120.125'),
            performer: { specialty: { name: 'باطنة' } },
          },
        ]),
      },
      serviceItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 1, type: ServiceType.CONSULTATION, name: 'كشف' },
          ]),
      },
    };
    const commissionMock = {
      getDoctorRate: jest.fn().mockResolvedValue(15),
    };

    const reports = new ReportsService(
      prismaMock as unknown as PrismaService,
      commissionMock as unknown as CommissionService,
    );

    const summary = await reports.getFinancialSummary(1, 2026);
    // Net revenue = 1000.375 - 100.125 = 900.250; Expense = 300.050 + 200.100 = 500.150; Profit = 400.100
    expect(summary[0].revenue).toBe(900.25);
    expect(summary[0].expense).toBe(500.15);
    expect(summary[0].profit).toBe(400.1);

    const perf = await reports.getDoctorPerformance(1);
    // 333.335 LYD preserved to 3 decimals (not truncated to 333.34), 15% = 50.00025 -> 50.000
    expect(perf.doctors[0].totalRevenue).toBe(333.335);
    expect(perf.doctors[0].doctorCommission).toBe(50);
    expect(perf.summary.totalRevenue).toBe(333.335);

    const dept = await reports.getRevenueByDepartment(1);
    expect(dept.byServiceType[0].revenue).toBe(120.125);
    expect(dept.bySpecialty[0].revenue).toBe(120.125);
    expect(dept.total.revenue).toBe(120.125);
  });

  it('excludes CANCELLED and DRAFT invoices in ConsolidatedReportingService.getBranchComparison and sums with Money', async () => {
    const invoiceGroupByMock = jest
      .fn()
      .mockResolvedValueOnce([
        {
          hospitalId: 10,
          _count: 2,
          _sum: {
            totalAmount: new Prisma.Decimal('100.105'),
            paidAmount: new Prisma.Decimal('80.005'),
            insuranceShare: new Prisma.Decimal('20.100'),
            patientShare: new Prisma.Decimal('80.005'),
          },
        },
        {
          hospitalId: 20,
          _count: 1,
          _sum: {
            totalAmount: new Prisma.Decimal('50.205'),
            paidAmount: new Prisma.Decimal('50.205'),
            insuranceShare: new Prisma.Decimal('0.000'),
            patientShare: new Prisma.Decimal('50.205'),
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          hospitalId: 10,
          _sum: {
            totalAmount: new Prisma.Decimal('100.105'),
            paidAmount: new Prisma.Decimal('80.005'),
          },
        },
      ]);

    const prismaMock = {
      invoice: { groupBy: invoiceGroupByMock },
      encounter: {
        groupBy: jest.fn().mockResolvedValue([{ hospitalId: 10, _count: 4 }]),
      },
      hospital: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, name: 'فرع طرابلس', code: 'TRP' },
          { id: 20, name: 'فرع بنغازي', code: 'BNG' },
        ]),
      },
    };
    const tenantMock = {
      getOrganizationHospitalIds: jest.fn().mockResolvedValue([10, 20]),
    };

    const consolidated = new ConsolidatedReportingService(
      prismaMock as unknown as PrismaService,
      tenantMock as unknown as TenantService,
    );

    const rev = await consolidated.getConsolidatedRevenue(
      1,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
    );
    expect(rev.grandTotal).toBe(150.31);

    const comp = await consolidated.getBranchComparison(
      1,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T23:59:59.999Z'),
    );
    expect(invoiceGroupByMock.mock.calls[1]).toMatchObject([
      {
        where: {
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
      },
    ]);
    expect(comp[0].revenue).toEqual({ total: 100.105, paid: 80.005 });
  });
});
