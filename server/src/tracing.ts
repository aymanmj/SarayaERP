// server/src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
// import process is not needed due to global process

// استخدم منفذ 4318 إذا كان لديك Jaeger أو OTLP Collector. حاليًا يقوم بالتصدير فقط إذا تم تحديده.
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  // headers: {}
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': 'saraya-erp-backend',
    'service.version': '1.0.0',
    'environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // يمكنك تعطيل أنواع معينة من التتبع لتقليل الضوضاء
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

// بدء التشغيل
sdk.start();

// الإقفال الآمن عند انتهاء العملية
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});

export default sdk;
