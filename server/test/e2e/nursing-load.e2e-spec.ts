import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StaffRealtimeBus } from '../../src/websocket/staff-realtime.bus';
import { AuthHelper } from '../auth-helper';
import { resetDatabase } from '../db-reset';
import { responseBody } from '../http-response';
import { startTestGateway } from '../nursing-test-gateway';

const run = process.env.NURSING_LOAD_TEST === 'true' ? it : it.skip;
const sustained = process.env.NURSING_LOAD_SUSTAINED === 'true';
const profilePhases = sustained && process.env.NURSING_LOAD_PROFILE === 'true';
const useGateway = process.env.NURSING_LOAD_GATEWAY === 'true';
const sharedAddress = process.env.NURSING_LOAD_SHARED_ADDRESS === 'true';
const events = ['medication_update', 'vitals_update', 'patient_alert'] as const;
type ClinicalEvent = (typeof events)[number];
type Notification = {
  administrationId?: number;
  vitalSignId?: number;
};
type Recovery = {
  cursor: string;
  hasMore: boolean;
  messages: { event: ClinicalEvent; payload: Notification }[];
  error?: string;
};
type Key = string;
type Operation = {
  keys: Key[];
  duration: number;
  started: number;
  kind: 'medication' | 'vitals';
};

function key(event: ClinicalEvent, payload: Notification): Key {
  const id =
    event === 'medication_update'
      ? payload.administrationId
      : payload.vitalSignId;
  if (!id) throw new Error(`Missing record identifier for ${event}`);
  return `${event}:${id}`;
}

function metrics(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) =>
    Number(sorted[Math.ceil(sorted.length * p) - 1]?.toFixed(1));
  return {
    samples: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: percentile(1),
  };
}

async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 12000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timeout: ${label}`);
    await delay(20);
  }
}

function baseUrl(node: INestApplication<Server>) {
  const address = node.getHttpServer().address();
  if (!address || typeof address === 'string')
    throw new Error('Expected local HTTP port');
  return `http://127.0.0.1:${address.port}`;
}

function startWorker(workers: ChildProcess[]) {
  const worker = fork(resolve('test/nursing-load-worker.cjs'), [], {
    execArgv: [],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  workers.push(worker);
  return new Promise<string>((ready, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Nursing worker startup timeout')),
      30000,
    );
    worker.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Nursing worker exited before readiness (${code})`));
    });
    worker.once('message', (message: unknown) => {
      clearTimeout(timeout);
      const port = (message as { port?: unknown } | null)?.port;
      if (
        typeof port !== 'number' ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        reject(new Error('Unexpected nursing worker address'));
        return;
      }
      ready(`http://127.0.0.1:${port}`);
    });
  });
}

function stopWorker(worker: ChildProcess) {
  return new Promise<void>((done) => {
    if (worker.exitCode !== null || worker.signalCode !== null || !worker.pid) {
      done();
      return;
    }
    const timeout = setTimeout(() => worker.kill(), 10000);
    worker.once('exit', () => {
      clearTimeout(timeout);
      done();
    });
    if (worker.connected) worker.send('shutdown');
  });
}

type PhaseProfile = { samples: Record<string, number[]>; incomplete: number };

function readWorkerProfile(worker: ChildProcess) {
  return new Promise<PhaseProfile>((done, reject) => {
    const timeout = setTimeout(() => {
      worker.off('message', receive);
      reject(new Error('Nursing worker profile timeout'));
    }, 5000);
    function receive(message: unknown) {
      clearTimeout(timeout);
      const profile = (message as { profile?: PhaseProfile } | null)?.profile;
      if (profile) done(profile);
      else reject(new Error('Nursing worker did not return phase timings'));
    }
    worker.once('message', receive);
    worker.send('profile', (error) => {
      if (!error) return;
      clearTimeout(timeout);
      worker.off('message', receive);
      reject(error);
    });
  });
}

