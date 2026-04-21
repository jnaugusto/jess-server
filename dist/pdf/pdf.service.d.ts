import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { QueueService } from '../common/services/queue.service';
import { GeneratePdfDto } from './dto/generate-pdf.dto';
export declare class PdfService {
    private readonly pdfQueue;
    private readonly queueService;
    constructor(pdfQueue: Queue, queueService: QueueService);
    generatePdf(generatePdfDto: GeneratePdfDto): Promise<{
        jobId: string;
    }>;
    getJobStatus(jobId: string): Promise<import("../common/services/queue.service").JobStatus | null>;
    getJobProgressStream(jobId: string): Observable<{
        data: object;
    }>;
    getDownloadStream(jobId: string): Promise<Buffer>;
}
