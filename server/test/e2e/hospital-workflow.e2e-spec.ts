import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Hospital workflow and clinical boundaries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let readToken: string;
  let hospitalId: number;
  let patientId: number;

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

  beforeEach(async () => {
    await resetDatabase(prisma);
    const auth = new AuthHelper(prisma, app.get(JwtService));
    const staff = await auth.createTestUser('clinical-staff', 'test-password', {
      permissions: [
        'patients:manage',
        'patients:view',
        'encounters:manage',
        'encounters:view',
        'vitals:manage',
        'vitals:view',
      ],
    });
    token = staff.accessToken;
    hospitalId = staff.user.hospitalId;
    readToken = (
      await auth.createTestUser('reader', 'test-password', {
        hospitalId,
        permissions: ['patients:view', 'vitals:view'],
      })
    ).accessToken;
    const response = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', 'Bearer ' + token)
      .send({
        fullName: 'Synthetic Clinical Patient',
        gender: 'MALE',
        phone: '0910000011',
      })
      .expect(201);
    patientId = (response.body as { id: number }).id;
  });

  it.each(['OPD', 'ER', 'IPD'])(
    'opens a %s encounter linked to the patient and branch',
    async (type) => {
      const response = await request(app.getHttpServer())
        .post('/encounters')
        .set('Authorization', 'Bearer ' + token)
        .send({ patientId, type })
        .expect(201);
      const encounterId = (response.body as { id: number }).id;
      const saved = await prisma.encounter.findUniqueOrThrow({
        where: { id: encounterId },
      });
      expect(saved).toMatchObject({ patientId, hospitalId, type });
    },
  );

  it('rejects invalid encounter types through runtime validation', async () => {
    await request(app.getHttpServer())
      .post('/encounters')
      .set('Authorization', 'Bearer ' + token)
      .send({ patientId, type: 'INVALID' })
      .expect(400);
    expect(await prisma.encounter.count()).toBe(0);
  });

  it('rejects patient creation for a user with view permission only', async () => {
    await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', 'Bearer ' + readToken)
      .send({ fullName: 'Forbidden Patient' })
      .expect(403);
    expect(await prisma.patient.count()).toBe(1);
  });

  it('rejects missing and forged authentication', async () => {
    await request(app.getHttpServer()).get('/patients').expect(401);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('persists own-branch vitals and blocks foreign-branch reads and writes', async () => {
    const own = await prisma.encounter.create({
      data: { hospitalId, patientId, type: 'OPD' },
    });
    await request(app.getHttpServer())
      .post('/vitals/encounter/' + own.id)
      .set('Authorization', 'Bearer ' + token)
      .send({ pulse: 78 })
      .expect(201);
    const ownRead = await request(app.getHttpServer())
      .get('/vitals/encounter/' + own.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(ownRead.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ pulse: 78 })]),
    );
    const otherHospital = await prisma.hospital.create({
      data: { code: 'OTHER', name: 'Other Hospital' },
    });
    const otherPatient = await prisma.patient.create({
      data: {
        hospitalId: otherHospital.id,
        fullName: 'Other Patient',
        mrn: 'OTHER-MRN',
      },
    });
    const foreign = await prisma.encounter.create({
      data: {
        hospitalId: otherHospital.id,
        patientId: otherPatient.id,
        type: 'OPD',
      },
    });
    const foreignRead = await request(app.getHttpServer())
      .get('/vitals/encounter/' + foreign.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(foreignRead.body).toEqual([]);
    await request(app.getHttpServer())
      .post('/vitals/encounter/' + foreign.id)
      .set('Authorization', 'Bearer ' + token)
      .send({ pulse: 95 })
      .expect(404);
    expect(
      await prisma.vitalSign.count({ where: { encounterId: foreign.id } }),
    ).toBe(0);
  });
});
