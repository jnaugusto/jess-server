import {
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { PdfService } from './pdf.service';

@ApiTags('pdf')
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Queue a PDF generation task',
  })
  async generatePdf(@Body() generatePdfDto: GeneratePdfDto) {
    return await this.pdfService.generatePdf(generatePdfDto);
  }

  @Get(':jobId')
  @ApiOperation({
    summary: 'Get the status and progress of a PDF generation task',
  })
  @ApiParam({ name: 'jobId', description: 'The ID of the PDF generation job' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.pdfService.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }
    return status;
  }

  @Sse(':jobId/progress')
  @ApiOperation({
    summary: 'Stream the progress of a PDF generation task using SSE',
  })
  @ApiParam({ name: 'jobId', description: 'The ID of the PDF generation job' })
  getJobProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return this.pdfService.getJobProgressStream(jobId);
  }
}
