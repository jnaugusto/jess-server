import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

export interface TestUserResponse {
  response: supertest.Response;
  email: string;
  password: string;
  name: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

export async function createTestUser(
  app: INestApplication,
  email = `test-${Date.now().toString()}@example.com`,
  password = 'Password123!',
  name = 'Test User',
): Promise<TestUserResponse> {
  const response = await supertest(app.getHttpServer() as supertest.App)
    .post('/api/auth/sign-up/email')
    .send({
      email,
      password,
      name,
    });

  const body = response.body as { user: TestUserResponse['user']; token: string };

  return {
    response,
    email,
    password,
    name,
    user: body.user,
    token: body.token,
  };
}

export async function getAuthToken(
  app: INestApplication,
  email = 'test@example.com',
  password = 'Password123!',
): Promise<string> {
  const response = await supertest(app.getHttpServer() as supertest.App)
    .post('/api/auth/sign-in/email')
    .send({
      email,
      password,
    });

  const body = response.body as { token: string };

  return body.token;
}
