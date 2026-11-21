import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';

describe('Unified admission and legacy transfer invariants (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let readToken: string;
  let approveToken: string;
  let hospitalId: number;
  let staffId: number;
  let departmentId: number;
  let wardId: number;
  let roomId: number;
  let patientIds: number[];
  let encounterIds: number[];
  let admissionIds: number[];
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
    const staff = await auth.createTestUser('legacy-manager', 'synthetic', {
      permissions: [
        'admission:view',
        'admission:manage',
        'beds:view',
        'beds:manage',
        'transfers:manage',
      ],
    });
    token = staff.accessToken;
    hospitalId = staff.user.hospitalId;
    staffId = staff.user.id;
    readToken = (
      await auth.createTestUser('legacy-reader', 'synthetic', {
        hospitalId,
        permissions: ['admission:view'],
      })
    ).accessToken;
    approveToken = (
      await auth.createTestUser('legacy-approver', 'synthetic', {
        hospitalId,
        permissions: ['inpatient:transfers:approve'],
      })
    ).accessToken;
    departmentId = (
      await prisma.department.create({
        data: { hospitalId, name: 'Synthetic department' },
      })
    ).id;
    wardId = (
      await prisma.ward.create({
        data: { hospitalId, departmentId, name: 'Synthetic legacy ward' },
      })
    ).id;
    roomId = (
      await prisma.room.create({
        data: { hospitalId, wardId, roomNumber: 'SYNTH' },
      })
    ).id;
    patientIds = [];
    encounterIds = [];
    admissionIds = [];
    bedIds = [];
    for (let index = 0; index < 3; index++) {
      bedIds.push(
        (
          await prisma.bed.create({
            data: {
              hospitalId,
              roomId,
              wardId,
              bedNumber: 'L' + index,
              status: index < 2 ? 'OCCUPIED' : 'AVAILABLE',
            },
          })
        ).id,
      );
      if (index === 2) continue;
      const patient = await prisma.patient.create({
        data: {
          hospitalId,
          mrn: 'LEGACY-' + index,
          fullName: 'Synthetic legacy patient ' + index,
        },
      });
      patientIds.push(patient.id);
      const encounter = await prisma.encounter.create({
        data: { hospitalId, patientId: patient.id, departmentId, type: 'IPD' },
      });
      encounterIds.push(encounter.id);
      const admission = await prisma.admission.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          admissionType: 'ELECTIVE',
          admissionStatus: 'ADMITTED',
          priority: 'MEDIUM',
          actualAdmissionDate: new Date(),
          bedId: bedIds[index],
          roomId,
          wardId,
          departmentId,
          admittingDoctorId: staffId,
          primaryPhysicianId: staffId,
          admissionReason: 'Synthetic',
          createdBy: staffId,
        },
      });
      admissionIds.push(admission.id);
      await prisma.bedAssignment.create({
        data: { hospitalId, encounterId: encounter.id, bedId: bedIds[index] },
      });
    }
  });
  const post = (path: string, data = {}, access = token) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + access)
      .send(data);
  const update = (data: object, access = token) =>
    request(app.getHttpServer())
      .put('/admissions/' + admissionIds[0])
      .set('Authorization', 'Bearer ' + access)
      .send(data);
  const legacy = (index = 0, access = token) =>
    post(
      `/admissions/${admissionIds[index]}/bed-transfer/request`,
      {
        toBedId: bedIds[2],
        transferReason: 'Synthetic move',
        transferType: 'ROUTINE',
        priority: 'MEDIUM',
      },
      access,
    );
  const approve = (id: number, access = approveToken) =>
    post(`/admissions/transfers/${id}/approve`, {}, access);
  const cancel = (id: number) => post(`/admissions/bed-transfer/${id}/cancel`);
  const modern = (index = 0) =>
    post('/transfers/request', { encounterId: encounterIds[index] });
  const bed = (id: number) => prisma.bed.findUniqueOrThrow({ where: { id } });
  const transferId = (response: request.Response) =>
    (response.body as { id: number }).id;
  const activeBed = (index = 0) =>
    prisma.bedAssignment.findFirstOrThrow({
      where: { encounterId: encounterIds[index], to: null },
    });
  const freshPatient = async () =>
    (
      await prisma.patient.create({
        data: { hospitalId, mrn: 'FRESH', fullName: 'Synthetic fresh patient' },
      })
    ).id;
  const admissionData = (patientId: number) => ({
    patientId,
    admissionType: 'ELECTIVE',
    priority: 'MEDIUM',
    departmentId,
    admittingDoctorId: staffId,
    primaryPhysicianId: staffId,
    admissionReason: 'Synthetic',
    bedId: bedIds[2],
  });

  it('denies view-only admission creation, edits, quick admission, planning, and legacy requests', async () => {
    await post('/admissions', admissionData(patientIds[0]), readToken).expect(
      403,
    );
    await post('/admissions/quick-admission', {}, readToken).expect(403);
    await update({ admissionReason: 'forbidden' }, readToken).expect(403);
    await legacy(0, readToken).expect(403);
    await post(
      `/admissions/${admissionIds[0]}/discharge-planning`,
      {},
      readToken,
    ).expect(403);
  });
  it('does not allow a manager or reader to bypass approval through either execution route', async () => {
    const response = await legacy().expect(201);
    await approve(transferId(response), token).expect(403);
    await post(
      `/admissions/bed-transfer/${transferId(response)}/complete`,
      {},
      token,
    ).expect(403);
    await post(
      `/admissions/bed-transfer/${transferId(response)}/complete`,
      {},
      approveToken,
    ).expect(400);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
  });
  it('keeps patient and encounter identity immutable and rejects invalid clinical references', async () => {
    await update({ patientId: patientIds[1] }).expect(400);
    await update({ encounterId: encounterIds[1] }).expect(400);
    const inactiveDoctor = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('inactive-clinical-reference', 'synthetic', {
      hospitalId,
    });
    await prisma.user.update({
      where: { id: inactiveDoctor.user.id },
      data: { isActive: false },
    });
    await update({ primaryPhysicianId: inactiveDoctor.user.id }).expect(404);
    await prisma.department.update({
      where: { id: departmentId },
      data: { isActive: false },
    });
    await update({ departmentId }).expect(404);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
  });
  it('rejects room/ward mismatches and moves atomically through the admission edit path', async () => {
    const other = await prisma.room.create({
      data: { hospitalId, wardId, roomNumber: 'OTHER' },
    });
    await update({ bedId: bedIds[2], roomId: other.id }).expect(400);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
    await update({
      bedId: bedIds[2],
      patientId: patientIds[0],
      encounterId: encounterIds[0],
      insuranceProviderId: 'SYNTHETIC-PROVIDER',
    }).expect(200);
    expect((await activeBed()).bedId).toBe(bedIds[2]);
    expect((await bed(bedIds[0])).status).toBe('CLEANING');
    const admission = await prisma.admission.findUniqueOrThrow({
      where: { id: admissionIds[0] },
    });
    expect([admission.bedId, admission.roomId, admission.wardId]).toEqual([
      bedIds[2],
      roomId,
      wardId,
    ]);
  });
  it.each(['DISCHARGED', 'CANCELLED'] as const)(
    'blocks edits, requests and execution for a %s admission',
    async (status) => {
      const response = await legacy().expect(201);
      await prisma.admission.update({
        where: { id: admissionIds[0] },
        data: { admissionStatus: status },
      });
      await update({ bedId: bedIds[2] }).expect(400);
      await legacy().expect(400);
      await approve(transferId(response)).expect(400);
      await post('/beds/assign', {
        encounterId: encounterIds[0],
        bedId: bedIds[2],
      }).expect(400);
      await cancel(transferId(response)).expect(201);
      expect((await activeBed()).bedId).toBe(bedIds[0]);
    },
  );
  it('blocks mutation for a closed encounter but permits cancellation cleanup', async () => {
    const response = await legacy().expect(201);
    await prisma.encounter.update({
      where: { id: encounterIds[0] },
      data: { status: 'CLOSED' },
    });
    await update({ bedId: bedIds[2] }).expect(400);
    await approve(transferId(response)).expect(400);
    await post('/beds/release', { encounterId: encounterIds[0] }).expect(400);
    await cancel(transferId(response)).expect(201);
    await cancel(transferId(response)).expect(201);
  });
  it('serializes duplicate legacy requests and excludes modern requests and direct moves', async () => {
    const responses = await Promise.all([legacy(), legacy()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    await modern().expect(400);
    await update({ bedId: bedIds[2] }).expect(400);
    await post('/beds/assign', {
      encounterId: encounterIds[0],
      bedId: bedIds[2],
    }).expect(400);
    await post('/beds/release', { encounterId: encounterIds[0] }).expect(400);
    const ready = await request(app.getHttpServer())
      .get(`/admissions/${admissionIds[0]}/discharge-readiness`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(ready.body).toMatchObject({
      ready: false,
      pendingTransfersCount: 1,
      pendingBedTransfersCount: 1,
    });
    expect((await activeBed()).bedId).toBe(bedIds[0]);
  });
  it('excludes legacy requests when a modern transfer is already pending', async () => {
    await modern().expect(201);
    await legacy().expect(400);
    expect(await prisma.bedTransfer.count()).toBe(0);
  });
  it('allows only one competing legacy execution and preserves the losing patient source', async () => {
    const a = await legacy().expect(201);
    const b = await legacy(1).expect(201);
    const responses = await Promise.all([
      approve(transferId(a)),
      approve(transferId(b)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    const winner = responses.findIndex((r) => r.status === 201);
    const loser = 1 - winner;
    expect((await activeBed(winner)).bedId).toBe(bedIds[2]);
    expect((await activeBed(loser)).bedId).toBe(bedIds[loser]);
    expect((await bed(bedIds[loser])).status).toBe('OCCUPIED');
    expect(await prisma.bedAssignment.count({ where: { to: null } })).toBe(2);
    await approve(winner === 0 ? transferId(a) : transferId(b)).expect(400);
  });
  it('cannot steal a modern destination reservation and cancellation does not release another owner', async () => {
    const a = await legacy().expect(201);
    const b = await modern(1).expect(201);
    await request(app.getHttpServer())
      .patch(`/transfers/${transferId(b)}/allocate`)
      .set('Authorization', 'Bearer ' + token)
      .send({ toBedId: bedIds[2] })
      .expect(200);
    await approve(transferId(a)).expect(400);
    await cancel(transferId(a)).expect(201);
    expect((await bed(bedIds[2])).status).toBe('BLOCKED');
    expect((await activeBed()).bedId).toBe(bedIds[0]);
  });
  it('executes a historical approved request exactly once through the guarded complete alias', async () => {
    const response = await legacy().expect(201);
    await prisma.bedTransfer.update({
      where: { id: transferId(response) },
      data: { status: 'APPROVED', approvedBy: staffId },
    });
    await post(
      `/admissions/bed-transfer/${transferId(response)}/complete`,
      {},
      approveToken,
    ).expect(201);
    await post(
      `/admissions/bed-transfer/${transferId(response)}/complete`,
      {},
      approveToken,
    ).expect(400);
    await cancel(transferId(response)).expect(400);
    expect((await activeBed()).bedId).toBe(bedIds[2]);
  });
  it('rejects foreign destinations and staff without modifying the admission', async () => {
    const hospital = await prisma.hospital.create({
      data: { code: 'OTHER-LEGACY', name: 'Synthetic other hospital' },
    });
    const foreignStaff = await new AuthHelper(
      prisma,
      app.get(JwtService),
    ).createTestUser('foreign-legacy', 'synthetic', {
      hospitalId: hospital.id,
    });
    await update({ primaryPhysicianId: foreignStaff.user.id }).expect(404);
    await prisma.bed.update({
      where: { id: bedIds[2] },
      data: { hospitalId: hospital.id },
    });
    await legacy().expect(404);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
  });
  it('rejects an inactive destination parent and a changed source snapshot', async () => {
    const response = await legacy().expect(201);
    await prisma.ward.update({
      where: { id: wardId },
      data: { isActive: false },
    });
    await approve(transferId(response)).expect(400);
    await prisma.ward.update({
      where: { id: wardId },
      data: { isActive: true },
    });
    await prisma.bedTransfer.update({
      where: { id: transferId(response) },
      data: { fromBedId: bedIds[1] },
    });
    await approve(transferId(response)).expect(400);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
    expect((await bed(bedIds[2])).status).toBe('AVAILABLE');
  });
  it('serializes simultaneous admission creation and rolls back the losing encounter', async () => {
    const id = await freshPatient();
    const count = await prisma.encounter.count();
    const responses = await Promise.all([
      post('/admissions', admissionData(id)),
      post('/admissions', admissionData(id)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.encounter.count()).toBe(count + 1);
    expect(await prisma.admission.count({ where: { patientId: id } })).toBe(1);
  });
  it('rolls back encounter conversion when a bed claim fails and blocks discharge-pending duplicate admission', async () => {
    const id = await freshPatient();
    const encounter = await prisma.encounter.create({
      data: { hospitalId, patientId: id, type: 'OPD' },
    });
    await post('/admissions', {
      ...admissionData(id),
      encounterId: encounter.id,
      bedId: bedIds[0],
    }).expect(400);
    expect(
      (
        await prisma.encounter.findUniqueOrThrow({
          where: { id: encounter.id },
        })
      ).type,
    ).toBe('OPD');
    expect(await prisma.admission.count({ where: { patientId: id } })).toBe(0);
    await prisma.admission.update({
      where: { id: admissionIds[0] },
      data: { admissionStatus: 'DISCHARGE_PENDING' },
    });
    await post('/admissions', admissionData(patientIds[0])).expect(400);
  });
  it('protects occupied and reserved beds from administrative status edits and deletion', async () => {
    const patch = (id: number, data: object) =>
      request(app.getHttpServer())
        .patch('/beds/beds/' + id)
        .set('Authorization', 'Bearer ' + token)
        .send(data);
    const remove = (id: number) =>
      request(app.getHttpServer())
        .delete('/beds/beds/' + id)
        .set('Authorization', 'Bearer ' + token);
    await patch(bedIds[0], { status: 'AVAILABLE' }).expect(400);
    await patch(bedIds[2], { status: 'OCCUPIED' }).expect(400);
    await remove(bedIds[0]).expect(400);
    const response = await modern().expect(201);
    await request(app.getHttpServer())
      .patch(`/transfers/${transferId(response)}/allocate`)
      .set('Authorization', 'Bearer ' + token)
      .send({ toBedId: bedIds[2] })
      .expect(200);
    await patch(bedIds[2], { status: 'AVAILABLE' }).expect(400);
    await remove(bedIds[2]).expect(400);
    await patch(bedIds[2], { bedNumber: 'RENAMED' }).expect(200);
    expect((await bed(bedIds[2])).status).toBe('BLOCKED');
  });
  it.each(['equipment', 'drip'])(
    'preserves the clinical transfer restriction for active ICU %s across legacy and direct paths',
    async (kind) => {
      const response = await legacy().expect(201);
      if (kind === 'equipment')
        await prisma.iCUEquipmentUsage.create({
          data: {
            hospitalId,
            encounterId: encounterIds[0],
            equipmentType: 'VENTILATOR',
          },
        });
      else
        await prisma.iCUMedicationDrip.create({
          data: {
            hospitalId,
            encounterId: encounterIds[0],
            medicationName: 'Synthetic medication',
            orderedById: staffId,
          },
        });
      await approve(transferId(response)).expect(400);
      await cancel(transferId(response)).expect(201);
      await update({ bedId: bedIds[2] }).expect(400);
      await post('/beds/assign', {
        encounterId: encounterIds[0],
        bedId: bedIds[2],
      }).expect(400);
      await post('/beds/release', { encounterId: encounterIds[0] }).expect(400);
      expect((await activeBed()).bedId).toBe(bedIds[0]);
      expect((await bed(bedIds[2])).status).toBe('AVAILABLE');
    },
  );

  it('captures the actual cash price list at allocation and keeps historical snapshots unchanged', async () => {
    const service = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'SNAPSHOT-ROOM',
        name: 'Synthetic snapshot room',
        type: 'BED',
        defaultPrice: 100,
      },
    });
    await prisma.ward.update({
      where: { id: wardId },
      data: { serviceItemId: service.id },
    });
    const list = await prisma.priceList.create({
      data: { hospitalId, name: 'Synthetic default cash', isDefault: true },
    });
    await prisma.priceListItem.create({
      data: {
        priceListId: list.id,
        serviceItemId: service.id,
        price: '123.456',
      },
    });
    await post('/beds/assign', {
      encounterId: encounterIds[0],
      bedId: bedIds[2],
    }).expect(201);
    const captured = (await activeBed()).roomRateSnapshot;
    expect(captured).toMatchObject({
      version: 1,
      dailyRate: '123.456',
      serviceItemId: service.id,
      priceListId: list.id,
      insurancePolicyId: null,
    });
    await prisma.priceListItem.updateMany({
      where: { priceListId: list.id },
      data: { price: 900 },
    });
    expect((await activeBed()).roomRateSnapshot).toEqual(captured);
  });

  it('rolls back the entire move when the destination room tariff is invalid', async () => {
    const service = await prisma.serviceItem.create({
      data: {
        hospitalId,
        code: 'INVALID-ROOM-RATE',
        name: 'Synthetic invalid rate',
        type: 'BED',
        defaultPrice: -1,
      },
    });
    await prisma.ward.update({
      where: { id: wardId },
      data: { serviceItemId: service.id },
    });
    await post('/beds/assign', {
      encounterId: encounterIds[0],
      bedId: bedIds[2],
    }).expect(400);
    expect((await activeBed()).bedId).toBe(bedIds[0]);
    expect((await bed(bedIds[0])).status).toBe('OCCUPIED');
    expect((await bed(bedIds[2])).status).toBe('AVAILABLE');
  });

  it('enforces active-bed and active-encounter uniqueness in PostgreSQL while allowing closed history', async () => {
    await expect(
      prisma.bedAssignment.create({
        data: { hospitalId, encounterId: encounterIds[1], bedId: bedIds[0] },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.bedAssignment.create({
        data: { hospitalId, encounterId: encounterIds[0], bedId: bedIds[2] },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId: encounterIds[0],
        bedId: bedIds[0],
        to: new Date(),
      },
    });
    expect(await prisma.bedAssignment.count({ where: { to: null } })).toBe(2);
  });
});
