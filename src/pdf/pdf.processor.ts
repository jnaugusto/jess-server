import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { join } from 'path';
import { TemplateService } from '../template/template.service';
import { PdfTemplateType } from './dto/generate-pdf.dto';
import { PlaywrightService } from './playwright.service';

interface PdfJobData {
  templateType?: PdfTemplateType;
  address?: string;
  pageCount?: number;
  url?: string;
}

type TemplateConfig = {
  templateName: string;
  layout: string;
  pageCount: number;
  /** Show "Jess Server" header/footer. True only for financial-report style multi-page docs. */
  branded: boolean;
  buildContext: (
    job: Job<PdfJobData>,
    chunkPages: Array<{ pageNumber: number }>,
    chunkIndex: number,
  ) => Record<string, unknown>;
};

@Processor('pdf-generation')
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly templateService: TemplateService,
    private readonly playwrightService: PlaywrightService,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case 'generate':
        return await this.handleGeneratePdf(job as Job<PdfJobData>);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return undefined;
    }
  }

  // ── Router ─────────────────────────────────────────────────────────────────

  private async handleGeneratePdf(job: Job<PdfJobData>) {
    const templateType = job.data.templateType ?? PdfTemplateType.FINANCIAL_REPORT;

    if (templateType === PdfTemplateType.SITE_CAPTURE) {
      return await this.handleSiteCapture(job);
    }

    return await this.handleTemplatePdf(job, templateType);
  }

  // ── Site-capture (screenshot → PDF) ────────────────────────────────────────

  private async handleSiteCapture(job: Job<PdfJobData>) {
    const url = job.data.url;
    if (!url) throw new Error('url is required for site-capture template');

    this.logger.log(`Site capture: ${url}`);
    await job.updateProgress(10);

    const screenshotBuffer = await this.playwrightService.screenshotFromUrl(url);
    await job.updateProgress(60);

    const screenshotBase64 = screenshotBuffer.toString('base64');

    const html = await this.templateService.render(
      'site-capture',
      {
        siteUrl: url,
        screenshotBase64,
        capturedAt: new Date().toLocaleString('en-AU', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
      },
      // No layout — site-capture.hbs is a complete standalone HTML document
      {},
    );

    await job.updateProgress(80);

    // site-capture can be very tall — use a single long page (no A4 chunking)
    const pdfBuffer = await this.playwrightService.generateFromHtml(html, { branded: false });

    await job.updateProgress(90);

    const filePath = await this.savePdf(job, pdfBuffer);

    await job.updateProgress(100);
    this.logger.log(`Site capture PDF saved: ${filePath}`);

    return {
      success: true,
      templateType: PdfTemplateType.SITE_CAPTURE,
      siteUrl: url,
      pdfUrl: `/pdf/${String(job.id)}/download`,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Template-based PDFs (financial-report, resume, invoice, real-estate) ───

  private getTemplateConfig(job: Job<PdfJobData>, templateType: PdfTemplateType): TemplateConfig {
    switch (templateType) {
      case PdfTemplateType.RESUME:
        return {
          templateName: 'resume',
          layout: 'layouts/main',
          pageCount: 1,
          branded: false,
          buildContext: () => ({ generatedAt: new Date().toISOString() }),
        };

      case PdfTemplateType.INVOICE:
        return {
          templateName: 'invoice',
          layout: 'layouts/main',
          pageCount: 1,
          branded: false,
          buildContext: (j) => ({
            address: j.data.address ?? 'Sample Client Pty Ltd, 456 Business Ave, Melbourne VIC 3000',
            invoiceNumber: `INV-${String(j.id ?? Date.now()).slice(-6).toUpperCase()}`,
            invoiceDate: new Date().toLocaleDateString('en-AU', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-AU', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            generatedAt: new Date().toISOString(),
          }),
        };

      case PdfTemplateType.REAL_ESTATE:
        return {
          templateName: 'real-estate',
          layout: 'layouts/main',
          pageCount: 1,
          branded: false,
          buildContext: (j) => ({
            address: j.data.address ?? '42 Ocean Drive, Bondi Beach NSW 2026',
            generatedAt: new Date().toISOString(),
            listedDate: new Date().toLocaleDateString('en-AU', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
          }),
        };

      case PdfTemplateType.FINANCIAL_REPORT:
      default:
        return {
          templateName: 'report',
          layout: 'layouts/main',
          pageCount: job.data.pageCount ?? 10,
          branded: true,
          buildContext: (j, pages, chunkIndex) => ({
            address: j.data.address ?? '123 Sample Street, Sydney NSW 2000',
            jobId: j.id,
            pages,
            chunkIndex,
            isChunked: true,
            generatedAt: new Date().toISOString(),
          }),
        };
    }
  }

  private async handleTemplatePdf(job: Job<PdfJobData>, templateType: PdfTemplateType) {
    const config = this.getTemplateConfig(job, templateType);
    const { pageCount } = config;
    const chunkSize = 10;

    this.logger.log(`PDF generation: template=${templateType}, pages=${String(pageCount)}`);
    await job.updateProgress(10);

    const numChunks = Math.ceil(pageCount / chunkSize);
    const htmlChunks: string[] = [];

    for (let i = 0; i < numChunks; i++) {
      const pagesInThisChunk = Math.min(chunkSize, pageCount - i * chunkSize);
      const chunkIndex = i + 1;
      this.logger.log(`Rendering chunk ${String(chunkIndex)}/${String(numChunks)}`);

      const pages = Array.from({ length: pagesInThisChunk }, (_, idx) => ({
        pageNumber: i * chunkSize + idx + 1,
      }));

      const context = config.buildContext(job, pages, chunkIndex);
      const chunkHtml = await this.templateService.render(config.templateName, context, {
        layout: config.layout,
      });

      htmlChunks.push(chunkHtml);
      await job.updateProgress(10 + ((i + 1) / numChunks) * 60);
    }

    await job.updateProgress(80);

    const pdfBuffer = await this.playwrightService.generateLargePdf(htmlChunks, {
      branded: config.branded,
    });
    const filePath = await this.savePdf(job, pdfBuffer);

    await job.updateProgress(100);
    this.logger.log(`PDF saved: ${filePath}`);

    return {
      success: true,
      templateType,
      address: job.data.address,
      pdfUrl: `/pdf/${String(job.id)}/download`,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async savePdf(job: Job<PdfJobData>, buffer: Buffer): Promise<string> {
    const outputDir = join(process.cwd(), 'generated');
    await fs.mkdir(outputDir, { recursive: true });
    // Filename is just the jobId so the download endpoint can resolve it directly
    const filePath = join(outputDir, `${String(job.id)}.pdf`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }
}
