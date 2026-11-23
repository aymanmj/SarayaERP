import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NoteType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ClinicalNotesService,
  computeClinicalNoteCoSignatureHash,
  computeClinicalNoteSignatureHash,
} from './clinical-notes.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../audit/audit-chain', () => ({
  appendChainedAuditInTransaction: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../audit/siem.logger', () => ({
  publishCommittedCriticalAudit: jest.fn(),
}));

describe('ClinicalNotesService (CAP07)', () => {
  const buildService = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      encounter: {
        findFirst: jest.fn(),
      },
      clinicalNote: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
      encounter: {
        findFirst: jest.fn(),
      },
      clinicalNote: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const eventEmitter = {
      emit: jest.fn(),
    } as unknown as EventEmitter2;

    const service = new ClinicalNotesService(
      prisma as unknown as PrismaService,
      eventEmitter,
    );
    return { service, prisma, tx, eventEmitter };
  };

  it('rejects empty clinical notes and invalid addendum metadata before opening a transaction', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create(10, 1, { encounterId: 5, content: '   ' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(10, 1, {
        encounterId: 5,
        content: 'Addendum without parent',
        isAddendum: true,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(10, 1, {
        encounterId: 5,
        content: 'Parent without isAddendum flag',
        parentNoteId: 99,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces author ownership on draft edits, rejects editing signed notes, and computes verifiable SHA-256 hashes', async () => {
    const { service, prisma, tx } = buildService();
    const signedAt = new Date('2026-11-23T22:15:30.123Z');
    const coSignedAt = new Date('2026-11-23T22:20:00.456Z');

    const baseDraft = {
      id: 42,
      encounterId: 7,
      type: NoteType.DOCTOR_ROUND,
      content: null,
      subjective: 'Patient reports improved breathing',
      objective: 'SpO2 98% on room air',
      assessment: 'Resolving community-acquired pneumonia',
      plan: 'Continue oral antibiotics for 3 more days',
      isAddendum: false,
      parentNoteId: null,
      addendumReason: null,
      shiftId: null,
      createdById: 10,
      signedById: null,
      signedAt: null,
      signatureHash: null,
      coSignedById: null,
      coSignedAt: null,
      coSignatureHash: null,
      encounter: { hospitalId: 1 },
    };

    // Another doctor cannot edit author's draft
    tx.clinicalNote.findUnique.mockResolvedValueOnce(baseDraft);
    await expect(
      service.updateDraft(42, 11, 1, { assessment: 'Tampered draft' }),
    ).rejects.toThrow(ForbiddenException);

    // Cross-tenant attempt gets NotFoundException
    tx.clinicalNote.findUnique.mockResolvedValueOnce(baseDraft);
    await expect(
      service.updateDraft(42, 10, 2, { assessment: 'Other hospital' }),
    ).rejects.toThrow(NotFoundException);

    // Already signed note cannot be edited or re-signed
    const expectedSigHash = computeClinicalNoteSignatureHash({
      ...baseDraft,
      signedById: 10,
      signedAt,
    });
    const signedNote = {
      ...baseDraft,
      signedById: 10,
      signedAt,
      signatureHash: expectedSigHash,
    };

    tx.clinicalNote.findUnique.mockResolvedValueOnce(signedNote);
    await expect(
      service.updateDraft(42, 10, 1, { assessment: 'Post-sign edit' }),
    ).rejects.toThrow(ConflictException);

    tx.clinicalNote.findUnique.mockResolvedValueOnce(signedNote);
    await expect(service.signNote(42, 10, 1)).rejects.toThrow(
      ConflictException,
    );

    // 4-eyes co-signature rejects self-cosigning
    tx.clinicalNote.findUnique.mockResolvedValueOnce(signedNote);
    await expect(service.coSignNote(42, 10, 1)).rejects.toThrow(
      ForbiddenException,
    );

    // Independent physician co-signs cleanly
    const expectedCoSigHash = computeClinicalNoteCoSignatureHash(
      expectedSigHash,
      11,
      coSignedAt,
    );
    prisma.clinicalNote.findFirst.mockResolvedValueOnce({
      ...signedNote,
      coSignedById: 11,
      coSignedAt,
      coSignatureHash: expectedCoSigHash,
      signedBy: { id: 10, fullName: 'Dr. Author' },
      coSignedBy: { id: 11, fullName: 'Dr. Consultant' },
    });

    const verified = await service.verifyIntegrity(42, 1);
    expect(verified.isSigned).toBe(true);
    expect(verified.isCoSigned).toBe(true);
    expect(verified.signatureValid).toBe(true);
    expect(verified.coSignatureValid).toBe(true);
    expect(verified.integrityVerified).toBe(true);

    // Tampered text invalidates signature verification
    prisma.clinicalNote.findFirst.mockResolvedValueOnce({
      ...signedNote,
      assessment: 'Altered clinical assessment',
      coSignedById: 11,
      coSignedAt,
      coSignatureHash: expectedCoSigHash,
      signedBy: { id: 10, fullName: 'Dr. Author' },
      coSignedBy: { id: 11, fullName: 'Dr. Consultant' },
    });

    const tampered = await service.verifyIntegrity(42, 1);
    expect(tampered.signatureValid).toBe(false);
    expect(tampered.integrityVerified).toBe(false);
  });
});
