import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'], // Production logging levels
  });

  // ============================================
  // 🌍 GLOBAL PREFIX
  // ============================================
  app.setGlobalPrefix('api');

  // ============================================
  // 🔒 SECURITY CONFIGURATION
  // ============================================
  
  app.use(cookieParser());

  // Helmet: Security headers (XSS, clickjacking, etc.)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false, // For WebSocket compatibility
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ============================================
  // 🛡️ INPUT VALIDATION
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      transform: true,           // Auto-transform types
      forbidNonWhitelisted: true, // Throw on unknown properties
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Validation error formatting
      exceptionFactory: (errors) => {
        const messages = errors.map(error => ({
          field: error.property,
          constraints: Object.values(error.constraints || {}),
        }));
        return new Error(JSON.stringify(messages));
      },
    }),
  );

  // ============================================
  // 📤 RESPONSE FORMATTING
  // ============================================
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // ============================================
  // 🌐 CORS CONFIGURATION
  // ============================================
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN)?.split(',') || [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost',
    'https://localhost',
  ];
  
  // Check if wildcard is enabled
  const allowAllOrigins = allowedOrigins.includes('*');
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) return callback(null, true);
      
      // Allow all origins if '*' is in the list
      if (allowAllOrigins) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Client-Name',
      'X-Request-Id',
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
  // 🚀 START SERVER
  // ============================================
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Saraya ERP Backend is running on: http://localhost:${port}`);
  logger.log(`🔒 Security: Helmet enabled, CORS configured`);
  logger.log(`📊 Rate Limiting: Active (ThrottlerModule)`);
}

bootstrap();

