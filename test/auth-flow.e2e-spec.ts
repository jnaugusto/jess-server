import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp } from './helpers/app.helper';
import { cleanDatabase } from './helpers/db.helper';

/**
 * Auth Flow E2E Tests
 *
 * Uses a PostgreSQL testcontainer (spun up in global-setup.ts) to run
 * signup → signin → protected route → sign-out as a complete user journey.
 */
describe('Auth Flow (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  const TEST_USER = {
    email: 'flow@example.com',
    password: 'Password123!',
    name: 'Flow Tester',
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get(DatabaseService);
  });

  beforeEach(async () => {
    await cleanDatabase(databaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────
  // Sign Up
  // ──────────────────────────────────────────────
  describe('POST /api/auth/sign-up/email', () => {
    it('creates a new user and returns a token', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send(TEST_USER);

      expect(res.status).toBe(200);

      const body = res.body as { user: { email: string; name: string }; token: string };
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(TEST_USER.email);
      expect(body.user.name).toBe(TEST_USER.name);
    });

    it('rejects duplicate email with 422', async () => {
      // First signup
      await supertest(app.getHttpServer()).post('/auth/sign-up/email').send(TEST_USER);

      // Duplicate
      const res = await supertest(app.getHttpServer()).post('/auth/sign-up/email').send(TEST_USER);

      expect(res.status).toBe(422);
    });

    it('rejects invalid email with 400', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ ...TEST_USER, email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('rejects short password with 400', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ ...TEST_USER, password: '123' });

      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────────────────────────
  // Sign In
  // ──────────────────────────────────────────────
  describe('POST /api/auth/sign-in/email', () => {
    beforeEach(async () => {
      // Register the user before sign-in tests
      await supertest(app.getHttpServer()).post('/api/auth/sign-up/email').send(TEST_USER);
    });

    it('returns token and user on valid credentials', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email: TEST_USER.email, password: TEST_USER.password });

      expect(res.status).toBe(200);

      const body = res.body as { user: { email: string }; token: string };
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(TEST_USER.email);
    });

    it('rejects wrong password with 401', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email: TEST_USER.email, password: 'WrongPass999!' });

      expect(res.status).toBe(401);
    });

    it('rejects unknown email with 401', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email: 'nobody@example.com', password: TEST_USER.password });

      expect(res.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  // Full Flow: Sign Up → Sign In → Use Token → Sign Out
  // ──────────────────────────────────────────────
  describe('Complete auth journey', () => {
    it('registers, signs in, accesses a protected route, then signs out', async () => {
      // 1. Sign up
      const signupRes = await supertest(app.getHttpServer())
        .post('/auth/sign-up/email')
        .send(TEST_USER);
      expect(signupRes.status).toBe(200);
      const { token } = signupRes.body as { token: string };

      // 2. Access protected route with the signup token
      const profileRes = await supertest(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(profileRes.status).toBe(200);
      const profile = profileRes.body as { email: string };
      expect(profile.email).toBe(TEST_USER.email);

      // 3. Sign in (get a fresh token)
      const signinRes = await supertest(app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email: TEST_USER.email, password: TEST_USER.password });
      expect(signinRes.status).toBe(200);
      const { token: signinToken } = signinRes.body as { token: string };

      // 4. Get session with signin token
      const sessionRes = await supertest(app.getHttpServer())
        .get('/auth/get-session')
        .set('Authorization', `Bearer ${signinToken}`);
      expect(sessionRes.status).toBe(200);
      const { user } = sessionRes.body as { user: { email: string } };
      expect(user.email).toBe(TEST_USER.email);

      // 5. Sign out
      const signoutRes = await supertest(app.getHttpServer())
        .post('/auth/sign-out')
        .set('Authorization', `Bearer ${signinToken}`);
      expect(signoutRes.status).toBe(200);

      // 6. Verify session is gone
      const afterSignoutRes = await supertest(app.getHttpServer())
        .get('/auth/get-session')
        .set('Authorization', `Bearer ${signinToken}`);
      expect(afterSignoutRes.status).toBe(200);
      expect(afterSignoutRes.body).toBeNull();
    });
  });
});
