import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PatientGovernanceService } from './patient-governance.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('PatientGovernanceService (CAP06)', () => {
  const buildService = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      patient: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      encounter: {
        findFirst: jest.fn(),
      },
      patientMergeRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      patientDeathEvent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    const service = new PatientGovernanceService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma, tx };
  };

  it('rejects self-merge, blocks merging a source with open IPD/ER encounter, and enforces 4-eyes merge review', async () => {
    const { service, tx } = buildService();

    await expect(
      service.requestMerge(1, 10, {
        sourcePatientId: 5,
        targetPatientId: 5,
        reason: 'Duplicate profile',
      }),
    ).rejects.toThrow(BadRequestException);

    tx.patient.findFirst
      .mockResolvedValueOnce({
        id: 5,
        isDeceased: false,
        mergedIntoPatientId: null,
      })
      .mockResolvedValueOnce({
        id: 6,
        isDeceased: false,
        mergedIntoPatientId: null,
      });
    tx.encounter.findFirst.mockResolvedValueOnce({ id: 99, type: 'IPD' });

    await expect(
      service.requestMerge(1, 10, {
        sourcePatientId: 5,
        targetPatientId: 6,
        reason: 'Duplicate registration during triage',
      }),
    ).rejects.toThrow(ConflictException);

    // 4-eyes enforcement on merge review
    tx.patientMergeRecord.findFirst.mockResolvedValueOnce({
      id: 77,
      hospitalId: 1,
      sourcePatientId: 5,
      targetPatientId: 6,
      status: 'PENDING',
      requestedById: 10,
    });
    await expect(
      service.reviewMerge(1, 77, 10, { decision: 'APPROVE' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects future or pre-birth date of death and enforces 4-eyes on death reversal review', async () => {
    const { service, tx } = buildService();

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await expect(
      service.recordDeath(1, 10, 20, {
        dateOfDeath: futureDate,
        causeOfDeath: 'Cardiac arrest',
      }),
    ).rejects.toThrow(BadRequestException);

    tx.patient.findFirst.mockResolvedValueOnce({
      id: 10,
      dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
      isDeceased: false,
      mergedIntoPatientId: null,
    });
    await expect(
      service.recordDeath(1, 10, 20, {
        dateOfDeath: '1985-01-01T00:00:00.000Z',
        causeOfDeath: 'Invalid pre-birth death date',
      }),
    ).rejects.toThrow(BadRequestException);

    // 4-eyes enforcement on death reversal review
    tx.patient.findFirst.mockResolvedValueOnce({
      id: 10,
      isDeceased: true,
    });
    tx.patientDeathEvent.findFirst
      .mockResolvedValueOnce({
        id: 501,
        hospitalId: 1,
        patientId: 10,
        eventType: 'REVERSAL_REQUESTED',
        actorId: 20,
        reason: 'Wrong patient file selected by clerk',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.reviewDeathReversal(1, 10, 501, 20, { decision: 'APPROVE' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
