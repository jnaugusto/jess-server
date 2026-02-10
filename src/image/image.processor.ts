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
        return await this.handleUpscale(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return undefined;
    }
  }

  private async handleUpscale(job: Job<UpscaleJobData>) {
    const { data } = job;
    this.logger.log(`Upscaling image: ${data.fileName} by ${String(data.upscaleFactor)}x`);

    await job.updateProgress(10);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await job.updateProgress(50);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await job.updateProgress(90);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    this.logger.log(`Finished upscaling: ${data.fileName}`);
    return { success: true, fileName: data.fileName };
  }
}
