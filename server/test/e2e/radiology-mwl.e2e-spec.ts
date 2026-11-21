import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RadiologyMwlService } from '../../src/radiology/radiology-mwl.service';
import { RadiologyPacsService } from '../../src/radiology/radiology-pacs.service';
import { RadiologyService } from '../../src/radiology/radiology.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { startRadiologyPacsLab } from '../radiology-pacs-lab';

const pilot = process.env.RUN_RADIOLOGY_CAP13 === 'true' ? it : it.skip;

pilot(
  'reconciles the device worklist after release, withdrawal and a lost archive response',
  async () => {
    const lab = await startRadiologyPacsLab();
    const files = mkdtempSync(join(tmpdir(), 'saraya-mwl-'));
    const archiveEnv = {
      RADIOLOGY_ORTHANC_URL: lab.url,
      RADIOLOGY_ORTHANC_USERNAME: lab.username,
      RADIOLOGY_ORTHANC_PASSWORD: lab.password,
      RADIOLOGY_MWL_HOSPITAL_ID: '',
      RADIOLOGY_MWL_STATION_AET: 'SARAYASIM',
    };
    const previous = Object.fromEntries(
      Object.keys(archiveEnv).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, archiveEnv);
    let app: INestApplication | undefined;
    let relay: Server | undefined;
    try {
      const fixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = fixture.createNestApplication();
      await app.init();
      const db = app.get(PrismaService);
      await resetDatabase(db);
      const auth = new AuthHelper(db, app.get(JwtService));
      const { user } = await auth.createTestUser('cap13-mwl', 'synthetic', {
        isDoctor: true,
      });
      const hospitalId = user.hospitalId;
      const patient = await db.patient.create({
        data: { hospitalId, mrn: 'SYN-MWL', fullName: 'اسم^اصطناعي' },
      });
      const encounter = await db.encounter.create({
        data: {
          hospitalId,
          patientId: patient.id,
          doctorId: user.id,
          type: 'OPD',
        },
      });
      const study = await db.radiologyStudy.create({
        data: {
          hospitalId,
          code: 'SYN-MWL-DX',
          name: 'Synthetic X-ray',
          modality: 'dx',
        },
      });
      const foreign = await db.hospital.create({
        data: { name: 'Synthetic outside', code: 'SYN-MWL-OUTSIDE' },
      });
      const outsideStudy = await db.radiologyStudy.create({
        data: {
          hospitalId: foreign.id,
          code: 'SYN-OUT-DX',
          name: 'Outside X-ray',
          modality: 'DX',
        },
      });
      const createExam = (
        paymentStatus: 'PENDING' | 'PAID' | 'WAIVED',
        studyId = study.id,
      ) =>
        db.radiologyOrder.create({
          data: {
            study: { connect: { id: studyId } },
            order: {
              create: {
                hospitalId,
                encounterId: encounter.id,
                orderedById: user.id,
                type: 'RADIOLOGY',
                paymentStatus,
              },
            },
          },
        });
      const unpaid = await createExam('PENDING');
      const released = await createExam('PAID');
      const waived = await createExam('WAIVED');
      const outside = await createExam('PAID', outsideStudy.id);
      const worker = app.get(RadiologyMwlService);
      await worker.synchronize();
      const exam = (id: number) =>
        db.radiologyOrder.findUniqueOrThrow({ where: { id } });
      const find = (accession = '', station = 'SARAYASIM'): unknown =>
        JSON.parse(lab.simulate('find-mwl', accession, station));
      expect(find()).toEqual([]);

      process.env.RADIOLOGY_MWL_HOSPITAL_ID = String(hospitalId);
      // Let Nest's scheduler perform the first publication.
      const deadline = Date.now() + 16_000;
      while (
        !(await exam(waived.id)).dicomMwlCheckedAt &&
        Date.now() < deadline
      )
        await delay(200);
      app.get(SchedulerRegistry).deleteInterval('radiology-mwl-reconcile');
      const scheduled = await exam(released.id);
      const accession = scheduled.dicomAccessionNumber!;
      const worklistId = scheduled.dicomMwlId!;
      const remotePath = `/worklists/${worklistId}`;
      expect(scheduled.dicomMwlCheckedAt).not.toBeNull();
      expect((await exam(unpaid.id)).dicomAccessionNumber).toBeNull();
      expect((await exam(outside.id)).dicomAccessionNumber).toBeNull();
      const found = find(accession);
      const [entry] = found as { studyInstanceUid: string }[];
      expect(entry.studyInstanceUid).toMatch(/^2\.25\./u);
      expect(found).toEqual([
        {
          accession,
          patientId: patient.mrn,
          modality: 'DX',
          studyInstanceUid: entry.studyInstanceUid,
        },
      ]);
      expect(find('', 'OTHERSTATION')).toEqual([]);
      expect(find((await exam(waived.id)).dicomAccessionNumber!)).toHaveLength(
        1,
      );

      // Fail the withdrawal while the device can still query Orthanc.
      expect(
        (await lab.fetchArchive(remotePath, { method: 'DELETE' })).ok,
      ).toBe(true);
      let forwardedPuts = 0;
      relay = createServer((req, res) => {
        void (async () => {
          if (req.method !== 'PUT' || req.url !== remotePath)
            return res.destroy();
          const chunks: Buffer[] = [];
          for await (const chunk of req)
            chunks.push(Buffer.from(chunk as Uint8Array));
          const upstream = await lab.fetchArchive(remotePath, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: Buffer.concat(chunks),
          });
          if (upstream.ok) forwardedPuts++;
          await upstream.body?.cancel();
          res.destroy();
        })().catch(() => res.destroy());
      });
      await new Promise<void>((resolve) =>
        relay!.listen(0, '127.0.0.1', resolve),
      );
      const address = relay.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing relay port');
      process.env.RADIOLOGY_ORTHANC_URL = `http://127.0.0.1:${address.port}`;
      await db.order.update({
        where: { id: waived.orderId },
        data: { status: 'CANCELLED' },
      });
      await worker.synchronize();
      expect(forwardedPuts).toBeGreaterThan(0);
      expect((await exam(waived.id)).dicomMwlMayExist).toBe(true);
      expect(find((await exam(waived.id)).dicomAccessionNumber!)).toHaveLength(
        1,
      );

      process.env.RADIOLOGY_ORTHANC_URL = lab.url;
      await Promise.all([
        worker.synchronize(),
        new RadiologyMwlService(db).synchronize(),
      ]);
      expect((await exam(released.id)).dicomMwlId).toBe(worklistId);
      expect((await exam(waived.id)).dicomMwlMayExist).toBe(false);
      expect(find()).toEqual(found);

      await db.order.update({
        where: { id: released.orderId },
        data: { paymentStatus: 'PENDING' },
      });
      await worker.synchronize();
      expect(find()).toEqual([]);
      await db.order.update({
        where: { id: released.orderId },
        data: { paymentStatus: 'PAID' },
      });
      await app
        .get(RadiologyService)
        .startProcessing(hospitalId, released.id, user.id);
      await worker.synchronize();
      expect(find()).toEqual(found);
      lab.simulate(
        'store',
        join(files, 'synthetic.dcm'),
        accession,
        patient.mrn,
        entry.studyInstanceUid,
      );
      const pacs = app.get(RadiologyPacsService);
      const incorrectUid = `2.25.${BigInt(`0x${randomUUID().replaceAll('-', '')}`)}`;
      await expect(
        pacs.linkStudy(hospitalId, released.id, user.id, incorrectUid),
      ).rejects.toThrow('معرّف الدراسة لا يطابق قائمة الجهاز');
      await pacs.linkStudy(
        hospitalId,
        released.id,
        user.id,
        entry.studyInstanceUid,
      );
      await worker.synchronize();
      expect(find()).toEqual([]);
      expect((await exam(released.id)).dicomMwlMayExist).toBe(false);
      expect(
        (
          await lab.fetchArchive(
            `/dicom-web/studies/${entry.studyInstanceUid}/metadata`,
          )
        ).status,
      ).toBe(200);
    } finally {
      try {
        await app?.close();
        if (relay)
          await new Promise<void>((resolve) => relay!.close(() => resolve()));
      } finally {
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
        rmSync(files, { recursive: true, force: true });
        lab.close();
      }
    }
  },
  180_000,
);
