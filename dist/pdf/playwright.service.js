"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlaywrightService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightService = void 0;
const common_1 = require("@nestjs/common");
const pdf_lib_1 = require("pdf-lib");
const playwright_1 = require("playwright");
const env_1 = require("../env");
let PlaywrightService = PlaywrightService_1 = class PlaywrightService {
    logger = new common_1.Logger(PlaywrightService_1.name);
    browser = null;
    poolSize = env_1.env.PLAYWRIGHT_POOL_SIZE;
    maxPages = env_1.env.PLAYWRIGHT_MAX_PAGES;
    activePages = 0;
    async onModuleInit() {
        this.logger.log(`Initializing Playwright with pool size: ${String(this.poolSize)}`);
        this.browser = await playwright_1.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }
    async onModuleDestroy() {
        if (this.browser) {
            await this.browser.close();
        }
    }
    async getPage() {
        if (!this.browser)
            throw new Error('Browser not initialized');
        while (this.activePages >= this.maxPages) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        this.activePages++;
        return await this.browser.newPage();
    }
    async releasePage(page) {
        await page.close();
        this.activePages--;
    }
    async generateFromHtml(html, opts = {}) {
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
        }
        finally {
            await this.releasePage(page);
        }
    }
    async screenshotFromUrl(url) {
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
        }
        finally {
            await this.releasePage(page);
        }
    }
    async generateLargePdf(htmlChunks, opts = {}) {
        this.logger.log(`Generating PDF with ${String(htmlChunks.length)} chunk(s)`);
        const pdfBuffers = await Promise.all(htmlChunks.map((chunk) => this.generateFromHtml(chunk, opts)));
        if (pdfBuffers.length === 1)
            return pdfBuffers[0];
        const mergedPdf = await pdf_lib_1.PDFDocument.create();
        for (const buffer of pdfBuffers) {
            const pdf = await pdf_lib_1.PDFDocument.load(buffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((p) => mergedPdf.addPage(p));
        }
        return Buffer.from(await mergedPdf.save());
    }
};
exports.PlaywrightService = PlaywrightService;
exports.PlaywrightService = PlaywrightService = PlaywrightService_1 = __decorate([
    (0, common_1.Injectable)()
], PlaywrightService);
//# sourceMappingURL=playwright.service.js.map