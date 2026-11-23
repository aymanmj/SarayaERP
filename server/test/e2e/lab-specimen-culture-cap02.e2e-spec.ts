import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

interface SpecimenResponse {
  id: number;
  barcode: string;
  status: string;
  rejectionCode: string | null;
  recollectionOfId: number | null;
  events: Array<{ eventType: string; toStatus: string }>;
}

interface CultureReportResponse {
  id: number;
  status: string;
  organismName: string | null;
  verificationHash: string | null;
  sensitivities: Array<{
    id: number;
    antibioticName: string;
    interpretation: string;
  }>;
}

describe('E2E Tests - Laboratory Specimen Lifecycle & Culture/AST (CAP02 / OPS02 / OPS03 / SEC03)', () => {
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

  it('tracks barcode collection, rejection & recollection chain, culture/AST antibiogram, verification SHA-256 lock, PostgreSQL immutability, RBAC, and tenant isolation', async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const server = app.getHttpServer();

    const hospA = await prisma.hospital.create({
      data: { name: 'Saraya Lab A', code: `HOSP-CAP02-A-${Date.now()}` },
    });
    const hospB = await prisma.hospital.create({
      data: { name: 'Saraya Lab B', code: `HOSP-CAP02-B-${Date.now()}` },
    });

    const phlebotomist = await auth.createTestUser('nurse-phleb', 'password', {
      hospitalId: hospA.id,
      permissions: ['labs:view', 'lab:specimens:collect'],
    });
    const labTech = await auth.createTestUser('lab-tech', 'password', {
      hospitalId: hospA.id,
      permissions: ['labs:view', 'lab:specimens:receive', 'lab:results:enter'],
    });
    const microbiologist = await auth.createTestUser(
      'lab-verifier',
      'password',
      {
        hospitalId: hospA.id,
        permissions: [
          'labs:view',
          'lab:specimens:receive',
          'lab:results:enter',
          'lab:results:verify',
        ],
      },
    );
    const otherHospitalLab = await auth.createTestUser(
      'lab-other-hosp',
      'password',
      {
        hospitalId: hospB.id,
        permissions: [
          'labs:view',
          'labs:manage',
          'lab:specimens:collect',
          'lab:specimens:receive',
          'lab:results:enter',
          'lab:results:verify',
        ],
      },
    );

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospA.id,
        fullName: 'Microbiology Patient',
        mrn: `MRN-CAP02-${Date.now()}`,
        gender: 'FEMALE',
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        hospitalId: hospA.id,
        patientId: patient.id,
        type: 'IPD',
        status: 'OPEN',
      },
    });
    const labTest = await prisma.labTest.create({
      data: {
        hospitalId: hospA.id,
        code: `URINE-CULT-${Date.now()}`,
        name: 'Urine Culture & Sensitivity',
        category: 'MICROBIOLOGY',
      },
    });
    const order = await prisma.order.create({
      data: {
        hospitalId: hospA.id,
        encounterId: encounter.id,
        orderedById: microbiologist.user.id,
        type: 'LAB',
        status: 'NEW',
        paymentStatus: 'PAID',
      },
    });
    const labOrder = await prisma.labOrder.create({
      data: {
        orderId: order.id,
        testId: labTest.id,
      },
    });

    // 1. Phlebotomist collects initial urine specimen with auto barcode
    const collect1Res = await request(server)
      .post('/lab/specimens/collect')
      .set('Authorization', `Bearer ${phlebotomist.accessToken}`)
      .send({
        labOrderId: labOrder.id,
        specimenType: 'URINE',
        containerType: 'STERILE_CUP',
        collectionSite: 'Midstream Clean Catch',
      })
      .expect(201);
    const spec1 = collect1Res.body as SpecimenResponse;
    expect(spec1.status).toBe('COLLECTED');
    expect(spec1.barcode).toContain(`SPC-H${hospA.id}-LO${labOrder.id}-1-`);
    expect(spec1.events).toHaveLength(1);

    // Phlebotomist cannot receive/reject specimen without lab:specimens:receive (OPS02)
    await request(server)
      .post(`/lab/specimens/${spec1.id}/receive`)
      .set('Authorization', `Bearer ${phlebotomist.accessToken}`)
      .send({})
      .expect(403);

    // Cross-hospital lab cannot look up barcode or receive (SEC03)
    await request(server)
      .get(`/lab/specimens/barcode/${spec1.barcode}`)
      .set('Authorization', `Bearer ${otherHospitalLab.accessToken}`)
      .expect(404);

    // 2. Lab tech rejects contaminated first specimen and requests recollection
    const rejectRes = await request(server)
      .post(`/lab/specimens/${spec1.id}/reject`)
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .send({
        rejectionCode: 'CONTAMINATED',
        rejectionReason: 'Container seal broken during transport',
        requestRecollection: true,
      })
      .expect(201);
    const rejectedSpec = rejectRes.body as SpecimenResponse;
    expect(rejectedSpec.status).toBe('RECOLLECT_REQUESTED');
    expect(rejectedSpec.rejectionCode).toBe('CONTAMINATED');

    // Cannot attach culture report to rejected specimen (409)
    await request(server)
      .post('/lab/specimens/cultures')
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .send({
        labOrderId: labOrder.id,
        specimenId: spec1.id,
        growthStatus: 'NO_GROWTH',
      })
      .expect(409);

    // 3. Phlebotomist collects replacement specimen linked to rejected spec1
    const collect2Res = await request(server)
      .post('/lab/specimens/collect')
      .set('Authorization', `Bearer ${phlebotomist.accessToken}`)
      .send({
        labOrderId: labOrder.id,
        specimenType: 'URINE',
        containerType: 'STERILE_CUP',
        recollectionOfId: spec1.id,
      })
      .expect(201);
    const spec2 = collect2Res.body as SpecimenResponse;
    expect(spec2.recollectionOfId).toBe(spec1.id);

    // 4. Lab tech receives spec2 and starts processing
    const receiveRes = await request(server)
      .post(`/lab/specimens/${spec2.id}/receive`)
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .send({ notes: 'Received intact in chilled transport bag' })
      .expect(201);
    expect((receiveRes.body as SpecimenResponse).status).toBe('RECEIVED');

    const inProcessRes = await request(server)
      .post(`/lab/specimens/${spec2.id}/status`)
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .send({
        status: 'IN_PROCESS',
        notes: 'Incubating on MacConkey & Blood agar',
      })
      .expect(201);
    expect((inProcessRes.body as SpecimenResponse).status).toBe('IN_PROCESS');

    // 5. Lab tech enters Culture & AST antibiogram report
    const cultureRes = await request(server)
      .post('/lab/specimens/cultures')
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .send({
        labOrderId: labOrder.id,
        specimenId: spec2.id,
        status: 'PRELIMINARY',
        gramStain: 'Gram-negative rods',
        growthStatus: 'SIGNIFICANT_GROWTH',
        organismName: 'Escherichia coli',
        organismCode: 'ECO',
        colonyCount: '>100,000 CFU/mL',
        incubationHours: 24,
        sensitivities: [
          {
            antibioticName: 'Meropenem',
            interpretation: 'S',
            micValue: '<=0.25 ug/mL',
            zoneDiameterMm: 29,
            isRestricted: true,
          },
          {
            antibioticName: 'Nitrofurantoin',
            interpretation: 'S',
            micValue: '<=16 ug/mL',
            zoneDiameterMm: 21,
          },
          {
            antibioticName: 'Ampicillin',
            interpretation: 'R',
            micValue: '>=32 ug/mL',
            zoneDiameterMm: 6,
          },
        ],
      })
      .expect(201);
    const culture = cultureRes.body as CultureReportResponse;
    expect(culture.status).toBe('PRELIMINARY');
    expect(culture.sensitivities).toHaveLength(3);

    // Lab tech without lab:results:verify cannot finalize report (403)
    await request(server)
      .post(`/lab/specimens/cultures/${culture.id}/verify`)
      .set('Authorization', `Bearer ${labTech.accessToken}`)
      .expect(403);

    // 6. Microbiologist verifies & cryptographically seals report
    const verifyRes = await request(server)
      .post(`/lab/specimens/cultures/${culture.id}/verify`)
      .set('Authorization', `Bearer ${microbiologist.accessToken}`)
      .expect(201);
    const verified = verifyRes.body as CultureReportResponse;
    expect(verified.status).toBe('FINAL_VERIFIED');
    expect(verified.verificationHash).toMatch(/^[0-9a-f]{64}$/);

    // Parent LabOrder & Order automatically completed with summary
    const updatedLabOrder = await prisma.labOrder.findUniqueOrThrow({
      where: { id: labOrder.id },
      include: { order: true },
    });
    expect(updatedLabOrder.resultStatus).toBe('COMPLETED');
    expect(updatedLabOrder.resultValue).toContain('Escherichia coli');
    expect(updatedLabOrder.resultValue).toContain(
      'S: Meropenem, Nitrofurantoin',
    );
    expect(updatedLabOrder.resultValue).toContain('R: Ampicillin');
    expect(updatedLabOrder.order.status).toBe('COMPLETED');

    // 7. PostgreSQL immutability triggers block post-verification edits & chain-of-custody deletions
    await request(server)
      .post('/lab/specimens/cultures')
      .set('Authorization', `Bearer ${microbiologist.accessToken}`)
      .send({
        reportId: culture.id,
        labOrderId: labOrder.id,
        specimenId: spec2.id,
        growthStatus: 'NO_GROWTH',
      })
      .expect(409);

    await expect(
      prisma.$executeRaw`UPDATE "LabCultureReport" SET "organismName" = 'Tampered' WHERE "id" = ${culture.id}`,
    ).rejects.toThrow(/immutable/i);

    await expect(
      prisma.$executeRaw`UPDATE "LabCultureSensitivity" SET "interpretation" = 'R' WHERE "cultureReportId" = ${culture.id}`,
    ).rejects.toThrow(/cannot be modified/i);

    await expect(
      prisma.$executeRaw`DELETE FROM "LabSpecimen" WHERE "id" = ${spec1.id}`,
    ).rejects.toThrow(/cannot be deleted/i);

    // 8. Chained AuditLog captured every specimen & culture event atomically
    const audits = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospA.id,
        action: { startsWith: 'LAB_' },
      },
      orderBy: { id: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'LAB_SPECIMEN_COLLECTED',
      'LAB_SPECIMEN_REJECTED',
      'LAB_SPECIMEN_COLLECTED',
      'LAB_SPECIMEN_RECEIVED',
      'LAB_SPECIMEN_IN_PROCESS',
      'LAB_CULTURE_REPORT_CREATED',
      'LAB_CULTURE_REPORT_VERIFIED',
    ]);
  });
});
