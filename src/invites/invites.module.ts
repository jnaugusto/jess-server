import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InvitesController } from './invites.controller';
import { InvitesPublicController } from './invites-public.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InvitesController, InvitesPublicController],
  providers: [InvitesService],
})
export class InvitesModule {}
