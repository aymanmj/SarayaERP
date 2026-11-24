import './tracing'; // يجب أن يكون أول استيراد لضمان اعتراض وتتبع كل شيء (OpenTelemetry)
import 'reflect-metadata';
import './common/bullmq-mock';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestLifecycleInterceptor } from './common/interceptors/request-lifecycle.interceptor';
import { LocalizationInterceptor } from './common/interceptors/localization.interceptor';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import {
  buildCspDirectives,
  isCorsOriginAllowed,
  parseConfiguredOrigins,
} from './common/security/http-security.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  const enableStrictCsp = isProduction
    ? process.env.ENABLE_STRICT_CSP !== 'false'
    : process.env.ENABLE_STRICT_CSP === 'true';

  // ============================================
  // 🌐 GLOBAL PROXY SUPPORT (For undici/fetch)
  // ============================================
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (proxyUrl) {
    try {
      const proxyAgent = new ProxyAgent(proxyUrl);
      setGlobalDispatcher(proxyAgent);
      logger.log('Global HTTP/HTTPS proxy configured');
    } catch (proxyError: any) {
      logger.error(
        `❌ Failed to configure global proxy: ${proxyError.message}`,
      );
    }
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'], // Production logging levels
  });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Increase the default max listeners to prevent MaxListenersExceededWarning.
  // Our middleware stack (OpenTelemetry, CLS, Helmet, CORS, Prometheus, ThrottlerGuard,
  // AuditInterceptor, etc.) legitimately adds 11+ 'finish' listeners per response.
  // This is expected behavior, not a memory leak.
  const httpServer = app.getHttpServer();
  httpServer.on('request', (_req: any, res: any) => {
    res.setMaxListeners(20);
  });

  // ============================================
  // 🌍 GLOBAL PREFIX (exclude ZKTeco ADMS hardware push path /iclock/cdata)
  // ============================================
  app.use('/iclock', express.text({ type: 'text/plain', limit: '2mb' }));
  app.setGlobalPrefix('api', { exclude: ['iclock/cdata'] });

  // ============================================
  // 🔒 SECURITY CONFIGURATION
  // ============================================

  app.use(cookieParser());
  app.use(compression());

  // Dynamic domain for multi-tenant deployments
  const sarayaDomain = process.env.SARAYA_DOMAIN || '';
  const cspDirectives = buildCspDirectives({
    isProduction,
    enableStrictCsp,
    sarayaDomain,
  });

  // Helmet: Security headers (XSS, clickjacking, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: cspDirectives,
      },
      crossOriginEmbedderPolicy: false, // For WebSocket compatibility
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  if (isProduction && !enableStrictCsp) {
    logger.warn(
      '⚠️ Running with compatibility CSP in production because ENABLE_STRICT_CSP=false. Re-enable strict CSP after frontend CSP hardening is verified.',
    );
  }

  // ============================================
  // 🛡️ INPUT VALIDATION
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      transform: true, // Auto-transform types
      forbidNonWhitelisted: isProduction,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Validation error formatting
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          field: error.property,
          constraints: Object.values(error.constraints || {}),
        }));
        return new BadRequestException(JSON.stringify(messages));
      },
    }),
  );

  // ============================================
  // 🔗 REQUEST CORRELATION (X-Request-Id)
  // ============================================
  const correlationMiddleware = new CorrelationMiddleware();
  app.use((req: any, res: any, next: any) =>
    correlationMiddleware.use(req, res, next),
  );

  // ============================================
  // 📤 RESPONSE FORMATTING & LIFECYCLE MONITORING
  // ============================================
  app.useGlobalInterceptors(
    new RequestLifecycleInterceptor(),
    new TransformInterceptor(),
    new LocalizationInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // ============================================
  // 🌐 CORS CONFIGURATION
  // ============================================
  const configuredOrigins = parseConfiguredOrigins(
    process.env.CORS_ORIGINS || process.env.CORS_ORIGIN,
  );

  if (isProduction && configuredOrigins.length === 0) {
    logger.warn(
      '⚠️ CORS_ORIGINS is not set in production! Only same-origin requests will be allowed.',
    );
  }

  app.enableCors({
    origin: (origin, callback) => {
      const check = isCorsOriginAllowed(origin, {
        isProduction,
        configuredOrigins,
      });
      if (check.allowed) {
        return callback(null, check.reflectOrigin ?? true);
      }

      // Origin not allowed
      logger.warn(`Blocked CORS request from: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },

    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Client-Name',
      'X-Request-Id',
      'Accept-Language',
      'X-Bypass-Localization',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ============================================
  // 📚 SWAGGER API DOCUMENTATION
  // ============================================
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Saraya ERP API')
      .setDescription('Hospital Management System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('patients', 'Patient management')
      .addTag('encounters', 'Clinical encounters')
      .addTag('billing', 'Billing and invoicing')
      .addTag('pharmacy', 'Pharmacy operations')
      .addTag('labs', 'Laboratory services')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log('📚 Swagger documentation available at /api/docs');
  }

  // ============================================
  // ⏹️ GRACEFUL SHUTDOWN
  // ============================================
  app.enableShutdownHooks();

  const SHUTDOWN_TIMEOUT = 30_000; // 30 seconds max

  const gracefulShutdown = async (signal: string) => {
    logger.warn(`⏹️ Received ${signal}. Starting graceful shutdown...`);

    const shutdownTimer = setTimeout(() => {
      logger.error('❌ Graceful shutdown timed out after 30s. Forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      await app.close();
      clearTimeout(shutdownTimer);
      logger.log('✅ Graceful shutdown complete. All connections closed.');
      process.exit(0);
    } catch (err) {
      clearTimeout(shutdownTimer);
      logger.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // ============================================
  // 🚀 START SERVER
  // ============================================
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Saraya ERP Backend is running on: http://localhost:${port}`);
  logger.log(`🔒 Security: Helmet enabled, CORS configured`);
  logger.log(`📊 Rate Limiting: Active (ThrottlerModule)`);
  logger.log(`🔗 Request Tracing: X-Request-Id correlation enabled`);
  logger.log(`⏹️ Graceful Shutdown: SIGTERM/SIGINT handlers registered`);
}

bootstrap();
