import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { Browser, chromium, Page } from 'playwright';
import { env } from '../env';

@Injectable()
export class PlaywrightService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);
  private browser: Browser | null = null;
  private readonly poolSize = env.PLAYWRIGHT_POOL_SIZE;
  private readonly maxPages = env.PLAYWRIGHT_MAX_PAGES;
  private activePages = 0;

  async onModuleInit() {
    this.logger.log(`Initializing Playwright with pool size: ${String(this.poolSize)}`);

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private async getPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Simple semaphore-like check for max pages
    while (this.activePages >= this.maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.activePages++;
    return await this.browser.newPage();
  }

  private async releasePage(page: Page) {
    await page.close();
    this.activePages--;
  }

  /**
   * Generates a PDF from HTML content
   */
  async generateFromHtml(html: string): Promise<Buffer> {
    const page = await this.getPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 10px; width: 100%; margin: 0 40px; border-bottom: 1px solid #eee; padding-bottom: 15px; display: flex; justify-content: space-between; font-family: sans-serif; color: #888;">
            <span>Jess Property Report</span>
            <span><span class="date"></span></span>
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 10px; width: 100%; margin: 0 40px; border-top: 1px solid #eee; padding-top: 15px; display: flex; justify-content: space-between; font-family: sans-serif; color: #888;">
            <span>&copy; 2026 Jess Server</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: '60px',
          bottom: '60px',
        },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Generates a large PDF by chunking and merging
   * @param htmlChunks Array of HTML strings, each representing a chunk of the report
   */
  async generateLargePdf(htmlChunks: string[]): Promise<Buffer> {
    this.logger.log(`Generating large PDF with ${String(htmlChunks.length)} chunks`);

    // Generate all PDFs in parallel (limited by maxPages)
    const pdfBuffers = await Promise.all(htmlChunks.map((chunk) => this.generateFromHtml(chunk)));

    if (pdfBuffers.length === 1) {
      return pdfBuffers[0];
    }

    // Merge PDFs using pdf-lib
    const mergedPdf: PDFDocument = await PDFDocument.create();

    for (const buffer of pdfBuffers) {
      const pdf = await PDFDocument.load(buffer);
      const copiedPages: PDFPage[] = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBuffer = await mergedPdf.save();
    return Buffer.from(mergedPdfBuffer);
  }
}