function observeLocks(db: PrismaClient) {
  let running = true;
  let snapshots = 0;
  let occupied = 0;
  const waits = new Map<string, Map<string, number>>();
  const finished = (async () => {
    while (running) {
      const rows = await db.$queryRaw<
        { kind: string; pid: number; started: Date; age: number }[]
      >`
        SELECT CASE
          WHEN l.locktype = 'advisory' AND l.objsubid = 1 AND l.objid = 27001 THEN 'audit_chain'
          WHEN l.locktype = 'advisory' AND l.objsubid = 2 AND l.classid = 27009 THEN 'medication'
          WHEN l.locktype = 'advisory' AND l.objsubid = 2 AND l.classid = 27018 THEN 'notification_journal'
          ELSE l.locktype
        END AS kind, l.pid, l.waitstart AS started,
        EXTRACT(EPOCH FROM (clock_timestamp() - l.waitstart))::float8 * 1000 AS age
        FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE a.datname = current_database() AND NOT l.granted AND l.waitstart IS NOT NULL
      `;
      snapshots++;
      occupied += rows.length;
      for (const { kind, pid, started, age } of rows) {
        const bucket = waits.get(kind) ?? new Map<string, number>();
        const id = `${pid}:${started.toISOString()}`;
        bucket.set(id, Math.max(bucket.get(id) ?? 0, age));
        waits.set(kind, bucket);
      }
      if (running) await delay(50);
    }
    return {
      snapshots,
      meanWaitingBackends: Number((occupied / snapshots).toFixed(2)),
      sampledWaitAgeMs: Object.fromEntries(
        [...waits].map(([kind, ages]) => [kind, metrics([...ages.values()])]),
      ),
    };
  })();
  void finished.catch(() => undefined);
  return {
    stop: () => {
      running = false;
      return finished;
    },
  };
}

function open(
  node: string,
  token: string,
  ca?: string,
  tryPolling = false,
  reconnection = false,
) {
  const socket = io(`${node}/nursing`, {
    autoConnect: false,
    forceNew: true,
    transports: tryPolling ? ['websocket', 'polling'] : ['websocket'],
    tryAllTransports: tryPolling,
    transportOptions: tryPolling
      ? { websocket: { extraHeaders: { Origin: 'https://rejected.invalid' } } }
      : {},
    reconnection,
    reconnectionDelay: 200,
    reconnectionDelayMax: 200,
    ca,
    extraHeaders: {
      Cookie: `Authentication=${token}`,
      ...(ca ? { Origin: node } : {}),
    },
  });
  const messages = new Map<Key, number[]>();
  for (const event of events) {
    socket.on(event, (payload: Notification) => {
      const id = key(event, payload);
      const times = messages.get(id) ?? [];
      times.push(performance.now());
      messages.set(id, times);
    });
  }
  const ready = new Promise<number>((resolve, reject) => {
    const started = performance.now();
    const timeout = setTimeout(
      () => reject(new Error('Missing nursing snapshot')),
      12000,
    );
    socket.once('initial_data', () => {
      clearTimeout(timeout);
      resolve(performance.now() - started);
    });
  });
  socket.connect();
  return { socket, messages, ready };
}

async function pull(socket: Socket, cursor: string) {
  const started = performance.now();
  const page = (await socket
    .timeout(12000)
    .emitWithAck('recover_notifications', { after: cursor })) as Recovery;
  if (page.error) throw new Error(`Recovery failed: ${page.error}`);
  return { page, duration: performance.now() - started };
}

