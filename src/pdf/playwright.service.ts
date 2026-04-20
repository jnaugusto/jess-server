import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { Browser, chromium, Page } from 'playwright';
import { env } from '../env';

export interface PdfRenderOptions {
  /**
   * When true, adds a "Jess Server" header/footer and 60px top/bottom margins.
   * Set to false for document-style PDFs (resume, invoice, real-estate, site-capture).
   * Defaults to false.
   */
  branded?: boolean;
}

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
    if (!this.browser) throw new Error('Browser not initialized');

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
   * Renders an HTML string to a PDF buffer.
   * Pass `branded: true` for reports that should have a header/footer;
   * leave it false (default) for clean document-style output.
   */
  async generateFromHtml(html: string, opts: PdfRenderOptions = {}): Promise<Buffer> {
    const { branded = false } = opts;
    const page = await this.getPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: branded,
        ...(branded
          ? {
              headerTemplate: `
                <div style="font-size:10px;width:100%;margin:0 40px;border-bottom:1px solid #eee;padding-bottom:15px;display:flex;justify-content:space-between;font-family:sans-serif;color:#888;">
                  <span>Jess Server</span><span><span class="date"></span></span>
                </div>`,
              footerTemplate: `
                <div style="font-size:10px;width:100%;margin:0 40px;border-top:1px solid #eee;padding-top:15px;display:flex;justify-content:space-between;font-family:sans-serif;color:#888;">
                  <span>&copy; 2026 Jess Server</span>
                  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
                </div>`,
              margin: { top: '60px', bottom: '60px' },
            }
          : {
              margin: { top: '0', bottom: '0', left: '0', right: '0' },
            }),
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Takes a full-page screenshot of a URL and returns a PNG buffer.
   * Uses a realistic user agent to reduce the chance of being blocked.
   */
  async screenshotFromUrl(url: string): Promise<Buffer> {
    const page = await this.getPage();
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-AU,en;q=0.9' });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      this.logger.log(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1500);

      const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
      return Buffer.from(screenshot);
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Merges multiple HTML chunks into a single PDF.
   */
  async generateLargePdf(htmlChunks: string[], opts: PdfRenderOptions = {}): Promise<Buffer> {
    this.logger.log(`Generating PDF with ${String(htmlChunks.length)} chunk(s)`);

    const pdfBuffers = await Promise.all(
      htmlChunks.map((chunk) => this.generateFromHtml(chunk, opts)),
    );

    if (pdfBuffers.length === 1) return pdfBuffers[0];

    const mergedPdf: PDFDocument = await PDFDocument.create();
    for (const buffer of pdfBuffers) {
      const pdf = await PDFDocument.load(buffer);
      const copiedPages: PDFPage[] = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    return Buffer.from(await mergedPdf.save());
  }
}
