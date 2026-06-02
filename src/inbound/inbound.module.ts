import { Module } from '@nestjs/common';
import { InboundController } from './inbound.controller';

// MailService is provided by the @Global() MailModule, so it's injectable here
// without an explicit import.
@Module({
  controllers: [InboundController],
})
export class InboundModule {}
