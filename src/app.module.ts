import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CommonModule } from './common/common.module';
import { MailModule } from './common/mail/mail.module';
import { DatabaseModule } from './database/database.module';
import { DriversModule } from './drivers/drivers.module';
import { env } from './env';
import { ImageModule } from './image/image.module';
import { InvitesModule } from './invites/invites.module';
import { LocationsModule } from './locations/locations.module';
import { OverviewModule } from './overview/overview.module';
import { PdfModule } from './pdf/pdf.module';
import { PowerSyncModule } from './powersync/powersync.module';
import { SettingsModule } from './settings/settings.module';
import { TracksModule } from './tracks/tracks.module';
import { TemplateModule } from './template/template.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AnalyzeSiteModule } from './analyze-site/analyze-site.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DriveModule } from './drive/drive.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
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
    MailModule,
    ImageModule,
    PdfModule,
    TemplateModule,
    DatabaseModule,
    PowerSyncModule,
    LocationsModule,
    TracksModule,
    AuthModule.register(),
    UsersModule,
    DriversModule,
    VehiclesModule,
    InvitesModule,
    SettingsModule,
    OverviewModule,
    AnalyticsModule,
    AnalyzeSiteModule,
    DriveModule,
    ChatModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
