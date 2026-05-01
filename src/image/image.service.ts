import { InjectQueue } from '@nestjs/bullmq';
import { 
  Injectable, 
  InternalServerErrorException, 
  Logger, 
  BadRequestException 
} from '@nestjs/common';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import * as path from 'path';
import { Observable } from 'rxjs';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { QueueService } from '../common/services/queue.service';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    @InjectQueue('image-processing')
    private readonly imageQueue: Queue,
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
  ) {}

  async upscaleImage(
    file: Express.Multer.File,
    factor = 2,
    model = '4x_NMKD-Siax_200k',
    ip?: string,
  ): Promise<{ jobId: string }> {
    try {
      if (ip) {
        const rateLimitKey = `rate-limit:restoration:${ip}`;
        const count = await this.redisService.getClient().get(rateLimitKey);
        const currentCount = count ? parseInt(count, 10) : 0;

        if (currentCount >= 3) {
          throw new BadRequestException(
            'Daily limit reached. You can only restore 3 images per 24 hours.',
          );
        }

        // Increment count
        await this.redisService.getClient().incr(rateLimitKey);
        if (currentCount === 0) {
          await this.redisService.getClient().expire(rateLimitKey, 24 * 60 * 60);
        }
      }

      const jobId = crypto.randomUUID();
      await this.imageQueue.add(
        'upscale',
        {
          fileName: file.originalname,
          upscaleFactor: factor,
          buffer: file.buffer,
          mimeType: file.mimetype,
          model,
        },
        {
          jobId,
          removeOnComplete: { age: 300, count: 1000 },
          removeOnFail: { age: 24 * 3600, count: 5000 },
        },
      );

      this.logger.log(`Created upscale job: ${jobId}`);
      return { jobId };
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

  async ocrImage(
    file: Express.Multer.File,
    language = 'eng',
  ): Promise<{ text: string; confidence: number; wordCount: number; charCount: number }> {
    const SUPPORTED = ['eng', 'spa', 'fra', 'deu', 'por'];
    const lang = SUPPORTED.includes(language) ? language : 'eng';
    const cachePath = path.join(process.cwd(), 'tessdata');

    const worker = await Tesseract.createWorker(lang, 1, { cachePath });
    try {
      const { data } = await worker.recognize(file.buffer);
      const text = data.text.trim();
      return {
        text,
        confidence: Math.round(data.confidence),
        wordCount: text ? text.split(/\s+/).filter((w) => w.length > 0).length : 0,
        charCount: text.replace(/\s+/g, '').length,
      };
    } finally {
      await worker.terminate();
    }
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
