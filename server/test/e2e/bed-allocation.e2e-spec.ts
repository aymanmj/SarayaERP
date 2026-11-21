import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Bed allocation transactions (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let readToken: string;
  let hospitalId: number;
  let patientIds: number[];
  let encounterIds: number[];
  let bedIds: number[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    const staff = await auth.createTestUser('bed-manager', 'test-password', {
      permissions: [
        'beds:manage',
        'beds:view',
        'transfers:manage',
        'transfers:view',
      ],
    });
    hospitalId = staff.user.hospitalId;
    token = staff.accessToken;
    readToken = (
      await auth.createTestUser('bed-reader', 'test-password', {
        hospitalId,
        permissions: ['beds:view'],
      })
    ).accessToken;
    const ward = await prisma.ward.create({
      data: { hospitalId, name: 'Synthetic Ward' },
    });
    const room = await prisma.room.create({
      data: { hospitalId, wardId: ward.id, roomNumber: 'R1' },
    });
    bedIds = [];
    patientIds = [];
    encounterIds = [];
    for (let index = 0; index < 2; index++) {
      const bed = await prisma.bed.create({
        data: {
          hospitalId,
          roomId: room.id,
          wardId: ward.id,
          bedNumber: 'B' + index,
        },
      });
      bedIds.push(bed.id);
      const patient = await prisma.patient.create({
        data: {
          hospitalId,
          mrn: 'BED-MRN-' + index,
          fullName: 'Synthetic Bed Patient ' + index,
        },
      });
      patientIds.push(patient.id);
      const encounter = await prisma.encounter.create({
        data: { hospitalId, patientId: patient.id, type: 'IPD' },
      });
      encounterIds.push(encounter.id);
    }
  });
  const assign = (encounterId: number, bedId: number, accessToken = token) =>
    request(app.getHttpServer())
      .post('/beds/assign')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ encounterId, bedId });

  it('allows only one winner when two patients request the same bed simultaneously', async () => {
    const responses = await Promise.all(
      encounterIds.map((id) => assign(id, bedIds[0])),
    );
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => [400, 403].includes(response.status)),
    ).toHaveLength(1);
    expect(
      await prisma.bedAssignment.count({
        where: { bedId: bedIds[0], to: null },
      }),
    ).toBe(1);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } })).status,
    ).toBe('OCCUPIED');
  });

  it('serializes different encounters for the same patient so only one bed is allocated', async () => {
    const second = await prisma.encounter.create({
      data: { hospitalId, patientId: patientIds[0], type: 'IPD' },
    });
    const responses = await Promise.all([
      assign(encounterIds[0], bedIds[0]),
      assign(second.id, bedIds[1]),
    ]);
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 400),
    ).toHaveLength(1);
    expect(
      await prisma.bedAssignment.count({
        where: { to: null, encounter: { patientId: patientIds[0] } },
      }),
    ).toBe(1);
  });

  it('preserves the old assignment if the target has an inconsistent active booking', async () => {
    await assign(encounterIds[0], bedIds[0]).expect(201);
    await prisma.bedAssignment.create({
      data: { hospitalId, encounterId: encounterIds[1], bedId: bedIds[1] },
    });
    await assign(encounterIds[0], bedIds[1]).expect(400);
    expect(
      await prisma.bedAssignment.count({
        where: { encounterId: encounterIds[0], bedId: bedIds[0], to: null },
      }),
    ).toBe(1);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } })).status,
    ).toBe('OCCUPIED');
  });

  it('moves a patient atomically and keeps one active assignment and the history', async () => {
    await assign(encounterIds[0], bedIds[0]).expect(201);
    await assign(encounterIds[0], bedIds[1]).expect(201);
    expect(
      await prisma.bedAssignment.count({
        where: { encounterId: encounterIds[0] },
      }),
    ).toBe(2);
    expect(
      await prisma.bedAssignment.count({
        where: { encounterId: encounterIds[0], to: null, bedId: bedIds[1] },
      }),
    ).toBe(1);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } })).status,
    ).toBe('CLEANING');
  });

  it('denies view-only allocation and closed encounters without creating assignments', async () => {
    await assign(encounterIds[0], bedIds[0], readToken).expect(403);
    await prisma.encounter.update({
      where: { id: encounterIds[0] },
      data: { status: 'CLOSED' },
    });
    await assign(encounterIds[0], bedIds[0]).expect(400);
    expect(await prisma.bedAssignment.count()).toBe(0);
  });

  it('does not allocate a bed for an encounter in another branch', async () => {
    const otherHospital = await prisma.hospital.create({
      data: { name: 'Foreign Branch', code: 'FOREIGN-BED' },
    });
    const otherPatient = await prisma.patient.create({
      data: {
        hospitalId: otherHospital.id,
        mrn: 'FOREIGN-MRN',
        fullName: 'Foreign Synthetic Patient',
      },
    });
    const otherEncounter = await prisma.encounter.create({
      data: {
        hospitalId: otherHospital.id,
        patientId: otherPatient.id,
        type: 'IPD',
      },
    });
    await assign(otherEncounter.id, bedIds[0]).expect(404);
    expect(await prisma.bedAssignment.count()).toBe(0);
  });

  describe('TransferOrder reservation and handover', () => {
    beforeEach(async () => {
      const first = await prisma.bed.findUniqueOrThrow({
        where: { id: bedIds[0] },
      });
      const target = await prisma.bed.create({
        data: {
          hospitalId,
          roomId: first.roomId,
          wardId: first.wardId,
          bedNumber: 'TARGET',
        },
      });
      bedIds.push(target.id);
      await assign(encounterIds[0], bedIds[0]).expect(201);
      await assign(encounterIds[1], bedIds[1]).expect(201);
    });
    const requestTransfer = (index = 0) =>
      request(app.getHttpServer())
        .post('/transfers/request')
        .set('Authorization', 'Bearer ' + token)
        .send({ encounterId: encounterIds[index] });
    const allocate = (id: number, bedId = bedIds[2]) =>
      request(app.getHttpServer())
        .patch('/transfers/' + id + '/allocate')
        .set('Authorization', 'Bearer ' + token)
        .send({ toBedId: bedId });
    const arrive = (id: number) =>
      request(app.getHttpServer())
        .patch('/transfers/' + id + '/arrive')
        .set('Authorization', 'Bearer ' + token);
    const sign = (id: number) =>
      request(app.getHttpServer())
        .post('/transfers/' + id + '/handover')
        .set('Authorization', 'Bearer ' + token)
        .send({
          situation: 'Synthetic situation',
          background: 'Synthetic background',
          assessment: 'Synthetic assessment',
          recommendation: 'Synthetic recommendation',
          isSigned: true,
        });
    const cancel = (id: number) =>
      request(app.getHttpServer())
        .patch('/transfers/' + id + '/cancel')
        .set('Authorization', 'Bearer ' + token);

    it('rejects a forged source bed and leaves both patients assigned', async () => {
      await request(app.getHttpServer())
        .post('/transfers/request')
        .set('Authorization', 'Bearer ' + token)
        .send({ encounterId: encounterIds[0], fromBedId: bedIds[1] })
        .expect(400);
      expect(await prisma.transferOrder.count()).toBe(0);
      expect(await prisma.bedAssignment.count({ where: { to: null } })).toBe(2);
    });

    it('creates only one active request for simultaneous requests for one encounter', async () => {
      const responses = await Promise.all([
        requestTransfer(),
        requestTransfer(),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 400,
      ]);
      expect(
        await prisma.transferOrder.count({
          where: { encounterId: encounterIds[0] },
        }),
      ).toBe(1);
    });

    it('reserves a destination for only one of two competing transfers', async () => {
      const a = await requestTransfer().expect(201);
      const b = await requestTransfer(1).expect(201);
      const responses = await Promise.all([
        allocate((a.body as { id: number }).id),
        allocate((b.body as { id: number }).id),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 400,
      ]);
      expect(
        await prisma.transferOrder.count({
          where: { toBedId: bedIds[2], status: 'BED_ALLOCATED' },
        }),
      ).toBe(1);
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[2] } }))
          .status,
      ).toBe('BLOCKED');
    });

    it('requires a real signature, preserves it, and completes concurrent arrival only once', async () => {
      const response = await requestTransfer().expect(201);
      const id = (response.body as { id: number }).id;
      await allocate(id).expect(200);
      await arrive(id).expect(400);
      await request(app.getHttpServer())
        .post('/transfers/' + id + '/handover')
        .set('Authorization', 'Bearer ' + token)
        .send({
          situation: '',
          background: '',
          assessment: '',
          recommendation: '',
          isSigned: false,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/transfers/' + id + '/handover')
        .set('Authorization', 'Bearer ' + token)
        .send({
          situation: ' ',
          background: ' ',
          assessment: ' ',
          recommendation: ' ',
          isSigned: true,
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/transfers/' + id + '/handover')
        .set('Authorization', 'Bearer ' + token)
        .send({
          situation: 'x',
          background: 'x',
          assessment: 'x',
          recommendation: 'x',
          isSigned: 'false',
        })
        .expect(400);
      await sign(id).expect(201);
      await sign(id).expect(400);
      const responses = await Promise.all([arrive(id), arrive(id)]);
      expect(responses.map((result) => result.status).sort()).toEqual([
        200, 400,
      ]);
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } }))
          .status,
      ).toBe('CLEANING');
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[2] } }))
          .status,
      ).toBe('OCCUPIED');
      expect(
        await prisma.bedAssignment.count({
          where: { encounterId: encounterIds[0], to: null, bedId: bedIds[2] },
        }),
      ).toBe(1);
    });

    it('cancels a reservation without releasing the source bed and safely repeats cancellation', async () => {
      const response = await requestTransfer().expect(201);
      const id = (response.body as { id: number }).id;
      await allocate(id).expect(200);
      await cancel(id).expect(200);
      await cancel(id).expect(200);
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[2] } }))
          .status,
      ).toBe('AVAILABLE');
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } }))
          .status,
      ).toBe('OCCUPIED');
      await arrive(id).expect(400);
    });

    it('can clean up a legacy reservation after the encounter has closed', async () => {
      const response = await requestTransfer().expect(201);
      const id = (response.body as { id: number }).id;
      await allocate(id).expect(200);
      await prisma.encounter.update({
        where: { id: encounterIds[0] },
        data: { status: 'CLOSED' },
      });
      await cancel(id).expect(200);
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[2] } }))
          .status,
      ).toBe('AVAILABLE');
    });

    it('denies view-only mutation and does not return staff password fields', async () => {
      const response = await requestTransfer().expect(201);
      const id = (response.body as { id: number }).id;
      await request(app.getHttpServer())
        .patch('/transfers/' + id + '/allocate')
        .set('Authorization', 'Bearer ' + readToken)
        .send({ toBedId: bedIds[2] })
        .expect(403);
      const pending = await request(app.getHttpServer())
        .get('/transfers/pending')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      expect(JSON.stringify(pending.body)).not.toContain('passwordHash');
      const otherHospital = await prisma.hospital.create({
        data: { code: 'FOREIGN-TRANSFER', name: 'Foreign Transfer Hospital' },
      });
      const auth = new AuthHelper(prisma, app.get(JwtService));
      const foreign = await auth.createTestUser(
        'foreign-transfer-user',
        'test-password',
        {
          hospitalId: otherHospital.id,
          permissions: ['transfers:manage', 'transfers:view'],
        },
      );
      await request(app.getHttpServer())
        .patch('/transfers/' + id + '/allocate')
        .set('Authorization', 'Bearer ' + foreign.accessToken)
        .send({ toBedId: bedIds[2] })
        .expect(404);
      const foreignPending = await request(app.getHttpServer())
        .get('/transfers/pending')
        .set('Authorization', 'Bearer ' + foreign.accessToken)
        .expect(200);
      expect(foreignPending.body).toEqual([]);
    });

    it('rejects a changed source bed and preserves the current booking when arrival fails', async () => {
      const response = await requestTransfer().expect(201);
      const id = (response.body as { id: number }).id;
      await allocate(id).expect(200);
      await sign(id).expect(201);
      const first = await prisma.bed.findUniqueOrThrow({
        where: { id: bedIds[0] },
      });
      const replacement = await prisma.bed.create({
        data: {
          hospitalId,
          roomId: first.roomId,
          wardId: first.wardId,
          bedNumber: 'REPLACEMENT',
        },
      });
      // Public movement must not bypass a pending transfer. Simulate historical corruption directly.
      await assign(encounterIds[0], replacement.id).expect(400);
      await prisma.$transaction(async (tx) => {
        await tx.bedAssignment.updateMany({
          where: { encounterId: encounterIds[0], to: null },
          data: { to: new Date() },
        });
        await tx.bed.update({
          where: { id: bedIds[0] },
          data: { status: 'CLEANING' },
        });
        await tx.bed.update({
          where: { id: replacement.id },
          data: { status: 'OCCUPIED' },
        });
        await tx.bedAssignment.create({
          data: {
            hospitalId,
            encounterId: encounterIds[0],
            bedId: replacement.id,
          },
        });
      });
      await arrive(id).expect(400);
      expect(
        await prisma.bedAssignment.count({
          where: {
            encounterId: encounterIds[0],
            bedId: replacement.id,
            to: null,
          },
        }),
      ).toBe(1);
      expect(
        (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[2] } }))
          .status,
      ).toBe('BLOCKED');
      await cancel(id).expect(200);
    });
  });

  it('requires release and cleaning before making a bed available again', async () => {
    await assign(encounterIds[0], bedIds[0]).expect(201);
    await request(app.getHttpServer())
      .post('/beds/mark-clean')
      .set('Authorization', 'Bearer ' + token)
      .send({ bedId: bedIds[0] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/beds/release')
      .set('Authorization', 'Bearer ' + token)
      .send({ encounterId: encounterIds[0] })
      .expect(201);
    expect(
      await prisma.bedAssignment.count({
        where: { bedId: bedIds[0], to: null },
      }),
    ).toBe(0);
    await request(app.getHttpServer())
      .post('/beds/mark-clean')
      .set('Authorization', 'Bearer ' + token)
      .send({ bedId: bedIds[0] })
      .expect(201);
    expect(
      (await prisma.bed.findUniqueOrThrow({ where: { id: bedIds[0] } })).status,
    ).toBe('AVAILABLE');
  });
});