describe('Opt-in two-instance nursing load', () => {
  run(
    'measures writes, live delivery and ordered catch-up with zero discrepancies',
    async () => {
      const target = new URL(
        process.env.DATABASE_URL || 'postgresql://invalid',
      );
      if (
        process.env.NODE_ENV !== 'test' ||
        target.hostname !== '127.0.0.1' ||
        target.port !== '15432' ||
        target.pathname !== '/saraya_repair_test' ||
        process.env.REDIS_HOST !== '127.0.0.1' ||
        process.env.REDIS_PORT !== '16379'
      ) {
        throw new Error(
          'Run the nursing workload through the isolated repair-test harness',
        );
      }
      const nodes: INestApplication<Server>[] = [];
      const workers: ChildProcess[] = [];
      const fixtureDb = sustained ? new PrismaClient() : undefined;
      const sockets: Socket[] = [];
      let gateway: Awaited<ReturnType<typeof startTestGateway>> | undefined;
      let gatewayAgent: HttpsAgent | undefined;
      const stationAgents: HttpsAgent[] = [];
      try {
        if (useGateway && !sustained)
          throw new Error('The gateway workload requires independent workers');
        if (sharedAddress && (!useGateway || profilePhases))
          throw new Error(
            'Shared address requires the gateway without phase profiling',
          );
        let addresses: string[];
        if (fixtureDb) {
          await resetDatabase(fixtureDb);
          addresses = await Promise.all([
            startWorker(workers),
            startWorker(workers),
          ]);
          expect(new Set(workers.map(({ pid }) => pid)).size).toBe(2);
          console.log(
            'NURSING_LOAD_WORKERS',
            workers.map(({ pid }) => pid),
          );
        } else {
          for (let index = 0; index < 2; index++) {
            const module = await Test.createTestingModule({
              imports: [AppModule],
            }).compile();
            const node =
              module.createNestApplication<INestApplication<Server>>();
            nodes.push(node);
            node.useGlobalPipes(
              new ValidationPipe({ whitelist: true, transform: true }),
            );
            await node.listen(0, '127.0.0.1');
          }
          await until(
            () => nodes.every((node) => node.get(StaffRealtimeBus).isReady()),
            'Redis',
          );
          await resetDatabase(nodes[0].get(PrismaService));
          addresses = nodes.map(baseUrl);
        }
        const db = fixtureDb ?? nodes[0]?.get(PrismaService);
        if (!db) throw new Error('Expected an isolated workload database');
        if (useGateway) {
          gateway = await startTestGateway(addresses);
          gatewayAgent = new HttpsAgent({ keepAlive: true, ca: gateway.ca });
          console.log('NURSING_GATEWAY_IMAGE', gateway.imageId);
        }
        const profiles = sharedAddress
          ? [{ name: 'shared-address', pairs: 144, writers: 8, readers: 8 }]
          : sustained
            ? [{ name: 'sustained', pairs: 1440, writers: 12, readers: 8 }]
            : [
                { name: 'serial', pairs: 24, writers: 1, readers: 1 },
                { name: 'concurrent', pairs: 72, writers: 12, readers: 8 },
              ];
        const dosesPerPatient = Math.ceil(
          profiles.reduce((total, { pairs }) => total + pairs, 0) / 12,
        );
        const [hospital, outside] = await Promise.all([
          db.hospital.create({
            data: { code: 'NURSING-LOAD', name: 'Synthetic Load Hospital' },
          }),
          db.hospital.create({
            data: {
              code: 'NURSING-OUTSIDE',
              name: 'Synthetic Outside Hospital',
            },
          }),
        ]);
        const auth = new AuthHelper(
          db,
          fixtureDb ? new JwtService() : nodes[0].get(JwtService),
        );
        const writer = await auth.createTestUser(
          'nursing-load-writer',
          'synthetic-load',
          {
            hospitalId: hospital.id,
            permissions: [
              'nursing:view',
              'nursing:medications:administer',
              'vitals:manage',
            ],
          },
        );
        const outsider = await auth.createTestUser(
          'nursing-load-outsider',
          'synthetic-load',
          {
            hospitalId: outside.id,
            permissions: ['nursing:view'],
          },
        );
        const stationTokens: string[] = [];
        if (sharedAddress && gateway) {
          for (let index = 0; index < 8; index++) {
            const station = await auth.createTestUser(
              `nursing-shared-station-${index}`,
              'synthetic-load',
              {
                hospitalId: hospital.id,
                permissions: [
                  'nursing:view',
                  'nursing:medications:administer',
                  'vitals:manage',
                ],
              },
            );
            stationTokens.push(station.accessToken);
            stationAgents.push(
              new HttpsAgent({ keepAlive: true, ca: gateway.ca }),
            );
          }
        }
        const barcode = '6281009876543';
        const drug = await db.product.create({
          data: {
            hospitalId: hospital.id,
            code: 'SYN-LOAD-DRUG',
            name: 'Synthetic Load Drug',
            type: 'DRUG',
            barcode,
          },
        });
        const patients: {
          encounterId: number;
          mrn: string;
          items: { id: number }[];
        }[] = [];
        for (let index = 0; index < 12; index++) {
          const patient = await db.patient.create({
            data: {
              hospitalId: hospital.id,
              mrn: `SYN-LOAD-${index}`,
              fullName: `Synthetic Patient ${index}`,
              dateOfBirth: new Date('1980-01-01'),
            },
          });
          const encounter = await db.encounter.create({
            data: {
              hospitalId: hospital.id,
              patientId: patient.id,
              doctorId: writer.user.id,
              type: 'IPD',
              status: 'OPEN',
            },
          });
          const prescription = await db.prescription.create({
            data: {
              hospitalId: hospital.id,
              patientId: patient.id,
              encounterId: encounter.id,
              doctorId: writer.user.id,
              status: 'ACTIVE',
              pharmacistVerificationStatus: 'VERIFIED',
              items: {
                create: Array.from({ length: dosesPerPatient }, () => ({
                  productId: drug.id,
                  dose: '1g',
                  route: 'IV',
                  frequency: 'BID',
                  durationDays: 1,
                  quantity: 1,
                })),
              },
            },
            include: {
              items: { orderBy: { id: 'asc' }, select: { id: true } },
            },
          });
          patients.push({
            encounterId: encounter.id,
            mrn: patient.mrn,
            items: prescription.items,
          });
        }
        const connect = (index: number, token: string) => {
          const connection = open(
            gateway?.url ?? addresses[index],
            token,
            gateway?.ca,
          );
          sockets.push(connection.socket);
          return connection;
        };

        if (gateway) {
          const polling = open(
            gateway.url,
            writer.accessToken,
            gateway.ca,
            true,
          );
          sockets.push(polling.socket);
          await polling.ready;
          expect(polling.socket.io.engine.transport.name).toBe('polling');
          expect(await pull(polling.socket, '0')).toMatchObject({
            page: { messages: [], hasMore: false },
          });
          polling.socket.disconnect();
        }

        let offset = 0;
        for (const profile of profiles) {
          const startCursor =
            (
              await db.nursingNotification.findFirst({
                where: { hospitalId: hospital.id },
                orderBy: { id: 'desc' },
                select: { id: true },
              })
            )?.id.toString() ?? '0';
          const foreign = connect(1, outsider.accessToken);
          const observers = sharedAddress
            ? stationTokens
            : [writer.accessToken, writer.accessToken];
          const receivers = observers.map((token, index) =>
            connect(index % 2, token),
          );
          const readers = Array.from({ length: profile.readers }, (_, index) =>
            connect(index % 2, stationTokens[index] ?? writer.accessToken),
          );
          const snapshots = await Promise.all(
            [foreign, ...receivers, ...readers].map((reader) => reader.ready),
          );
          const criticalCount = Math.ceil(profile.pairs / 6);
          const expectedCount = profile.pairs * 2 + criticalCount;
          const nextPhase = offset;
          offset += profile.pairs;
          const start = performance.now();
          const recoveries = Promise.all(
            readers.map(async ({ socket }) => {
              const recovered: Key[] = [];
              const durations: number[] = [];
              const populatedPages: number[] = [];
              let cursor = startCursor;
              const limit =
                Date.now() + (useGateway ? 240000 : sustained ? 150000 : 35000);
              while (recovered.length < expectedCount) {
                if (Date.now() >= limit)
                  throw new Error(
                    `Incomplete recovery: ${recovered.length}/${expectedCount}`,
                  );
                const { page, duration } = await pull(socket, cursor);
                if (BigInt(page.cursor) < BigInt(cursor))
                  throw new Error('Recovery cursor moved backwards');
                cursor = page.cursor;
                durations.push(duration);
                if (page.messages.length) populatedPages.push(duration);
                recovered.push(
                  ...page.messages.map(({ event, payload }) =>
                    key(event, payload),
                  ),
                );
                if (recovered.length < expectedCount) await delay(350);
              }
              return {
                recovered,
                durations,
                populatedPages,
                elapsed: performance.now() - start,
              };
            }),
          );

          const throttled = {
            medication: 0,
            vitals: 0,
            stations: new Set<number>(),
          };
          let nextRetryAt = 0;
          const write = async (
            pair: number,
            medication: boolean,
          ): Promise<Operation> => {
            const fixtureIndex = nextPhase + pair;
            const fixture = patients[fixtureIndex % patients.length];
            const endpoint = request(
              gateway?.url ?? addresses[(pair + (medication ? 0 : 1)) % 2],
            );
            const stationIndex = pair % 8;
            const token = stationTokens[stationIndex] ?? writer.accessToken;
            const agent = stationAgents[stationIndex] ?? gatewayAgent;
            const critical = !medication && pair % 6 === 0;
            const path = medication
              ? `/nursing/encounters/${fixture.encounterId}/administer-barcode`
              : `/vitals/encounter/${fixture.encounterId}`;
            const body = medication
              ? {
                  prescriptionItemId:
                    fixture.items[Math.floor(fixtureIndex / patients.length)]
                      .id,
                  requestId: randomUUID(),
                  patientBarcode: fixture.mrn,
                  drugBarcode: barcode,
                }
              : { pulse: critical ? 125 : 80, requestId: randomUUID() };
            const post = () => {
              const call = endpoint
                .post(gateway ? `/api${path}` : path)
                .auth(token, { type: 'bearer' })
                .send(body);
              return agent ? call.agent(agent) : call;
            };
            const started = performance.now();
            const kind = medication ? 'medication' : 'vitals';
            const first = sharedAddress
              ? await post()
              : await post().expect(201);
            let saved = first;
            if (sharedAddress && first.status === 429) {
              throttled[kind]++;
              throttled.stations.add(stationIndex);
              const now = performance.now();
              const retryAt = Math.max(now + 3000, nextRetryAt);
              nextRetryAt = retryAt + 30;
              await delay(retryAt - now);
              saved = await post().expect(201);
            }
            expect(saved.status).toBe(201);
            const { id } = responseBody<{ id: number }>(saved);
            return {
              keys: [
                `${medication ? 'medication_update' : 'vitals_update'}:${id}`,
                ...(critical ? [`patient_alert:${id}`] : []),
              ],
              duration: performance.now() - started,
              started,
              kind,
            };
          };
          const lockProbe = sustained ? observeLocks(db) : undefined;
          const plan = Array.from({ length: profile.pairs }, (_, pair) => [
            { pair, medication: true },
            { pair, medication: false },
          ]).flat();
          if (gateway) {
            // Interleave bursts of both kinds so strict alternation does not
            // synchronize the two request types with round-robin routing.
            for (let index = 1; index + 1 < plan.length; index += 4)
              [plan[index], plan[index + 1]] = [plan[index + 1], plan[index]];
          }
          let operation = 0;
          let nextGatewayWriteAt = start;
          const writes = (async () => {
            let firstWave: Operation[] = [];
            if (sharedAddress && gateway) {
              // Fill the shared ingress allowance with lightweight requests,
              // then test clinical writes without flooding the database pool.
              let reachedLimit!: () => void;
              const rejected = new Promise<void>((resolve) => {
                reachedLimit = resolve;
              });
              const endpoint = request(gateway.url);
              const fillDeadline = performance.now() + 5000;
              let filling = true;
              const pressure = Promise.all(
                stationAgents.map(async (agent) => {
                  while (filling && performance.now() < fillDeadline) {
                    const response = await endpoint.get('/api/').agent(agent);
                    if (response.status === 429) reachedLimit();
                    else expect(response.status).toBe(200);
                    await delay(20);
                  }
                }),
              );
              await Promise.race([
                rejected,
                pressure.then(() => {
                  throw new Error('The shared IP limit was not reached');
                }),
              ]);
              const wave = Promise.all(
                plan
                  .slice(0, 16)
                  .map(({ pair, medication }) => write(pair, medication)),
              );
              [firstWave] = await Promise.all([
                wave,
                delay(800).then(() => {
                  filling = false;
                  return pressure;
                }),
              ]);
              operation = firstWave.length;
            }
            const remaining = await Promise.all(
              Array.from({ length: profile.writers }, async () => {
                const results: Operation[] = [];
                while (operation < plan.length) {
                  const { pair, medication } = plan[operation++];
                  if (gateway) {
                    // This workload uses one source IP. Measure within the
                    // production limit of 50 requests per second per IP.
                    const now = performance.now();
                    const scheduled = Math.max(now, nextGatewayWriteAt);
                    nextGatewayWriteAt = scheduled + 23;
                    if (scheduled > now) await delay(scheduled - now);
                  }
                  results.push(await write(pair, medication));
                }
                return results;
              }),
            );
            return {
              written: [firstWave, ...remaining],
              elapsed: performance.now() - start,
            };
          })();
          const [writeResult, caughtUp] = await Promise.all([
            writes,
            recoveries,
          ]).finally(async () => {
            const lockSummary = await lockProbe?.stop();
            if (lockSummary)
              console.log('NURSING_LOCKS', JSON.stringify(lockSummary));
          });
          const operations = writeResult.written.flat();
          if (sharedAddress && gateway) {
            expect(throttled.medication).toBeGreaterThan(0);
            expect(throttled.vitals).toBeGreaterThan(0);
            expect(throttled.stations.size).toBeGreaterThan(1);
            const rejectedWrites = gateway
              .accessLog()
              .split('\n')
              .filter(
                (line) =>
                  /"POST \/api\/(?:nursing|vitals)\/.*" 429 /.test(line) &&
                  line.endsWith('lrs=REJECTED'),
              );
            expect(rejectedWrites).toHaveLength(
              throttled.medication + throttled.vitals,
            );
            expect(
              new Set(rejectedWrites.map((line) => line.split(' ', 1)[0])).size,
            ).toBe(1);
            console.log(
              'NURSING_SHARED_ADDRESS',
              JSON.stringify({
                stations: stationTokens.length,
                throttledStations: throttled.stations.size,
                medication429: throttled.medication,
                vitals429: throttled.vitals,
              }),
            );
          }
          const expected = operations.flatMap(({ keys }) => keys).sort();
          expect(expected).toHaveLength(expectedCount);
          const committed = await db.nursingNotification.findMany({
            where: { hospitalId: hospital.id, id: { gt: BigInt(startCursor) } },
            orderBy: { id: 'asc' },
            select: { kind: true, recordId: true },
          });
          expect(committed).toHaveLength(profile.pairs * 2);
          const byRecord = new Map(
            operations.map(({ keys }) => [keys[0], keys] as const),
          );
          const journalOrder = committed.flatMap(
            ({ kind, recordId }) =>
              byRecord.get(
                `${kind === 'medication' ? 'medication_update' : 'vitals_update'}:${recordId}`,
              ) ?? [],
          );
          expect(journalOrder).toHaveLength(expectedCount);
          for (const reader of caughtUp)
            expect(reader.recovered).toEqual(journalOrder);
          await until(
            () =>
              receivers.every(({ messages }) => messages.size >= expectedCount),
            'live delivery',
          );
          const live = receivers.flatMap(({ messages }) => {
            expect([...messages.keys()].sort()).toEqual(expected);
            return operations.flatMap(({ keys, started }) =>
              keys.map((id) => {
                const times = messages.get(id);
                expect(times).toHaveLength(1);
                return times![0] - started;
              }),
            );
          });
          expect(foreign.messages.size).toBe(0);
          expect((await pull(foreign.socket, '0')).page.messages).toEqual([]);
          if (profilePhases) {
            const reports = await Promise.all(workers.map(readWorkerProfile));
            expect(reports.map(({ incomplete }) => incomplete)).toEqual([0, 0]);
            const phases = Object.keys(reports[0].samples);
            expect(phases).toHaveLength(10);
            const summary = Object.fromEntries(
              phases.map((phase) => {
                const values = reports.flatMap(({ samples }) => {
                  expect(samples[phase].length).toBeGreaterThan(0);
                  return samples[phase];
                });
                expect(values).toHaveLength(profile.pairs);
                expect(
                  values.every(
                    (duration) => Number.isFinite(duration) && duration >= 0,
                  ),
                ).toBe(true);
                return [
                  phase,
                  {
                    ...metrics(values),
                    totalMs: Number(
                      values
                        .reduce((total, duration) => total + duration, 0)
                        .toFixed(1),
                    ),
                  },
                ];
              }),
            );
            console.log('NURSING_PHASES', JSON.stringify(summary));
          }
          console.log(
            'NURSING_LOAD',
            JSON.stringify({
              ...profile,
              writeDurationMs: Number(writeResult.elapsed.toFixed(1)),
              writesPerSecond: Number(
                ((operations.length * 1000) / writeResult.elapsed).toFixed(1),
              ),
              expectedPerObserver: expectedCount,
              medicationMs: metrics(
                operations
                  .filter(({ kind }) => kind === 'medication')
                  .map(({ duration }) => duration),
              ),
              vitalMs: metrics(
                operations
                  .filter(({ kind }) => kind === 'vitals')
                  .map(({ duration }) => duration),
              ),
              liveMs: metrics(live),
              recoveryPageMs: metrics(
                caughtUp.flatMap(({ populatedPages }) => populatedPages),
              ),
              recoveryAllPagesMs: metrics(
                caughtUp.flatMap(({ durations }) => durations),
              ),
              snapshotMs: metrics(snapshots),
              completeRecoveryMs: metrics(
                caughtUp.map(({ elapsed }) => elapsed),
              ),
            }),
          );
          for (const reader of [foreign, ...receivers, ...readers])
            reader.socket.disconnect();
        }
        if (gateway) {
          const cursor = await db.nursingNotification.findFirstOrThrow({
            where: { hospitalId: hospital.id },
            orderBy: { id: 'desc' },
            select: { id: true },
          });
          const { socket, ready } = open(
            gateway.url,
            writer.accessToken,
            gateway.ca,
            false,
            true,
          );
          sockets.push(socket);
          await ready;
          gateway.stop();
          await until(() => !socket.connected, 'Nginx outage');
          const { id } = responseBody<{ id: number }>(
            await request(addresses[1])
              .post(`/api/vitals/encounter/${patients[0].encounterId}`)
              .auth(writer.accessToken, { type: 'bearer' })
              .send({ pulse: 125, requestId: randomUUID() })
              .expect(201),
          );
          let reconnected = false;
          socket.once('initial_data', () => {
            reconnected = true;
          });
          const restartedAt = performance.now();
          gateway.start();
          await until(() => reconnected, 'Nginx reconnect');
          const { page } = await pull(socket, cursor.id.toString());
          expect(page.hasMore).toBe(false);
          expect(
            page.messages.map(({ event, payload }) => key(event, payload)),
          ).toEqual([`vitals_update:${id}`, `patient_alert:${id}`]);
          console.log(
            'NURSING_GATEWAY_RECOVERY_MS',
            Math.round(performance.now() - restartedAt),
          );
          await delay(350);
          expect((await pull(socket, page.cursor)).page.messages).toEqual([]);
        }
      } finally {
        for (const socket of sockets) socket.disconnect();
        gatewayAgent?.destroy();
        for (const agent of stationAgents) agent.destroy();
        try {
          gateway?.close();
        } finally {
          await Promise.all(workers.map(stopWorker));
          for (const node of nodes.reverse()) await node.close();
          await fixtureDb?.$disconnect();
        }
      }
    },
    useGateway ? 300000 : 210000,
  );
});
