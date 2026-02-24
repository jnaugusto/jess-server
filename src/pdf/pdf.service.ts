import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { QueueService } from '../common/services/queue.service';
import { GeneratePdfDto } from './dto/generate-pdf.dto';

@Injectable()
export class PdfService {
  constructor(
    @InjectQueue('pdf-generation')
    private readonly pdfQueue: Queue,
    private readonly queueService: QueueService,
  ) {}

  async generatePdf(generatePdfDto: GeneratePdfDto): Promise<{ jobId: string }> {
    try {
      const { address, pageCount } = generatePdfDto;

      const job = await this.pdfQueue.add('generate', {
        address,
        pageCount,
      });

      return { jobId: String(job.id) };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during PDF generation queuing';
      throw new InternalServerErrorException(`Failed to queue PDF generation task: ${message}`);
    }
  }

  async getJobStatus(jobId: string) {
    return await this.queueService.getJobStatus(this.pdfQueue, jobId, 25);
  }

  getJobProgressStream(jobId: string): Observable<{ data: object }> {
    return this.queueService.getJobProgressStream(this.pdfQueue, jobId, 25);
  }
}
