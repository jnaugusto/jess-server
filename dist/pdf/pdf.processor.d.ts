import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TemplateService } from '../template/template.service';
import { PdfTemplateType } from './dto/generate-pdf.dto';
import { PlaywrightService } from './playwright.service';
interface PdfJobData {
    templateType?: PdfTemplateType;
    address?: string;
    pageCount?: number;
    url?: string;
}
export declare class PdfProcessor extends WorkerHost {
    private readonly templateService;
    private readonly playwrightService;
    private readonly logger;
    constructor(templateService: TemplateService, playwrightService: PlaywrightService);
    process(job: Job<PdfJobData>): Promise<{
        success: boolean;
        templateType: PdfTemplateType;
        siteUrl: string;
        pdfUrl: string;
        generatedAt: string;
    } | {
        success: boolean;
        templateType: PdfTemplateType;
        address: string | undefined;
        pdfUrl: string;
        generatedAt: string;
    } | undefined>;
    private handleGeneratePdf;
    private handleSiteCapture;
    private getTemplateConfig;
    private handleTemplatePdf;
    private savePdf;
}
export {};
