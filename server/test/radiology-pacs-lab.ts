import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function startRadiologyPacsLab() {
  const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
  if (
    process.env.NODE_ENV !== 'test' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '15432' ||
    database.pathname !== '/saraya_repair_test'
  )
    throw new Error('Use the isolated repair test harness for CAP13');
  const name = `saraya-test-pacs-${randomUUID()}`;
  const username = 'saraya-cap13';
  const password = randomUUID();
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const docker = (...args: string[]) =>
    execFileSync('docker', args, { encoding: 'utf8', timeout: 25000 }).trim();
  docker(
    'create',
    '--name',
    name,
    '--label',
    'saraya.purpose=repair-test',
    '--pull=never',
    '-p',
    '127.0.0.1::8042',
    '-p',
    '127.0.0.1::4242',
    '--tmpfs',
    '/var/lib/orthanc/db',
    '-e',
    'DICOM_WEB_PLUGIN_ENABLED=true',
    '-e',
    'WORKLISTS_PLUGIN_ENABLED=true',
    '-e',
    'OHIF_PLUGIN_ENABLED=true',
    '-e',
    'ORTHANC__OHIF__DATA_SOURCE=dicom-web',
    '-e',
    'ORTHANC__DICOM_AET=SARAYAPACS',
    '-e',
    'ORTHANC__DICOM_ALWAYS_ALLOW_STORE=true',
    '-e',
    'ORTHANC__DICOM_ALWAYS_ALLOW_FIND_WORKLIST=true',
    '-e',
    'ORTHANC__WORKLISTS__ENABLE=true',
    '-e',
    'ORTHANC__WORKLISTS__SAVE_IN_ORTHANC_DATABASE=true',
    '-e',
    'ORTHANC__WORKLISTS__FILTER_ISSUER_AET=true',
    '-e',
    'ORTHANC__WORKLISTS__DELETE_WORKLISTS_ON_STABLE_STUDY=false',
    '-e',
    'ORTHANC__WORKLISTS__DELETE_WORKLISTS_DELAY=0',
    '-e',
    'ORTHANC__AUTHENTICATION_ENABLED=true',
    '-e',
    `ORTHANC__REGISTERED_USERS=${JSON.stringify({ [username]: password })}`,
    process.env.RADIOLOGY_LAB_IMAGE ?? 'orthancteam/orthanc:latest',
  );
  const close = () => docker('rm', '-f', '-v', name);
  try {
    docker('start', name);
    const http = docker('port', name, '8042/tcp');
    const dicom = docker('port', name, '4242/tcp');
    if (!/^127\.0\.0\.1:\d+$/.test(http) || !/^127\.0\.0\.1:\d+$/.test(dicom))
      throw new Error('Expected loopback-only PACS bindings');
    const port = dicom.split(':')[1];
    const url = `http://${http}`;
    const fetchArchive = (path: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      headers.set('authorization', authorization);
      return fetch(url + path, {
        ...options,
        headers,
        signal: AbortSignal.timeout(8000),
      });
    };
    const deadline = Date.now() + 60_000;
    let lastProbe = 'connection unavailable';
    while (Date.now() < deadline) {
      try {
        const probe = await fetchArchive('/system');
        lastProbe = `HTTP ${probe.status}`;
        await probe.body?.cancel();
        if (probe.ok) {
          const viewer = await fetchArchive('/ohif/viewer');
          lastProbe = `OHIF HTTP ${viewer.status}`;
          await viewer.body?.cancel();
          if (!viewer.ok) {
            await delay(500);
            continue;
          }
          return {
            url,
            username,
            password,
            imageId: docker('inspect', '--format', '{{.Image}}', name),
            fetchArchive,
            simulate: (command: string, ...args: string[]) =>
              execFileSync(
                process.env.RADIOLOGY_DICOM_PYTHON ?? 'python',
                [
                  resolve('test/dicom-modality-simulator.py'),
                  command,
                  port,
                  ...args,
                ],
                { encoding: 'utf8', timeout: 20000 },
              ).trim(),
            close,
          };
        }
      } catch (error) {
        lastProbe =
          error instanceof Error ? error.message : 'connection unavailable';
      }
      await delay(500);
    }
    const state = docker(
      'inspect',
      '--format',
      '{{.State.Status}}/{{.State.ExitCode}}',
      name,
    );
    throw new Error(
      `Orthanc test archive did not start (${state}; ${lastProbe})`,
    );
  } catch (error) {
    try {
      close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Orthanc test archive setup and cleanup failed',
      );
    }
    throw error;
  }
}
