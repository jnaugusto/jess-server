import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import sharp from 'sharp';

interface UpscaleJobData {
  fileName: string;
  upscaleFactor: number;
  buffer: Buffer;
  mimeType: string;
  model: string;
}

@Processor('image-processing')
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  async process(
    job: Job,
  ): Promise<{ success: boolean; base64: string } | undefined> {
    switch (job.name) {
      case 'upscale':
        return await this.handleUpscale(job as Job<UpscaleJobData>);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return undefined;
    }
  }

  private async handleUpscale(job: Job<UpscaleJobData>) {
    const { data } = job;
    const upscaleFactor = data.upscaleFactor || 2;

    this.logger.log(
      `[Job ${job.id ?? 'unknown'}] Upscaling image: ${data.fileName} by ${String(upscaleFactor)}x using Replicate (nightmareai/real-esrgan)`,
    );

    try {
      await job.updateProgress(5);

      // Convert buffer to base64 for Replicate input
      let imageBuffer: Buffer;
      const bufferData = data.buffer as unknown as { type: string; data: number[] };
      if (Buffer.isBuffer(data.buffer)) {
        imageBuffer = data.buffer;
      } else if (
        typeof data.buffer === 'object' &&
        bufferData.type === 'Buffer' &&
        Array.isArray(bufferData.data)
      ) {
        imageBuffer = Buffer.from(bufferData.data);
      } else {
        imageBuffer = Buffer.from(data.buffer);
      }

      // Check image size and resize if it exceeds Replicate's GPU memory limits (~2M pixels)
      const MAX_PIXELS = 2000000;
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const totalPixels = width * height;

      if (totalPixels > MAX_PIXELS) {
        this.logger.warn(
          `[Job ${job.id ?? 'unknown'}] Image too large (${String(width)}x${String(height)} = ${String(totalPixels)}px). Resizing to fit within ${String(MAX_PIXELS)}px.`,
        );
        const scale = Math.sqrt(MAX_PIXELS / totalPixels);
        const newWidth = Math.floor(width * scale);
        imageBuffer = await sharp(imageBuffer).resize(newWidth).toBuffer();
        await job.updateProgress(10);
      }

      const base64Input = `data:${data.mimeType || 'image/png'};base64,${imageBuffer.toString('base64')}`;

      await job.updateProgress(15);

      const Replicate = (await import('replicate')).default;
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
        useFileOutput: false,
      });

      if (!process.env.REPLICATE_API_TOKEN) {
        throw new Error('REPLICATE_API_TOKEN is not defined in environment variables');
      }

      this.logger.log('Starting Replicate prediction...');

      const output = await replicate.run('flux-kontext-apps/restore-image', {
        input: {
          input_image: base64Input,
        },
      });

      await job.updateProgress(80);

      const result = output as unknown;
      if (!result || typeof result !== 'string') {
        throw new Error(`Unexpected output from Replicate: ${JSON.stringify(result)}`);
      }

      this.logger.log(`Replicate output received: ${result}`);

      // Replicate returns a URL, we need to fetch it and convert to base64
      const response = await fetch(result);
      if (!response.ok) throw new Error(`Failed to fetch upscaled image from ${result}`);

      const arrayBuffer = await response.arrayBuffer();
      const outputBuffer = Buffer.from(arrayBuffer);
      const base64Result = `data:image/png;base64,${outputBuffer.toString('base64')}`;

      await job.updateProgress(100);
      this.logger.log(`Finished upscaling: ${data.fileName}`);

      return { success: true, base64: base64Result };
    } catch (error) {
      this.logger.error(`Error during upscale with Replicate: ${(error as Error).message}`);
      throw error;
    }
  }
}
