import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface ClinicalNoteResponse {
  id: number;
  assessment: string | null;
  isAddendum: boolean;
  parentNoteId: number | null;
  addendumReason: string | null;
  signedById: number | null;
  signedAt: string | null;
  signatureHash: string | null;
  coSignedById: number | null;
  coSignedAt: string | null;
  coSignatureHash: string | null;
  appendages?: ClinicalNoteResponse[];
}

interface VerifyIntegrityResponse {
  isSigned: boolean;
  isCoSigned: boolean;
  signatureValid: boolean;
  coSignatureValid: boolean | null;
  integrityVerified: boolean;
}

describe('E2E Tests - Clinical Notes Electronic Signature & Immutability (CAP07 / OPS03 / SEC03)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('enforces draft edit, atomic electronic sign, PostgreSQL immutability, 4-eyes co-sign, addenda, audit chain, and tenant isolation', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: {
        name: 'Saraya Main Hospital',
        code: `HOSP-CAP07-A-${Date.now()}`,
      },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'External Hospital', code: `HOSP-CAP07-B-${Date.now()}` },
    });

    const authorDoctor = await auth.createTestUser('dr-author', 'password', {
      hospitalId: hospA.id,
      permissions: [
        'clinical-notes:view',
        'clinical-notes:manage',
        'clinical-notes:cosign',
      ],
    });
    const consultantDoctor = await auth.createTestUser(
      'dr-consultant',
      'password',
      {
        hospitalId: hospA.id,
        permissions: [
          'clinical-notes:view',
          'clinical-notes:manage',
          'clinical-notes:cosign',
        ],
      },
    );
    const nurseNoCosign = await auth.createTestUser(
      'nurse-writer',
      'password',
      {
        hospitalId: hospA.id,
        permissions: ['clinical-notes:view', 'clinical-notes:manage'],
      },
    );
    const readOnlyClinician = await auth.createTestUser(
      'reader-only',
      'password',
      {
        hospitalId: hospA.id,
        permissions: ['clinical-notes:view'],
      },
    );
    const otherHospitalDoctor = await auth.createTestUser(
      'dr-other-hosp',
      'password',
      {
        hospitalId: hospB.id,
        permissions: [
          'clinical-notes:view',
          'clinical-notes:manage',
          'clinical-notes:cosign',
        ],
      },
    );

    const patientA = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        fullName: 'Clinical Note Patient',
        mrn: `MRN-CAP07-${Date.now()}`,
        gender: 'MALE',
      },
    });
    const encounterA = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patientA.id,
        type: 'IPD',
        status: 'OPEN',
        doctorId: authorDoctor.user.id,
      },
    });

    // 1. Read-only clinician cannot create a note (OPS02)
    await request(server)
      .post('/clinical-notes')
      .set('Authorization', `Bearer ${readOnlyClinician.accessToken}`)
      .send({
        encounterId: encounterA.id,
        type: 'CONSULTATION',
        content: 'Unauthorized write attempt',
      })
      .expect(403);

    // 2. Author creates structured SOAP draft
    const createRes = await request(server)
      .post('/clinical-notes')
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .send({
        encounterId: encounterA.id,
        type: 'DOCTOR_ROUND',
        subjective: 'Mild chest discomfort improving',
        objective: 'BP 120/78, HR 74, ECG normal sinus rhythm',
        assessment: 'Non-cardiac chest pain',
        plan: 'Observe overnight and repeat troponin in 6 hours',
      })
      .expect(201);

    const createdNote = createRes.body as ClinicalNoteResponse;
    const noteId = createdNote.id;
    expect(createdNote.signedAt).toBeNull();
    expect(createdNote.signatureHash).toBeNull();

    // 3. Cannot attach addendum before primary note is signed
    await request(server)
      .post('/clinical-notes')
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .send({
        encounterId: encounterA.id,
        isAddendum: true,
        parentNoteId: noteId,
        addendumReason: 'CLARIFICATION',
        content: 'Premature addendum',
      })
      .expect(409);

    // 4. Another clinician cannot edit or sign author's unsigned draft
    await request(server)
      .patch(`/clinical-notes/${noteId}`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .send({ assessment: 'Unauthorized draft edit' })
      .expect(403);

    await request(server)
      .post(`/clinical-notes/${noteId}/sign`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .expect(403);

    // 5. Author edits unsigned draft cleanly
    const updatedRes = await request(server)
      .patch(`/clinical-notes/${noteId}`)
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .send({ assessment: 'Musculoskeletal chest pain (refined)' })
      .expect(200);
    const updatedNote = updatedRes.body as ClinicalNoteResponse;
    expect(updatedNote.assessment).toBe('Musculoskeletal chest pain (refined)');

    // 6. Cannot co-sign before primary signature
    await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .expect(400);

    // 7. Concurrent sign race: exactly one succeeds (201) and the second gets 409
    const [signAttempt1, signAttempt2] = await Promise.all([
      request(server)
        .post(`/clinical-notes/${noteId}/sign`)
        .set('Authorization', `Bearer ${authorDoctor.accessToken}`),
      request(server)
        .post(`/clinical-notes/${noteId}/sign`)
        .set('Authorization', `Bearer ${authorDoctor.accessToken}`),
    ]);
    const signStatuses = [signAttempt1.status, signAttempt2.status].sort();
    expect(signStatuses).toEqual([201, 409]);

    const winningSignBody = (
      signAttempt1.status === 201 ? signAttempt1.body : signAttempt2.body
    ) as ClinicalNoteResponse;
    expect(winningSignBody.signedById).toBe(authorDoctor.user.id);
    expect(winningSignBody.signatureHash).toMatch(/^[0-9a-f]{64}$/);

    // 8. Signed note cannot be edited, deleted, or re-signed via HTTP
    await request(server)
      .patch(`/clinical-notes/${noteId}`)
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .send({ assessment: 'Post-signature tampering' })
      .expect(409);

    await request(server)
      .delete(`/clinical-notes/${noteId}`)
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .expect(409);

    await request(server)
      .post(`/clinical-notes/${noteId}/sign`)
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .expect(409);

    // 9. PostgreSQL trigger blocks direct SQL UPDATE and DELETE of signed note
    await expect(
      prisma.$executeRaw`UPDATE "ClinicalNote" SET "assessment" = 'DB bypass attempt' WHERE "id" = ${noteId}`,
    ).rejects.toThrow(/immutable/i);

    await expect(
      prisma.$executeRaw`DELETE FROM "ClinicalNote" WHERE "id" = ${noteId}`,
    ).rejects.toThrow(/immutable/i);

    // 10. 4-eyes co-signature enforcement & RBAC separation
    await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .expect(403);

    await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${nurseNoCosign.accessToken}`)
      .expect(403);

    await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${otherHospitalDoctor.accessToken}`)
      .expect(404);

    const coSignRes = await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .expect(201);
    const coSignedNote = coSignRes.body as ClinicalNoteResponse;
    expect(coSignedNote.coSignedById).toBe(consultantDoctor.user.id);
    expect(coSignedNote.coSignatureHash).toMatch(/^[0-9a-f]{64}$/);

    // Re-cosigning is blocked at both API (409) and PostgreSQL trigger level
    await request(server)
      .post(`/clinical-notes/${noteId}/cosign`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .expect(409);

    await expect(
      prisma.$executeRaw`UPDATE "ClinicalNote" SET "coSignedById" = ${nurseNoCosign.user.id} WHERE "id" = ${noteId}`,
    ).rejects.toThrow(/permanently locked/i);

    // 11. Cryptographic signature verification passes
    const verifyRes = await request(server)
      .get(`/clinical-notes/${noteId}/verify`)
      .set('Authorization', `Bearer ${readOnlyClinician.accessToken}`)
      .expect(200);
    const verification = verifyRes.body as VerifyIntegrityResponse;
    expect(verification.isSigned).toBe(true);
    expect(verification.isCoSigned).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.coSignatureValid).toBe(true);
    expect(verification.integrityVerified).toBe(true);

    // Cross-tenant verify & list rejected with 404
    await request(server)
      .get(`/clinical-notes/${noteId}/verify`)
      .set('Authorization', `Bearer ${otherHospitalDoctor.accessToken}`)
      .expect(404);

    await request(server)
      .get(`/clinical-notes/encounter/${encounterA.id}`)
      .set('Authorization', `Bearer ${otherHospitalDoctor.accessToken}`)
      .expect(404);

    // 12. Signed Addendum workflow attached to the signed primary note
    const addendumRes = await request(server)
      .post('/clinical-notes')
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .send({
        encounterId: encounterA.id,
        type: 'DOCTOR_ROUND',
        isAddendum: true,
        parentNoteId: noteId,
        addendumReason: 'LATE_ENTRY',
        content: 'Repeat troponin negative at 6 hours; cleared for discharge.',
      })
      .expect(201);
    const createdAddendum = addendumRes.body as ClinicalNoteResponse;
    const addendumId = createdAddendum.id;
    expect(createdAddendum.isAddendum).toBe(true);
    expect(createdAddendum.parentNoteId).toBe(noteId);

    const signedAddendumRes = await request(server)
      .post(`/clinical-notes/${addendumId}/sign`)
      .set('Authorization', `Bearer ${consultantDoctor.accessToken}`)
      .expect(201);
    const signedAddendum = signedAddendumRes.body as ClinicalNoteResponse;
    expect(signedAddendum.signatureHash).toMatch(/^[0-9a-f]{64}$/);

    // Cannot nest an addendum on an addendum
    await request(server)
      .post('/clinical-notes')
      .set('Authorization', `Bearer ${authorDoctor.accessToken}`)
      .send({
        encounterId: encounterA.id,
        isAddendum: true,
        parentNoteId: addendumId,
        content: 'Nested addendum attempt',
      })
      .expect(400);

    // 13. Encounter notes list returns primary note with nested signed addendum
    const listRes = await request(server)
      .get(`/clinical-notes/encounter/${encounterA.id}`)
      .set('Authorization', `Bearer ${readOnlyClinician.accessToken}`)
      .expect(200);
    const listedNotes = listRes.body as ClinicalNoteResponse[];
    expect(listedNotes).toHaveLength(1);
    expect(listedNotes[0].id).toBe(noteId);
    expect(listedNotes[0].appendages).toHaveLength(1);
    expect(listedNotes[0].appendages?.[0].id).toBe(addendumId);
    expect(listedNotes[0].appendages?.[0].addendumReason).toBe('LATE_ENTRY');

    // 14. Chained AuditLog recorded every lifecycle step atomically
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        entity: 'ClinicalNote',
        action: { startsWith: 'CLINICAL_NOTE_' },
      },
      orderBy: { id: 'asc' },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual([
      'CLINICAL_NOTE_CREATED',
      'CLINICAL_NOTE_DRAFT_UPDATED',
      'CLINICAL_NOTE_SIGNED',
      'CLINICAL_NOTE_COSIGNED',
      'CLINICAL_NOTE_ADDENDUM_CREATED',
      'CLINICAL_NOTE_SIGNED',
    ]);
  });
});
