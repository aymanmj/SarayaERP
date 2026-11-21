const target = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
if (
  !process.send ||
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

const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { setTimeout: delay } = require('node:timers/promises');
const { AppModule } = require('../dist/src/app.module');
const {
  ConnectivityService,
} = require('../dist/src/common/services/connectivity.service');
const { LicenseService } = require('../dist/src/licensing/license.service');
const { PdfService } = require('../dist/src/pdf/pdf.service');
const { BackupService } = require('../dist/src/backup/backup.service');
const { NursingService } = require('../dist/src/nursing/nursing.service');
const { observeNursingPhases } = require('./nursing-load-phases.cjs');
const {
  StaffRealtimeBus,
} = require('../dist/src/websocket/staff-realtime.bus');

// Match the isolated E2E harness for integrations outside this workload.
ConnectivityService.prototype.onModuleInit = async () => {};
LicenseService.prototype.onModuleInit = async () => {};
LicenseService.prototype.getStatus = () => ({
  isValid: true,
  machineId: 'synthetic-test-machine',
});
LicenseService.prototype.isModuleEnabled = () => true;
PdfService.prototype.onModuleInit = async () => {};
BackupService.prototype.onModuleInit = () => {};

let app;
let closing;
function shutdown() {
  closing ??= (async () => {
    await app?.close();
    if (process.connected) process.disconnect();
  })();
  return closing;
}

async function start() {
  app = await NestFactory.create(AppModule);
  const readTimings =
    process.env.NURSING_LOAD_PROFILE === 'true'
      ? observeNursingPhases(app.get(NursingService))
      : undefined;
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  if (process.env.NURSING_LOAD_GATEWAY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.setGlobalPrefix('api');
  }
  await app.listen(0, '127.0.0.1');
  const limit = Date.now() + 12000;
  while (!app.get(StaffRealtimeBus).isReady()) {
    if (Date.now() >= limit) throw new Error('Redis readiness timeout');
    await delay(25);
  }
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string')
    throw new Error('Expected local HTTP port');
  const stop = () => {
    shutdown().catch((error) => {
      console.error(error);
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    });
  };
  process.on('message', (message) => {
    if (message === 'profile' && readTimings) {
      process.send({ profile: readTimings() });
    } else if (message === 'shutdown') {
      stop();
    }
  });
  process.once('disconnect', stop);
  process.send({ port: address.port }, (error) => {
    if (error) stop();
  });
}

start().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await shutdown();
});
