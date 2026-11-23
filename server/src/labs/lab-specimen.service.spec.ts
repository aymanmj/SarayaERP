import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  LabSpecimenService,
  computeCultureVerificationHash,
} from './lab-specimen.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('LabSpecimenService (CAP02)', () => {
  const buildService = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      labOrder: { findFirst: jest.fn(), update: jest.fn() },
      order: { update: jest.fn() },
      labSpecimen: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labSpecimenEvent: { create: jest.fn() },
      labCultureReport: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labCultureSensitivity: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    const service = new LabSpecimenService(prisma as unknown as PrismaService);
    return { service, tx };
  };

  it('validates positive culture organism name, duplicate antibiotics, and blocks rejected specimens', async () => {
    const { service, tx } = buildService();

    // SIGNIFICANT_GROWTH requires organismName
    await expect(
      service.upsertCultureReport(1, 10, {
        labOrderId: 5,
        growthStatus: 'SIGNIFICANT_GROWTH',
      }),
    ).rejects.toThrow(BadRequestException);

    // Duplicate antibiotic in AST table rejected
    await expect(
      service.upsertCultureReport(1, 10, {
        labOrderId: 5,
        growthStatus: 'SIGNIFICANT_GROWTH',
        organismName: 'Escherichia coli',
        sensitivities: [
          { antibioticName: 'Meropenem', interpretation: 'S' },
          { antibioticName: 'meropenem', interpretation: 'R' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    // Rejected specimen cannot be linked to a culture report
    tx.labOrder.findFirst.mockResolvedValueOnce({ id: 5 });
    tx.labSpecimen.findFirst.mockResolvedValueOnce({
      id: 12,
      status: 'RECOLLECT_REQUESTED',
    });
    await expect(
      service.upsertCultureReport(1, 10, {
        labOrderId: 5,
        specimenId: 12,
        growthStatus: 'NO_GROWTH',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('requires antibiogram sensitivities before verifying positive culture and computes deterministic SHA-256 verification hash', async () => {
    const { service, tx } = buildService();

    tx.labCultureReport.findFirst.mockResolvedValueOnce({
      id: 22,
      hospitalId: 1,
      labOrderId: 5,
      status: 'PRELIMINARY',
      growthStatus: 'SIGNIFICANT_GROWTH',
      organismName: 'Klebsiella pneumoniae',
      sensitivities: [],
      labOrder: { id: 5, orderId: 99 },
    });

    await expect(service.verifyCultureReport(1, 22, 11)).rejects.toThrow(
      BadRequestException,
    );

    const verifiedAt = new Date('2026-11-24T00:30:00.000Z');
    const hash1 = computeCultureVerificationHash({
      id: 22,
      hospitalId: 1,
      labOrderId: 5,
      specimenId: 14,
      gramStain: 'Gram-negative bacilli',
      growthStatus: 'SIGNIFICANT_GROWTH',
      organismName: 'Klebsiella pneumoniae',
      organismCode: 'KPN',
      colonyCount: '>100,000 CFU/mL',
      incubationHours: 24,
      comments: null,
      verifiedById: 11,
      verifiedAt,
      sensitivities: [
        {
          antibioticName: 'Meropenem',
          interpretation: 'S',
          micValue: '<=0.25',
          zoneDiameterMm: 28,
        },
        {
          antibioticName: 'Ampicillin',
          interpretation: 'R',
          micValue: '>=32',
          zoneDiameterMm: 6,
        },
      ],
    });
    const hash2 = computeCultureVerificationHash({
      id: 22,
      hospitalId: 1,
      labOrderId: 5,
      specimenId: 14,
      gramStain: 'Gram-negative bacilli',
      growthStatus: 'SIGNIFICANT_GROWTH',
      organismName: 'Klebsiella pneumoniae',
      organismCode: 'KPN',
      colonyCount: '>100,000 CFU/mL',
      incubationHours: 24,
      comments: null,
      verifiedById: 11,
      verifiedAt,
      sensitivities: [
        {
          antibioticName: 'Ampicillin',
          interpretation: 'R',
          micValue: '>=32',
          zoneDiameterMm: 6,
        },
        {
          antibioticName: 'Meropenem',
          interpretation: 'S',
          micValue: '<=0.25',
          zoneDiameterMm: 28,
        },
      ],
    });
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
  });
});
