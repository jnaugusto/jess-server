import { Global, Module } from '@nestjs/common';
import { MailPreviewController } from './mail-preview.controller';
import { MailService } from './mail.service';

@Global()
@Module({
  controllers: [MailPreviewController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
