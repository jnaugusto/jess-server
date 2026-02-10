import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

interface UpscaleJobData {
  fileName: string;
  upscaleFactor: number;
}

@Processor('image-processing')
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  async process(
    job: Job<UpscaleJobData>,
  ): Promise<{ success: boolean; fileName: string } | undefined> {
    switch (job.name) {
      case 'upscale':
        return await this.handleUpscale(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return undefined;
    }
  }

  private async handleUpscale(data: UpscaleJobData) {
    this.logger.log(`Upscaling image: ${data.fileName} by ${String(data.upscaleFactor)}x`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.logger.log(`Finished upscaling: ${data.fileName}`);
    return { success: true, fileName: data.fileName };
  }
}
