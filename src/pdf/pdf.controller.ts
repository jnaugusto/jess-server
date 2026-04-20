import {
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Sse,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { PdfService } from './pdf.service';

@AllowAnonymous()
@ApiTags('pdf')
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Queue a PDF generation task' })
  @ResponseMessage('PDF generation queued.')
  async generatePdf(@Body() generatePdfDto: GeneratePdfDto) {
    return await this.pdfService.generatePdf(generatePdfDto);
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Get the status and progress of a PDF generation task' })
  @ApiParam({ name: 'jobId', description: 'The ID of the PDF generation job' })
  @ResponseMessage('Job status retrieved.')
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.pdfService.getJobStatus(jobId);
    if (!status) throw new NotFoundException(`Job ${jobId} not found.`);
    return status;
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: 'Download the generated PDF for a completed job' })
  @ApiParam({ name: 'jobId', description: 'The ID of the PDF generation job' })
  async downloadPdf(@Param('jobId') jobId: string): Promise<StreamableFile> {
    const stream = await this.pdfService.getDownloadStream(jobId);
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="${jobId}.pdf"`,
    });
  }

  @Sse(':jobId/progress')
  @ApiOperation({ summary: 'Stream the progress of a PDF generation task using SSE' })
  @ApiParam({ name: 'jobId', description: 'The ID of the PDF generation job' })
  getJobProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return this.pdfService.getJobProgressStream(jobId);
  }
}
