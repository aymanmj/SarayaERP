import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { join, resolve } from 'node:path';
import { AppModule } from '../../src/app.module';
import { auditRecordHash } from '../../src/audit/audit-chain';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { LocalizationInterceptor } from '../../src/common/interceptors/localization.interceptor';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { startRadiologyPacsLab } from '../radiology-pacs-lab';
import { startTestGateway } from '../nursing-test-gateway';
import { verifyOhifBrowser } from '../verify-ohif-browser';

const pilot = process.env.RUN_RADIOLOGY_CAP13 === 'true' ? it : it.skip;

pilot(
  'authorizes and audits an OHIF study and confines every DICOMweb request',
  async () => {
    const lab = await startRadiologyPacsLab();
    const archiveEnv = {
      RADIOLOGY_OHIF_ENABLED: 'true',
      RADIOLOGY_ORTHANC_URL: lab.url,
      RADIOLOGY_ORTHANC_USERNAME: lab.username,
      RADIOLOGY_ORTHANC_PASSWORD: lab.password,
      RADIOLOGY_MWL_HOSPITAL_ID: '',
    };
    const previous = Object.fromEntries(
      Object.keys(archiveEnv).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, archiveEnv);
    let app: INestApplication | undefined;
    let gateway: Awaited<ReturnType<typeof startTestGateway>> | undefined;
    try {
      const fixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const expressApp =
        fixture.createNestApplication<NestExpressApplication>();
      app = expressApp;
      expressApp.set('trust proxy', 1);
      app.setGlobalPrefix('api');
      app.use(cookieParser(), helmet());
      app.useGlobalInterceptors(
        new TransformInterceptor(),
        new LocalizationInterceptor(app.get(Reflector)),
      );
      app.useGlobalFilters(new AllExceptionsFilter());
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const db = app.get(PrismaService);
      await resetDatabase(db);
      const jwt = app.get(JwtService);
      const auth = new AuthHelper(db, jwt);
      const clinician = await auth.createTestUser(
        'cap13-viewer-doctor',
        'synthetic',
        { isDoctor: true, permissions: ['radiology:view'] },
      );
      const hospitalId = clinician.user.hospitalId;
      const manager = await auth.createTestUser(
        'cap13-viewer-radiologist',
        'synthetic',
        { hospitalId, permissions: ['radiology:manage'] },
      );
      const colleague = await auth.createTestUser(
        'cap13-viewer-colleague',
        'synthetic',
        { hospitalId, permissions: ['radiology:view'] },
      );
      const cashier = await auth.createTestUser(
        'cap13-viewer-cashier',
        'synthetic',
        { hospitalId, permissions: ['cashier:manage'] },
      );
      const otherHospital = await db.hospital.create({
        data: { name: 'Synthetic outside', code: 'CAP13-VIEW-OUT' },
      });
      const outside = await auth.createTestUser(
        'cap13-viewer-out',
        'synthetic',
        { hospitalId: otherHospital.id, permissions: ['radiology:manage'] },
      );
      const patient = await db.patient.create({
        data: { hospitalId, mrn: 'CAP13-VIEW', fullName: 'Synthetic viewer' },
      });
      const encounter = await db.encounter.create({
        data: {
          hospitalId,
          patientId: patient.id,
          doctorId: clinician.user.id,
          type: 'OPD',
        },
      });
      const study = await db.radiologyStudy.create({
        data: {
          hospitalId,
          code: 'CAP13-VIEW-DX',
          name: 'Synthetic X-ray',
          modality: 'DX',
        },
      });
      const uid = () =>
        `2.25.${BigInt(`0x${randomUUID().replaceAll('-', '')}`)}`;
      const studyUid = uid();
      const otherUid = uid();
      const createExam = (
        dicomStudyUid: string,
        dicomAccessionNumber: string,
      ) =>
        db.radiologyOrder.create({
          data: {
            study: { connect: { id: study.id } },
            dicomStudyUid,
            dicomAccessionNumber,
            status: 'IN_PROGRESS',
            pacsUrl: `${lab.url}/private`,
            order: {
              create: {
                hospitalId,
                encounterId: encounter.id,
                orderedById: clinician.user.id,
                type: 'RADIOLOGY',
                paymentStatus: 'PAID',
              },
            },
          },
        });
      const order = await createExam(studyUid, 'CAP13VIEW');
      const otherOrder = await createExam(otherUid, 'CAP13OTHER');
      const output = resolve('../scratch/radiology-cap13-20261119');
      mkdirSync(output, { recursive: true });
      lab.simulate(
        'store',
        join(output, 'synthetic-viewer.dcm'),
        'CAP13VIEW',
        patient.mrn,
        studyUid,
      );
      lab.simulate(
        'store',
        join(output, 'synthetic-viewer-other.dcm'),
        'CAP13OTHER',
        patient.mrn,
        otherUid,
      );

      const root = `/api/radiology/viewer/${order.id}`;
      const viewer = `${root}/viewer?StudyInstanceUIDs=${studyUid}`;
      const dicom = `${root}/dicom-web`;
      const metadataPath = `${dicom}/studies/${studyUid}/metadata`;
      const staffCookie = (accessToken: string) =>
        `Authentication=${accessToken}`;
      const get = (path: string, cookie?: string, accept = '*/*') =>
        fetch(`${origin}${path}`, {
          redirect: 'manual',
          headers: cookie ? { cookie, accept } : { accept },
          signal: AbortSignal.timeout(15_000),
        });
      const doctorCookie = staffCookie(clinician.accessToken);
      const readerCookie = staffCookie(manager.accessToken);
      expect((await get(viewer)).status).toBe(401);
      expect((await get(viewer, staffCookie(cashier.accessToken))).status).toBe(
        403,
      );
      expect(
        (await get(viewer, staffCookie(colleague.accessToken))).status,
      ).toBe(404);
      expect((await get(viewer, staffCookie(outside.accessToken))).status).toBe(
        404,
      );
      expect(
        (
          await get(
            `${root}/viewer?StudyInstanceUIDs=${otherUid}`,
            doctorCookie,
          )
        ).status,
      ).toBe(404);
      expect((await get(metadataPath, doctorCookie)).status).toBe(401);

      const worklist = await get('/api/radiology/worklist', readerCookie);
      const listing = (await worklist.json()) as { data: { id: number }[] };
      expect(listing.data.find((item) => item.id === order.id)).toMatchObject({
        viewerUrl: `${root}/viewer`,
        pacsUrl: null,
      });
      const chart = `/api/radiology/encounters/${encounter.id}/orders`;
      const chartStudy = async (cookie: string) => {
        const result = (await (await get(chart, cookie)).json()) as {
          data: { id: number; viewerUrl: string | null }[];
        };
        return result.data.find((item) => item.id === order.id)?.viewerUrl;
      };
      expect(await chartStudy(doctorCookie)).toBe(`${root}/viewer`);
      expect(await chartStudy(staffCookie(colleague.accessToken))).toBeNull();
      expect(
        (await get(`${root}/viewer`, doctorCookie)).headers.get('location'),
      ).toBe(viewer);
      const launch = await get(viewer, doctorCookie);
      expect(launch.status).toBe(200);
      expect(launch.headers.get('cache-control')).toContain('no-store');
      expect(launch.headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'",
      );
      expect(await launch.text()).not.toContain('init-service-worker');
      const opened = await db.auditLog.findFirstOrThrow({
        where: { action: 'RADIOLOGY_DICOM_VIEW_OPENED', entityId: order.id },
      });
      expect(opened).toMatchObject({
        userId: clinician.user.id,
        hospitalId,
        entity: 'RadiologyOrder',
      });
      const { id: auditId, hash, ...signed } = opened;
      expect(auditId).toBeGreaterThan(0);
      expect(hash).toBe(auditRecordHash(signed));
      const grantHeader = launch.headers.get('set-cookie') ?? '';
      expect(grantHeader).toContain(`Path=${dicom}`);
      expect(grantHeader).toContain('HttpOnly');
      const grant = grantHeader.split(';')[0];
      const granted = `${doctorCookie}; ${grant}`;
      expect((await get(metadataPath, grant)).status).toBe(401);
      expect(
        (await get(metadataPath, `${readerCookie}; ${grant}`)).status,
      ).toBe(401);
      expect(
        (await get(metadataPath, `${doctorCookie}; ${grant}invalid`)).status,
      ).toBe(401);
      expect((await get(`${dicom}/studies`, granted)).status).toBe(404);
      expect(
        (
          await get(
            `${dicom}/studies?StudyInstanceUID=${studyUid}&StudyInstanceUID=${otherUid}`,
            granted,
          )
        ).status,
      ).toBe(404);
      expect(
        (await get(`${dicom}/studies/${otherUid}/metadata`, granted)).status,
      ).toBe(404);
      expect(
        (
          await get(
            `/api/radiology/viewer/${otherOrder.id}/dicom-web/studies/${otherUid}/metadata`,
            granted,
          )
        ).status,
      ).toBe(401);
      const qido = await get(
        `${dicom}/studies?StudyInstanceUID=${studyUid}`,
        granted,
        'application/dicom+json',
      );
      expect(qido.status).toBe(200);
      expect((await qido.json()) as unknown).toEqual([
        expect.objectContaining({
          '0020000D': { vr: 'UI', Value: [studyUid] },
        }),
      ]);
      const metadata = await get(
        metadataPath,
        granted,
        'application/dicom+json',
      );
      expect(metadata.status).toBe(200);
      expect(metadata.headers.get('content-type')).toContain(
        'application/dicom+json',
      );
      expect(metadata.headers.get('cache-control')).toContain('no-store');
      const metadataText = await metadata.text();
      expect(metadataText).not.toContain(lab.url);
      expect(metadataText).not.toContain(otherUid);
      const [instance] = JSON.parse(metadataText) as Record<
        string,
        { Value: string[] }
      >[];
      const frames = `${dicom}/studies/${studyUid}/series/${instance['0020000E'].Value[0]}/instances/${instance['00080018'].Value[0]}/frames/1`;
      const frame = await get(
        frames,
        granted,
        'multipart/related; type=application/octet-stream',
      );
      expect(frame.status).toBe(200);
      expect((await frame.arrayBuffer()).byteLength).toBeGreaterThan(128 * 128);
      expect(
        (
          await fetch(`${origin}${dicom}/studies`, {
            method: 'POST',
            headers: { cookie: granted },
          })
        ).status,
      ).toBe(404);
      const config = await get(`${root}/app-config.js`, doctorCookie);
      expect(await config.text()).toContain(`"wadoRoot":"${dicom}"`);

      if (process.env.RADIOLOGY_LAB_BROWSER) {
        if (process.env.RADIOLOGY_LAB_GATEWAY === 'true') {
          gateway = await startTestGateway([origin]);
          const httpsProbe = (path: string) =>
            new Promise<{
              status?: number;
              referrer?: string;
              cookie?: string;
            }>((ok, fail) => {
              const probe = httpsGet(
                `${gateway!.url}${path}`,
                {
                  ca: gateway!.ca,
                  timeout: 8_000,
                  headers: { cookie: readerCookie },
                },
                (response) => {
                  response.resume();
                  response.once('end', () =>
                    ok({
                      status: response.statusCode,
                      referrer: response.headers['referrer-policy']?.toString(),
                      cookie: response.headers['set-cookie']?.[0],
                    }),
                  );
                  response.once('error', fail);
                },
              );
              probe.once('timeout', () =>
                probe.destroy(new Error('Nginx probe timed out')),
              );
              probe.once('error', fail);
            });
          expect((await httpsProbe('/api/radiology-log-probe')).status).toBe(
            404,
          );
          const gatewayLaunch = await httpsProbe(viewer);
          expect(gatewayLaunch.status).toBe(200);
          expect(gatewayLaunch.referrer).toMatch(/no-referrer$/u);
          expect(gatewayLaunch.cookie).toContain('Secure');
        }
        const browser = await verifyOhifBrowser(
          process.env.RADIOLOGY_LAB_BROWSER,
          new URL(viewer, gateway?.url ?? origin),
          {
            staffToken: manager.accessToken,
            dicomRoot: dicom,
            trustedCertificate: gateway?.ca,
          },
          output,
          'ohif-cap13-protected.png',
        );
        console.log(
          'CAP13_PROTECTED_OHIF',
          JSON.stringify({ ...browser, throughNginx: !!gateway }),
        );
        if (gateway) {
          const logs = gateway.accessLog();
          expect(logs).toContain('/api/radiology-log-probe');
          expect(logs).not.toContain(studyUid);
        }
      }
      const managerLaunch = await get(viewer, readerCookie);
      expect(managerLaunch.status).toBe(200);
      const managerGrant = managerLaunch.headers
        .get('set-cookie')
        ?.split(';')[0];
      await db.userRole.deleteMany({ where: { userId: manager.user.id } });
      expect(
        (await get(metadataPath, `${readerCookie}; ${managerGrant}`)).status,
      ).toBe(403);
      const claims = jwt.decode<{ sid: string }>(clinician.accessToken);
      await db.staffSession.update({
        where: { id: claims.sid },
        data: { revokedAt: new Date() },
      });
      expect(
        (
          await get(
            frames,
            granted,
            'multipart/related; type=application/octet-stream',
          )
        ).status,
      ).toBe(401);
    } finally {
      try {
        try {
          gateway?.close();
        } finally {
          await app?.close();
        }
      } finally {
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
        lab.close();
      }
    }
  },
  180_000,
);
