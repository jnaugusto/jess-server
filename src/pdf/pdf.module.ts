import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TemplateModule } from '../template/template.module';
import { PdfController } from './pdf.controller';
import { PdfProcessor } from './pdf.processor';
import { PdfService } from './pdf.service';
import { PlaywrightService } from './playwright.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'pdf-generation',
    }),
    BullBoardModule.forFeature({
      name: 'pdf-generation',
      adapter: BullMQAdapter,
    }),
    TemplateModule,
  ],
  providers: [PdfService, PdfProcessor, PlaywrightService],
  controllers: [PdfController],
})
export class PdfModule {}
