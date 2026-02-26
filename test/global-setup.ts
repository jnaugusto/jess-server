import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function () {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('jess_db_test')
    .withUsername('postgres')
    .withPassword('postgrespassword')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();

  // Store container reference to stop it later
  globalThis.__POSTGRES_CONTAINER__ = container;
}

export async function teardown() {
  const container = globalThis.__POSTGRES_CONTAINER__;
  if (container) {
    await container.stop();
  }
}
