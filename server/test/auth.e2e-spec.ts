import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './db-reset';
import { AuthHelper } from './auth-helper';
import { JwtService } from '@nestjs/jwt';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authHelper: AuthHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [AuthHelper],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true })); // Ensure validation is active
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    // Helper needs JWT service which might be internal to AuthModule, 
    // but if it's exported or Global, we can get it. 
    // Alternatively, instantiate it manually if just for generating tokens.
    const jwt = app.get<JwtService>(JwtService);
    authHelper = new AuthHelper(prisma, jwt);
  });

  // Clean DB before starting suite
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should reject invalid credentials', async () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'ghost', password: 'wrongpassword' })
        .expect(401); // Unauthorized
    });

    it('should return tokens for valid credentials', async () => {
      // Setup: Create user
      await authHelper.createTestUser('doctor1', 'pass123');

      // Execute & Verify
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'doctor1', password: 'pass123' })
        .expect(201); // Default POST status in Nest is 201

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toHaveProperty('username', 'doctor1');
    });
  });

  describe('GET /users/me (Protected Route)', () => {
    it('should reject unauthenticated requests', async () => {
      return request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });

    // Uncomment this when we have a route to test
    /*
    it('should allow access with valid token', async () => {
      const { accessToken } = await authHelper.createTestUser();

      return request(app.getHttpServer())
        .get('/users/profile') // Assuming this route exists
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
    */
  });
});
