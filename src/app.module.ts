import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { env } from './env';
import { ImageModule } from './image/image.module';
import { PdfModule } from './pdf/pdf.module';
import { LocationsModule } from './locations/locations.module';
import { PowerSyncModule } from './powersync/powersync.module';
import { TracksModule } from './tracks/tracks.module';
import { TemplateModule } from './template/template.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    CommonModule,
    ImageModule,
    PdfModule,
    TemplateModule,
    DatabaseModule,
    PowerSyncModule,
    LocationsModule,
    TracksModule,
    AuthModule.register(),
    UsersModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
