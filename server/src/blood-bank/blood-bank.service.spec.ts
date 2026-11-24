import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { evaluateBloodCompatibility } from './blood-compatibility.util';
import { BloodBankService } from './blood-bank.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('BloodBankService & Compatibility Engine (CAP04)', () => {
  const buildService = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      patient: { findFirst: jest.fn() },
      encounter: { findFirst: jest.fn() },
      bloodUnit: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bloodCrossmatch: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bloodTransfusion: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bloodTransfusionEvent: { create: jest.fn() },
      clinicalIncident: { create: jest.fn() },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };
    return {
      service: new BloodBankService(prisma as unknown as PrismaService),
      tx,
    };
  };

  it('evaluates AABB ABO/Rh compatibility accurately for PRBC, Whole Blood, and FFP', () => {
    // PRBC: O- is universal donor; AB+ is universal recipient; Rh- MUST NOT receive Rh+
    expect(evaluateBloodCompatibility('A+', 'O-', 'PRBC').compatible).toBe(
      true,
    );
    expect(evaluateBloodCompatibility('AB+', 'B+', 'PRBC').compatible).toBe(
      true,
    );
    expect(evaluateBloodCompatibility('O-', 'O+', 'PRBC').compatible).toBe(
      false,
    );
    expect(evaluateBloodCompatibility('O-', 'A-', 'PRBC').compatible).toBe(
      false,
    );

    // Whole blood: ABO must be identical
    expect(
      evaluateBloodCompatibility('A+', 'O+', 'WHOLE_BLOOD').compatible,
    ).toBe(false);
    expect(
      evaluateBloodCompatibility('A+', 'A-', 'WHOLE_BLOOD').compatible,
    ).toBe(true);

    // FFP (Plasma): AB is universal donor; O cannot donate FFP to AB
    expect(evaluateBloodCompatibility('O-', 'AB+', 'FFP').compatible).toBe(
      true,
    );
    expect(evaluateBloodCompatibility('AB+', 'O-', 'FFP').compatible).toBe(
      false,
    );
  });

  it('blocks crossmatching an unscreened or ABO-incompatible blood unit', async () => {
    const { service, tx } = buildService();

    tx.patient.findFirst.mockResolvedValue({
      id: 10,
      hospitalId: 1,
      isDeceased: false,
      mergedIntoPatientId: null,
    });
    tx.encounter.findFirst.mockResolvedValue({
      id: 20,
      hospitalId: 1,
      patientId: 10,
    });
    tx.bloodUnit.findFirst.mockResolvedValue({
      id: 30,
      hospitalId: 1,
      unitNumber: 'BB-001',
      componentType: 'PRBC',
      bloodGroup: 'A+',
      screeningStatus: 'PENDING',
      status: 'QUARANTINED',
      expiresAt: new Date(Date.now() + 10 * 86_400_000),
    });

    await expect(
      service.createCrossmatch(1, 5, {
        patientId: 10,
        encounterId: 20,
        bloodUnitId: 30,
        patientBloodGroup: 'A+',
      }),
    ).rejects.toThrow(ConflictException);

    // Now unit is CLEARED & AVAILABLE, but patient is O- (incompatible with A+ PRBC)
    tx.bloodUnit.findFirst.mockResolvedValue({
      id: 30,
      hospitalId: 1,
      unitNumber: 'BB-001',
      componentType: 'PRBC',
      bloodGroup: 'A+',
      screeningStatus: 'CLEARED',
      status: 'AVAILABLE',
      expiresAt: new Date(Date.now() + 10 * 86_400_000),
    });

    await expect(
      service.createCrossmatch(1, 5, {
        patientId: 10,
        encounterId: 20,
        bloodUnitId: 30,
        patientBloodGroup: 'O-',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces 2-independent-clinician bedside dual verification and rejects same-nurse second check', async () => {
    const { service, tx } = buildService();

    tx.bloodTransfusion.findFirst.mockResolvedValue({
      id: 50,
      hospitalId: 1,
      status: 'ISSUED',
      bedsideVerifier1Id: 77,
      bedsideVerifier2Id: null,
      patient: { id: 10, mrn: 'MRN-1001' },
      bloodUnit: {
        id: 30,
        unitNumber: 'BB-2026-001',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(
      service.bedsideVerify(1, 50, 77, {
        patientBandScanned: true,
        bagBarcodeScanned: true,
        scannedUnitNumber: 'BB-2026-001',
        scannedPatientMrn: 'MRN-1001',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
