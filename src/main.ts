import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import '@total-typescript/ts-reset';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { env } from './env';

async function bootstrap() {
  // rawBody: exposes req.rawBody (Buffer) for webhook signature verification
  // (Resend inbound / Svix) while still JSON-parsing the body normally.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = new DocumentBuilder()
    .setTitle('Jess Server API')
    .setDescription('The Jess Server API description')
    .setVersion('1.0')
    .addTag('jess')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory);

  const httpAdapterHost = app.get(HttpAdapterHost);

  const allowedOrigins = new Set(
    (
      process.env.CORS_ORIGINS ??
      'http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000'
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  // Capacitor WebView origins — must mirror auth.ts trustedOrigins.
  // Android with useLegacyBridge=true serves from http://localhost; the
  // new bridge uses https://localhost; iOS uses capacitor://localhost.
  for (const o of ['capacitor://localhost', 'http://localhost', 'https://localhost']) {
    allowedOrigins.add(o);
  }
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
}
void bootstrap();
