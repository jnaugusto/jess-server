import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { QueueService } from '../common/services/queue.service';
export declare class ImageService {
    private readonly imageQueue;
    private readonly queueService;
    constructor(imageQueue: Queue, queueService: QueueService);
    upscaleImage(file: Express.Multer.File, factor?: number, model?: string): Promise<{
        jobId: string;
    }>;
    getJobStatus(jobId: string): Promise<import("../common/services/queue.service").JobStatus | null>;
    getJobProgressStream(jobId: string): Observable<{
        data: object;
    }>;
    compressImage(file: Express.Multer.File, quality?: number, format?: 'webp' | 'jpeg' | 'png'): Promise<{
        buffer: Buffer;
        mimeType: string;
        ext: string;
    }>;
}
