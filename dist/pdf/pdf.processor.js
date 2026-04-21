"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PdfProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs/promises"));
const path_1 = require("path");
const template_service_1 = require("../template/template.service");
const generate_pdf_dto_1 = require("./dto/generate-pdf.dto");
const playwright_service_1 = require("./playwright.service");
let PdfProcessor = PdfProcessor_1 = class PdfProcessor extends bullmq_1.WorkerHost {
    templateService;
    playwrightService;
    logger = new common_1.Logger(PdfProcessor_1.name);
    constructor(templateService, playwrightService) {
        super();
        this.templateService = templateService;
        this.playwrightService = playwrightService;
    }
    async process(job) {
        switch (job.name) {
            case 'generate':
                return await this.handleGeneratePdf(job);
            default:
                this.logger.warn(`Unknown job name: ${job.name}`);
                return undefined;
        }
    }
    async handleGeneratePdf(job) {
        const templateType = job.data.templateType ?? generate_pdf_dto_1.PdfTemplateType.FINANCIAL_REPORT;
        if (templateType === generate_pdf_dto_1.PdfTemplateType.SITE_CAPTURE) {
            return await this.handleSiteCapture(job);
        }
        return await this.handleTemplatePdf(job, templateType);
    }
    async handleSiteCapture(job) {
        const url = job.data.url;
        if (!url)
            throw new Error('url is required for site-capture template');
        this.logger.log(`Site capture: ${url}`);
        await job.updateProgress(10);
        const screenshotBuffer = await this.playwrightService.screenshotFromUrl(url);
        await job.updateProgress(60);
        const screenshotBase64 = screenshotBuffer.toString('base64');
        const html = await this.templateService.render('site-capture', {
            siteUrl: url,
            screenshotBase64,
            capturedAt: new Date().toLocaleString('en-AU', {
                dateStyle: 'long',
                timeStyle: 'short',
            }),
        }, {});
        await job.updateProgress(80);
        const pdfBuffer = await this.playwrightService.generateFromHtml(html, { branded: false });
        await job.updateProgress(90);
        const filePath = await this.savePdf(job, pdfBuffer);
        await job.updateProgress(100);
        this.logger.log(`Site capture PDF saved: ${filePath}`);
        return {
            success: true,
            templateType: generate_pdf_dto_1.PdfTemplateType.SITE_CAPTURE,
            siteUrl: url,
            pdfUrl: `/pdf/${String(job.id)}/download`,
            generatedAt: new Date().toISOString(),
        };
    }
    getTemplateConfig(job, templateType) {
        switch (templateType) {
            case generate_pdf_dto_1.PdfTemplateType.RESUME:
                return {
                    templateName: 'resume',
                    layout: 'layouts/main',
                    pageCount: 1,
                    branded: false,
                    buildContext: () => ({ generatedAt: new Date().toISOString() }),
                };
            case generate_pdf_dto_1.PdfTemplateType.INVOICE:
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
            case generate_pdf_dto_1.PdfTemplateType.REAL_ESTATE:
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
            case generate_pdf_dto_1.PdfTemplateType.FINANCIAL_REPORT:
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
    async handleTemplatePdf(job, templateType) {
        const config = this.getTemplateConfig(job, templateType);
        const { pageCount } = config;
        const chunkSize = 10;
        this.logger.log(`PDF generation: template=${templateType}, pages=${String(pageCount)}`);
        await job.updateProgress(10);
        const numChunks = Math.ceil(pageCount / chunkSize);
        const htmlChunks = [];
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
    async savePdf(job, buffer) {
        const outputDir = (0, path_1.join)(process.cwd(), 'generated');
        await fs.mkdir(outputDir, { recursive: true });
        const filePath = (0, path_1.join)(outputDir, `${String(job.id)}.pdf`);
        await fs.writeFile(filePath, buffer);
        return filePath;
    }
};
exports.PdfProcessor = PdfProcessor;
exports.PdfProcessor = PdfProcessor = PdfProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('pdf-generation'),
    __metadata("design:paramtypes", [template_service_1.TemplateService,
        playwright_service_1.PlaywrightService])
], PdfProcessor);
//# sourceMappingURL=pdf.processor.js.map