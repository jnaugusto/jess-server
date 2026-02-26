import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import '@total-typescript/ts-reset';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

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

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://api.jnaugusto.com',
      'capacitor://localhost',
      'http://localhost',
    ],
    credentials: true,
  });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
}
void bootstrap();
