import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
interface UpscaleJobData {
    fileName: string;
    upscaleFactor: number;
    buffer: Buffer;
    mimeType: string;
    model: string;
}
export declare class ImageProcessor extends WorkerHost {
    private readonly logger;
    process(job: Job<UpscaleJobData>): Promise<{
        success: boolean;
        base64: string;
    } | undefined>;
    private handleUpscale;
}
export {};
