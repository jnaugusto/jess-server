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

  async upscaleImage(file: Express.Multer.File, factor = 2): Promise<{ jobId: string }> {
    try {
      const job = await this.imageQueue.add('upscale', {
        fileName: file.originalname,
        upscaleFactor: factor,
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

  async compressImage(file: Express.Multer.File, quality = 80): Promise<Buffer> {
    try {
      return await sharp(file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during compression';
      throw new InternalServerErrorException(`Failed to compress image: ${message}`);
    }
  }
}
