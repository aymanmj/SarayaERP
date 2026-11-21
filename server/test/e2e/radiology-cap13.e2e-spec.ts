import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { seedFinancialAccounts } from '../financial-fixture';
import { responseBody } from '../http-response';
import { startRadiologyPacsLab } from '../radiology-pacs-lab';
import { verifyOhifBrowser } from '../verify-ohif-browser';

const pilot = process.env.RUN_RADIOLOGY_CAP13 === 'true' ? it : it.skip;
const dicomUid = () =>
  `2.25.${BigInt(`0x${randomUUID().replaceAll('-', '')}`)}`;

pilot(
  'qualifies, ingests, reconciles, retrieves and reports a synthetic X-ray',
  async () => {
    const lab = await startRadiologyPacsLab();
    const archiveEnv = {
      RADIOLOGY_ORTHANC_URL: lab.url,
      RADIOLOGY_ORTHANC_USERNAME: lab.username,
      RADIOLOGY_ORTHANC_PASSWORD: lab.password,
    };
    const previous = Object.fromEntries(
      Object.keys(archiveEnv).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, archiveEnv);
    let app: INestApplication | undefined;
    try {
      console.log('CAP13_ARCHIVE_IMAGE', lab.imageId);
      expect((await fetch(lab.url + '/system')).status).toBe(401);
      const fixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = fixture.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
      const db = app.get(PrismaService);
      await resetDatabase(db);
      const api = request(app.getHttpServer());
      const auth = new AuthHelper(db, app.get(JwtService));
      const doctor = await auth.createTestUser('cap13-doctor', 'synthetic', {
        isDoctor: true,
        permissions: ['radiology:manage'],
      });
      const hospitalId = doctor.user.hospitalId;
      const cashier = await auth.createTestUser('cap13-cashier', 'synthetic', {
        hospitalId,
        permissions: ['cashier:manage'],
      });
      const reader = await auth.createTestUser('cap13-reader', 'synthetic', {
        hospitalId,
        permissions: ['radiology:view', 'radiology:manage'],
      });
      const foreignHospital = await db.hospital.create({
        data: { name: 'Synthetic outside', code: 'CAP13-OUTSIDE' },
      });
      const outsider = await auth.createTestUser('cap13-outside', 'synthetic', {
        hospitalId: foreignHospital.id,
        permissions: ['radiology:manage', 'radiology:view'],
      });
      const patient = await db.patient.create({
        data: { hospitalId, mrn: 'SYN-CAP13', fullName: 'Synthetic CAP13' },
      });
      const encounter = await db.encounter.create({
        data: {
          hospitalId,
          patientId: patient.id,
          doctorId: doctor.user.id,
          type: 'OPD',
        },
      });
      const service = await db.serviceItem.create({
        data: {
          hospitalId,
          name: 'Synthetic X-ray',
          type: 'RADIOLOGY',
          defaultPrice: '60.125',
        },
      });
      const study = await db.radiologyStudy.create({
        data: {
          hospitalId,
          code: 'SYN-DX',
          name: 'Synthetic X-ray',
          modality: 'DX',
          serviceItemId: service.id,
        },
      });
      await seedFinancialAccounts(db, hospitalId);
      const year = new Date().getUTCFullYear();
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1) - 1);
      await db.financialYear.create({
        data: {
          hospitalId,
          code: 'CAP13-YEAR',
          name: String(year),
          startDate: start,
          endDate: end,
          status: 'OPEN',
          isCurrent: true,
          periods: {
            create: {
              periodCode: 'CAP13-P',
              periodIndex: 1,
              monthStartDate: start,
              monthEndDate: end,
              numberOfDays: 365,
              isOpen: true,
            },
          },
        },
      });
      const [exam] = responseBody<{ id: number }[]>(
        await api
          .post(`/radiology/encounters/${encounter.id}/orders`)
          .auth(doctor.accessToken, { type: 'bearer' })
          .send({ studyIds: [study.id] })
          .expect(201),
      );
      const charge = await db.encounterCharge.findFirstOrThrow({
        where: { hospitalId, sourceType: 'RADIOLOGY_ORDER', sourceId: exam.id },
      });
      expect(charge.invoiceId).not.toBeNull();
      const path = `/radiology/orders/${exam.id}`;
      const prepare = () =>
        api
          .post(path + '/dicom-worklist')
          .auth(reader.accessToken, { type: 'bearer' });
      const worklist = () =>
        api
          .get('/radiology/worklist')
          .auth(reader.accessToken, { type: 'bearer' });
      const report = () =>
        api
          .patch(path + '/report')
          .auth(reader.accessToken, { type: 'bearer' })
          .send({ reportText: 'Synthetic CAP13 workflow report' });
      const pay = (amount: number) =>
        api
          .post(`/cashier/invoices/${charge.invoiceId}/payments`)
          .auth(cashier.accessToken, { type: 'bearer' })
          .send({ amount, method: 'TRANSFER', requestId: randomUUID() });
      await prepare().expect(400);
      expect((await worklist().expect(200)).body).toEqual([]);
      expect(JSON.parse(lab.simulate('find', ''))).toEqual([]);
      await pay(30).expect(201);
      await prepare().expect(400);
      expect((await worklist().expect(200)).body).toEqual([]);
      await pay(30.125).expect(201);
      expect((await worklist().expect(200)).body).toEqual([
        expect.objectContaining({ id: exam.id }),
      ]);
      await api
        .post(path + '/dicom-worklist')
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(404);
      const foreignStudy = await db.radiologyStudy.create({
        data: {
          hospitalId: foreignHospital.id,
          code: 'SYN-DX-OUTSIDE',
          name: 'Synthetic outside X-ray',
          modality: 'DX',
        },
      });
      await db.radiologyOrder.update({
        where: { id: exam.id },
        data: { studyId: foreignStudy.id },
      });
      await prepare().expect(404);
      await db.radiologyOrder.update({
        where: { id: exam.id },
        data: { studyId: study.id },
      });
      const tags = responseBody<{
        AccessionNumber: string;
        PatientID: string;
        ScheduledProcedureStepSequence: Record<string, string>[];
      }>(await prepare().expect(201));
      expect((await prepare().expect(201)).body).toEqual(tags);
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const published = await lab.fetchArchive('/worklists/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Tags: {
            ...tags,
            ScheduledProcedureStepSequence: [
              {
                ...tags.ScheduledProcedureStepSequence[0],
                ScheduledStationAETitle: 'SARAYASIM',
                ScheduledProcedureStepStartDate: date,
                ScheduledProcedureStepStartTime: '080000',
              },
            ],
          },
        }),
      });
      expect(published.status).toBe(200);
      expect(JSON.parse(lab.simulate('find', tags.AccessionNumber))).toEqual([
        {
          accession: tags.AccessionNumber,
          patientId: patient.mrn,
          modality: 'DX',
        },
      ]);
      await api
        .post(path + '/start')
        .auth(reader.accessToken, { type: 'bearer' })
        .expect(201);
      await report().expect(400);
      const output = resolve('../scratch/radiology-cap13-20261119');
      mkdirSync(output, { recursive: true });
      const sendStudy = (
        name: string,
        uid: string,
        mrn: string,
        accession = tags.AccessionNumber,
      ) =>
        JSON.parse(
          lab.simulate('store', resolve(output, name), accession, mrn, uid),
        ) as { sopInstanceUid: string };
      const link = (uid: string, token = reader.accessToken) =>
        api
          .post(path + '/dicom-study')
          .auth(token, { type: 'bearer' })
          .send({ studyInstanceUid: uid });
      const mismatch = dicomUid();
      sendStudy('unmatched.dcm', mismatch, 'UNKNOWN-CAP13');
      await link(mismatch).expect(400);
      const unnumbered = dicomUid();
      sendStudy('missing-accession.dcm', unnumbered, patient.mrn, '');
      await link(unnumbered).expect(400);
      expect(
        (await db.radiologyOrder.findUniqueOrThrow({ where: { id: exam.id } }))
          .dicomStudyUid,
      ).toBeNull();
      const uid = dicomUid();
      const { sopInstanceUid } = sendStudy('cap13-xray.dcm', uid, patient.mrn);
      lab.simulate('store', resolve(output, 'cap13-xray.dcm'));
      await link(uid, outsider.accessToken).expect(404);
      expect((await link(uid).expect(201)).body).toEqual({
        studyInstanceUid: uid,
      });
      await link(uid).expect(201);
      expect(
        await db.auditLog.count({
          where: {
            hospitalId,
            action: 'RADIOLOGY_DICOM_STUDY_LINKED',
            entityId: exam.id,
          },
        }),
      ).toBe(1);
      const studies = await lab.fetchArchive(
        `/dicom-web/studies?StudyInstanceUID=${uid}`,
      );
      expect(await studies.json()).toHaveLength(1);
      const instances = await lab.fetchArchive(
        `/dicom-web/studies/${uid}/instances`,
      );
      const rows = (await instances.json()) as Record<
        string,
        { Value: string[] }
      >[];
      expect(rows).toHaveLength(1);
      const wadoPath = `/dicom-web/studies/${uid}/series/${rows[0]['0020000E'].Value[0]}/instances/${sopInstanceUid}/frames/1`;
      const frame = await lab.fetchArchive(wadoPath, {
        headers: { accept: 'multipart/related; type=application/octet-stream' },
      });
      const pixels = Buffer.from(await frame.arrayBuffer());
      expect(frame.status).toBe(200);
      expect(pixels.length).toBeGreaterThanOrEqual(128 * 128);
      const viewerPath = `/ohif/viewer?StudyInstanceUIDs=${uid}`;
      const viewer = await lab.fetchArchive(viewerPath);
      expect(viewer.status).toBe(200);
      expect(await viewer.text()).toContain('<script');
      if (process.env.RADIOLOGY_LAB_BROWSER) {
        const browser = await verifyOhifBrowser(
          process.env.RADIOLOGY_LAB_BROWSER,
          new URL(viewerPath, lab.url),
          { username: lab.username, password: lab.password },
          output,
        );
        console.log('CAP13_OHIF_BROWSER', JSON.stringify(browser));
      }
      const stored = await lab.fetchArchive('/tools/find', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Level: 'Instance',
          Query: { SOPInstanceUID: sopInstanceUid },
        }),
      });
      const [archiveInstance] = (await stored.json()) as string[];
      const copy = await lab.fetchArchive(`/instances/${archiveInstance}/file`);
      const backupPath = resolve(output, 'exported-instance.dcm');
      expect(copy.status).toBe(200);
      writeFileSync(backupPath, Buffer.from(await copy.arrayBuffer()));
      const restore = await startRadiologyPacsLab();
      try {
        restore.simulate('store', backupPath);
        const restored = await restore.fetchArchive(wadoPath, {
          headers: {
            accept: 'multipart/related; type=application/octet-stream',
          },
        });
        expect(restored.status).toBe(200);
        const originalSamples = Buffer.from(
          Array.from({ length: 128 * 128 }, (_, index) => {
            const x = index % 128;
            const y = Math.floor(index / 128);
            return x > 32 && x < 96 && y > 32 && y < 96
              ? 200
              : Math.floor((x + y) / 3);
          }),
        );
        expect(pixels.includes(originalSamples)).toBe(true);
        expect(
          Buffer.from(await restored.arrayBuffer()).includes(originalSamples),
        ).toBe(true);
      } finally {
        restore.close();
      }
      expect((await report().expect(200)).body).toMatchObject({
        status: 'COMPLETED',
        dicomStudyUid: uid,
      });
      expect(
        (
          await api
            .get(path)
            .auth(reader.accessToken, { type: 'bearer' })
            .expect(200)
        ).body,
      ).toMatchObject({
        dicomStudyUid: uid,
        reportText: 'Synthetic CAP13 workflow report',
      });
      console.log(
        'CAP13_VALIDATED',
        JSON.stringify({
          accession: tags.AccessionNumber,
          uid,
          sopInstanceUid,
          frameBytes: pixels.length,
        }),
      );
    } finally {
      try {
        await app?.close();
      } finally {
        lab.close();
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    }
  },
  180000,
);
