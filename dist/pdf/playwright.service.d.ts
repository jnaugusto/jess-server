import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
export interface PdfRenderOptions {
    branded?: boolean;
}
export declare class PlaywrightService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private browser;
    private readonly poolSize;
    private readonly maxPages;
    private activePages;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getPage;
    private releasePage;
    generateFromHtml(html: string, opts?: PdfRenderOptions): Promise<Buffer>;
    screenshotFromUrl(url: string): Promise<Buffer>;
    generateLargePdf(htmlChunks: string[], opts?: PdfRenderOptions): Promise<Buffer>;
}
