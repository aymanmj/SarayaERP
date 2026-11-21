import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const run = process.env.RUN_RADIOLOGY_CAP13 === 'true' ? it : it.skip;
const repo = resolve('..');
const waitArgs = ['--wait', '--wait-timeout', '120'];

run(
  'recovers an Orthanc index, images and worklist as a single backup',
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'saraya-archive-test-'));
    const root = `saraya-pacs-test-${randomUUID().slice(0, 12)}`;
    const source = `${root}-source`;
    const target = `${root}-restore`;
    const corrupt = `${root}-corrupt`;
    const env = {
      ...process.env,
      PACS_DB_PASSWORD: randomUUID(),
      PACS_HTTP_USERS: JSON.stringify({ 'cap13-test': randomUUID() }),
      PACS_DICOM_BIND_IP: '127.0.0.1',
      PACS_DICOM_PORT: '0',
      PACS_DICOM_MODALITIES: '{}',
    };
    const docker = (args: string[], input?: Buffer) =>
      execFileSync('docker', args, {
        cwd: repo,
        env,
        input,
        timeout: 150_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    const compose = (project: string, args: string[], input?: Buffer) =>
      docker(
        ['compose', '-f', 'docker-compose.pacs.yml', '-p', project, ...args],
        input,
      );
    const command = (action: string, project: string, bundle: string) =>
      spawnSync(
        process.execPath,
        ['scripts/orthanc-archive.cjs', action, project, bundle],
        { cwd: repo, env, timeout: 200_000, encoding: 'utf8' },
      );
    const perform = (action: string, project: string, bundle: string) => {
      const result = command(action, project, bundle);
      if (result.status !== 0)
        throw new Error(
          `${action} failed: ${result.stdout}\n${result.stderr}`,
          { cause: result.error },
        );
    };
    const call = (
      project: string,
      endpoint: string,
      method = 'GET',
      data?: Buffer,
      accept = 'application/json',
    ) =>
      compose(
        project,
        [
          'exec',
          '-T',
          'orthanc',
          'python3',
          '-c',
          [
            'import base64,json,os,sys,urllib.request',
            'user,password = next(iter(json.loads(os.environ["ORTHANC__REGISTERED_USERS"]).items()))',
            'headers = {"Authorization":"Basic " + base64.b64encode((user + ":" + password).encode()).decode(), "Accept": sys.argv[3]}',
            'if sys.argv[2] != "GET": headers["Content-Type"] = "application/dicom" if sys.argv[1] == "/instances" else "application/json"',
            'request = urllib.request.Request("http://127.0.0.1:8042" + sys.argv[1], method=sys.argv[2], headers=headers, data=sys.stdin.buffer.read() if sys.argv[2] != "GET" else None)',
            'with urllib.request.urlopen(request, timeout=15) as response: sys.stdout.buffer.write(response.read())',
          ].join('\n'),
          endpoint,
          method,
          accept,
        ],
        data,
      );
    const uid = () => `2.25.${BigInt(`0x${randomUUID().replaceAll('-', '')}`)}`;
    const image = (studyUid: string, accession: string) => {
      const file = join(directory, `${accession}.dcm`);
      execFileSync(process.env.RADIOLOGY_DICOM_PYTHON ?? 'python', [
        resolve('test/dicom-modality-simulator.py'),
        'make',
        '0',
        file,
        accession,
        'SYN-RESTORE',
        studyUid,
      ]);
      return readFileSync(file);
    };
    const pixelsFrom = (response: Buffer) => {
      const headerEnd = response.indexOf('\r\n\r\n');
      expect(headerEnd).toBeGreaterThan(0);
      return response.subarray(headerEnd + 4, headerEnd + 4 + 128 * 128);
    };
    try {
      compose(source, ['up', '-d', '--pull', 'never', ...waitArgs]);
      const system = JSON.parse(call(source, '/system').toString()) as {
        DatabaseBackendPlugin: string;
      };
      expect(system.DatabaseBackendPlugin).toMatch(
        /\/libOrthancPostgreSQLIndex\.so$/u,
      );
      const ports = JSON.parse(
        docker([
          'inspect',
          '--format',
          '{{json .NetworkSettings.Ports}}',
          compose(source, ['ps', '-q', 'orthanc']).toString().trim(),
        ]).toString(),
      ) as Record<string, { HostIp: string }[]>;
      expect(ports['4242/tcp'][0].HostIp).toBe('127.0.0.1');
      expect(ports['8042/tcp']).toBeFalsy();
      const studyUid = uid();
      const dicom = image(studyUid, 'RECOVERY');
      const { ID: instance } = JSON.parse(
        call(source, '/instances', 'POST', dicom).toString(),
      ) as { ID: string };
      const worklist = randomUUID();
      call(
        source,
        `/worklists/${worklist}`,
        'PUT',
        Buffer.from(
          JSON.stringify({
            Force: false,
            Tags: {
              PatientID: 'SYN-RESTORE',
              PatientName: 'Synthetic^CAP13',
              AccessionNumber: 'RECOVERY',
              StudyInstanceUID: studyUid,
              ScheduledProcedureStepSequence: [
                {
                  Modality: 'DX',
                  ScheduledStationAETitle: 'SARAYASIM',
                  ScheduledProcedureStepStartDate: '20261120',
                },
              ],
            },
          }),
        ),
      );
      expect(call(source, `/worklists/${worklist}`).toString()).toContain(
        'RECOVERY',
      );
      const archiveFile = call(
        source,
        `/instances/${instance}/file`,
        'GET',
        undefined,
        'application/dicom',
      );
      const metadataPath = `/dicom-web/studies/${studyUid}/metadata`;
      const metadata = call(
        source,
        metadataPath,
        'GET',
        undefined,
        'application/dicom+json',
      );
      const [tags] = JSON.parse(metadata.toString()) as Record<
        string,
        { Value: string[] }
      >[];
      const frame = `/dicom-web/studies/${studyUid}/series/${tags['0020000E'].Value[0]}/instances/${tags['00080018'].Value[0]}/frames/1`;
      const pixels = pixelsFrom(
        call(
          source,
          frame,
          'GET',
          undefined,
          'multipart/related; type=application/octet-stream',
        ),
      );
      expect(pixels.length).toBe(128 * 128);

      compose(source, ['kill', '-s', 'SIGKILL', 'orthanc', 'pacs-db']);
      compose(source, [
        'up',
        '-d',
        '--force-recreate',
        '--pull',
        'never',
        ...waitArgs,
      ]);
      expect(
        call(
          source,
          `/instances/${instance}/file`,
          'GET',
          undefined,
          'application/dicom',
        ),
      ).toEqual(archiveFile);
      expect(call(source, `/worklists/${worklist}`).toString()).toContain(
        'RECOVERY',
      );

      const backup = join(directory, 'paired-backup');
      perform('backup', source, backup);
      expect(
        call(
          source,
          `/instances/${instance}/file`,
          'GET',
          undefined,
          'application/dicom',
        ),
      ).toEqual(archiveFile);
      const laterUid = uid();
      call(source, '/instances', 'POST', image(laterUid, 'AFTERBACKUP'));
      expect(command('restore', source, backup).stderr).toContain(
        'fresh Docker project',
      );

      const damaged = join(directory, 'damaged-backup');
      cpSync(backup, damaged, { recursive: true });
      appendFileSync(join(damaged, 'objects.tar'), 'damaged');
      const rejected = command('restore', corrupt, damaged);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain(
        'Backup checksum mismatch: objects.tar',
      );
      expect(
        docker([
          'volume',
          'ls',
          '-q',
          '--filter',
          `label=com.docker.compose.project=${corrupt}`,
        ])
          .toString()
          .trim(),
      ).toBe('');
      compose(source, ['down', '--volumes']);
      expect(
        docker([
          'volume',
          'ls',
          '-q',
          '--filter',
          `label=com.docker.compose.project=${source}`,
        ])
          .toString()
          .trim(),
      ).toBe('');

      const beforeRestore = Date.now();
      perform('restore', target, backup);
      const qido = call(
        target,
        `/dicom-web/studies?StudyInstanceUID=${studyUid}`,
        'GET',
        undefined,
        'application/dicom+json',
      );
      expect(JSON.parse(qido.toString()) as unknown).toHaveLength(1);
      const excluded = call(
        target,
        `/dicom-web/studies?StudyInstanceUID=${laterUid}`,
        'GET',
        undefined,
        'application/dicom+json',
      );
      expect(JSON.parse(excluded.toString()) as unknown).toEqual([]);
      expect(
        call(
          target,
          `/instances/${instance}/file`,
          'GET',
          undefined,
          'application/dicom',
        ),
      ).toEqual(archiveFile);
      expect(
        pixelsFrom(
          call(
            target,
            frame,
            'GET',
            undefined,
            'multipart/related; type=application/octet-stream',
          ),
        ),
      ).toEqual(pixels);
      expect(call(target, `/worklists/${worklist}`).toString()).toContain(
        'RECOVERY',
      );
      console.log(
        'CAP13_PAIRED_RESTORE',
        JSON.stringify({
          restoreAndVerifyMs: Date.now() - beforeRestore,
          pixelBytes: pixels.length,
          laterStudyExcluded: true,
        }),
      );
    } finally {
      try {
        compose(source, ['down', '--volumes']);
      } finally {
        try {
          compose(target, ['down', '--volumes']);
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    }
  },
  360_000,
);
