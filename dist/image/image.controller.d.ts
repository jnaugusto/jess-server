import { MessageEvent } from '@nestjs/common';
import * as express from 'express';
import { Observable } from 'rxjs';
import { CompressImageDto } from './dto/compress-image.dto';
import { UpscaleImageDto } from './dto/upscale-image.dto';
import { ImageService } from './image.service';
export declare class ImageController {
    private readonly imageService;
    private static readonly ALLOWED_FORMATS;
    private static toFormat;
    constructor(imageService: ImageService);
    private formatBytes;
    compressImage(file: Express.Multer.File, compressImageDto: CompressImageDto): Promise<{
        success: boolean;
        originalName: string;
        compressedName: string;
        mimeType: string;
        format: string;
        originalSize: number;
        originalSizeHuman: string;
        compressedSize: number;
        compressedSizeHuman: string;
        compressionRatio: string;
        base64: string;
    }>;
    compressAndDownload(file: Express.Multer.File, compressImageDto: CompressImageDto, res: express.Response): Promise<void>;
    upscaleImage(file: Express.Multer.File, upscaleImageDto: UpscaleImageDto): Promise<{
        jobId: string;
    }>;
    downloadUpscaledImage(jobId: string, res: express.Response): Promise<void>;
    getUpscaleStatus(jobId: string): Promise<import("../common/services/queue.service").JobStatus>;
    getUpscaleProgress(jobId: string): Observable<MessageEvent>;
}
