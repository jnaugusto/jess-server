import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import sharp from 'sharp';
import { QueueService } from '../common/services/queue.service';

@Injectable()
export class ImageService {
  constructor(
    @InjectQueue('image-processing')
    private readonly imageQueue: Queue,
    private readonly queueService: QueueService,
  ) {}

  async upscaleImage(
    file: Express.Multer.File,
    factor = 2,
    model = '4x_NMKD-Siax_200k',
  ): Promise<{ jobId: string }> {
    try {
      const job = await this.imageQueue.add('upscale', {
        fileName: file.originalname,
        upscaleFactor: factor,
        buffer: file.buffer,
        mimeType: file.mimetype,
        model,
      });

      return { jobId: String(job.id) };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during upscale queuing';
      throw new InternalServerErrorException(`Failed to queue upscale task: ${message}`);
    }
  }

  async getJobStatus(jobId: string) {
    return await this.queueService.getJobStatus(this.imageQueue, jobId, 25);
  }

  getJobProgressStream(jobId: string): Observable<{ data: object }> {
    return this.queueService.getJobProgressStream(this.imageQueue, jobId, 25);
  }

  async compressImage(
    file: Express.Multer.File,
    quality = 80,
    format: 'webp' | 'jpeg' | 'png' = 'webp',
  ): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
    try {
      const image = sharp(file.buffer).resize({ width: 1200, withoutEnlargement: true });

      let buffer: Buffer;
      let mimeType: string;
      let ext: string;

      if (format === 'jpeg') {
        buffer = await image.jpeg({ quality, mozjpeg: true }).toBuffer();
        mimeType = 'image/jpeg';
        ext = 'jpg';
      } else if (format === 'png') {
        // PNG quality maps to compressionLevel (0-9); convert 1-100 → 9-0
        const compressionLevel = Math.round(9 - (quality / 100) * 9);
        buffer = await image.png({ compressionLevel }).toBuffer();
        mimeType = 'image/png';
        ext = 'png';
      } else {
        buffer = await image.webp({ quality }).toBuffer();
        mimeType = 'image/webp';
        ext = 'webp';
      }

      return { buffer, mimeType, ext };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during compression';
      throw new InternalServerErrorException(`Failed to compress image: ${message}`);
    }
  }
}
