import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { join } from 'path';
import { TemplateService } from '../template/template.service';
import { PlaywrightService } from './playwright.service';

interface PdfJobData {
  address: string;
  pageCount?: number;
}

@Processor('pdf-generation')
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly templateService: TemplateService,
    private readonly playwrightService: PlaywrightService,
  ) {
    super();
  }

  async process(
    job: Job<PdfJobData>,
  ): Promise<{ success: boolean; pdfUrl: string; address: string } | undefined> {
    switch (job.name) {
      case 'generate':
        return await this.handleGeneratePdf(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return undefined;
    }
  }

  private async handleGeneratePdf(job: Job<PdfJobData>) {
    const { data } = job;
    const address = data.address;
    const pageCount = data.pageCount ?? 10;
    const chunkSize = 10; // Number of pages per PDF chunk

    this.logger.log(`Starting PDF generation for address: ${address}, pages: ${String(pageCount)}`);

    try {
      await job.updateProgress(10);

      const numChunks = Math.ceil(pageCount / chunkSize);
      const htmlChunks: string[] = [];

      for (let i = 0; i < numChunks; i++) {
        const pagesInThisChunk = Math.min(chunkSize, pageCount - i * chunkSize);
        const chunkIndex = i + 1;
        this.logger.log(
          `Rendering chunk ${String(chunkIndex)}/${String(numChunks)} (${String(pagesInThisChunk)} pages)`,
        );

        // Create an array of page data to repeat content in the template
        const pages = Array.from({ length: pagesInThisChunk }, (_, idx) => ({
          pageNumber: i * chunkSize + idx + 1,
        }));

        const chunkHtml = await this.templateService.render(
          'report',
          {
            address,
            jobId: job.id,
            pages,
            chunkIndex,
            isChunked: true,
            generatedAt: new Date().toISOString(),
          },
          { layout: 'layouts/main' },
        );

        htmlChunks.push(chunkHtml);
        await job.updateProgress(10 + (i / numChunks) * 60);
      }

      this.logger.log(`Merging ${String(htmlChunks.length)} chunks into final PDF...`);
      await job.updateProgress(80);

      const pdfBuffer = await this.playwrightService.generateLargePdf(htmlChunks);

      // In a real app, you would upload this to S3 or save to disk
      // For this task, we'll save it locally to a 'generated' folder and return the path
      const outputDir = join(process.cwd(), 'generated');
      await fs.mkdir(outputDir, { recursive: true });
      const fileName = `report_${String(job.id ?? Date.now())}.pdf`;
      const filePath = join(outputDir, fileName);
      await fs.writeFile(filePath, pdfBuffer);

      await job.updateProgress(100);
      this.logger.log(`Successfully generated PDF: ${filePath}`);

      // Inform the user - since this is a background job, we return the info
      // The caller can then notify the user via WebSockets or email
      return {
        success: true,
        address: data.address,
        pdfUrl: filePath,
        generatedAt: new Date().toISOString(),
        message: 'PDF has been generated successfully.',
      };
    } catch (error) {
      this.logger.error(`Error during PDF generation for ${address}: ${(error as Error).message}`);
      throw error;
    }
  }
}
