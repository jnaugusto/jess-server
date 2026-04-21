import { MessageEvent, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
import { PdfService } from './pdf.service';
export declare class PdfController {
    private readonly pdfService;
    constructor(pdfService: PdfService);
    generatePdf(generatePdfDto: GeneratePdfDto): Promise<{
        jobId: string;
    }>;
    getJobStatus(jobId: string): Promise<import("../common/services/queue.service").JobStatus>;
    downloadPdf(jobId: string): Promise<StreamableFile>;
    getJobProgress(jobId: string): Observable<MessageEvent>;
}
