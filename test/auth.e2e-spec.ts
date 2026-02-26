import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp } from './helpers/app.helper';
import { cleanDatabase } from './helpers/db.helper';
import { createTestUser } from './helpers/factories';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    app = await createTestApp();
    databaseService = app.get(DatabaseService);
    await cleanDatabase(databaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Sign Up', () => {
    it('should successfully register a new user and return user + token', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-up/email').send({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      });

      expect(response.status).toBe(200);
      const { user, token } = response.body as { user: { email: string }; token: string };
      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(token).toBeDefined();
    });

    it('should fail if email already exists', async () => {
      await createTestUser(app, 'duplicate@example.com');

      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-up/email').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'Another User',
      });

      expect(response.status).toBe(422);
    });

    it('should fail if email is invalid', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-up/email').send({
        email: 'invalid-email',
        password: 'Password123!',
        name: 'Test User',
      });

      expect(response.status).toBe(400);
    });

    it('should fail if password is too short', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-up/email').send({
        email: 'short-pw@example.com',
        password: '123',
        name: 'Test User',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Sign In', () => {
    beforeEach(async () => {
      await createTestUser(app, 'signin@example.com', 'Password123!');
    });

    it('should return a token and user on valid credentials', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-in/email').send({
        email: 'signin@example.com',
        password: 'Password123!',
      });

      expect(response.status).toBe(200);
      const { user, token } = response.body as { user: { email: string }; token: string };
      expect(token).toBeDefined();
      expect(user.email).toBe('signin@example.com');
    });

    it('should fail with 401 on wrong password', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-in/email').send({
        email: 'signin@example.com',
        password: 'WrongPassword!',
      });

      expect(response.status).toBe(401);
    });

    it('should fail with 401 if user does not exist', async () => {
      const response = await supertest(app.getHttpServer()).post('/api/auth/sign-in/email').send({
        email: 'nonexistent@example.com',
        password: 'Password123!',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Session', () => {
    it('GET /auth/session should return the current user when a valid Bearer token is provided', async () => {
      const { token } = await createTestUser(app, 'session@example.com');

      const response = await supertest(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const { user } = response.body as { user: { email: string } };
      expect(user.email).toBe('session@example.com');
    });

    it('GET /auth/session should return null if no token is provided', async () => {
      const response = await supertest(app.getHttpServer()).get('/api/auth/get-session');

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it('GET /auth/session should return null if token is expired or invalid', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });
  });

  describe('Sign Out', () => {
    it('POST /auth/sign-out should invalidate the session', async () => {
      const { token } = await createTestUser(app, 'signout@example.com');

      // Sign out
      await supertest(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set('Authorization', `Bearer ${token}`);

      // Check session again
      const response = await supertest(app.getHttpServer())
        .get('/api/auth/get-session')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });
  });

  describe('Protected Route', () => {
    it('Should return user profile when authenticated', async () => {
      const { token } = await createTestUser(app, 'profile@example.com');

      const response = await supertest(app.getHttpServer())
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const body = response.body as { email: string };
      expect(body.email).toBe('profile@example.com');
    });

    it('Should return 401 when not authenticated', async () => {
      const response = await supertest(app.getHttpServer()).get('/api/users/profile');

      expect(response.status).toBe(401);
    });
  });
});
