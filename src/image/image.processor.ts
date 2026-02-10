import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

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
    job: Job<UpscaleJobData>,
  ): Promise<{ success: boolean; base64: string } | undefined> {
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
    const jobId = job.id ?? Date.now().toString();

    // Use /tmp in linux/docker, or os.tmpdir() for portability
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${jobId}_${data.fileName}`);
    // Output is usually PNG by default in Real-ESRGAN if not specified,
    // but we'll use the same extension as input to be safe, or just .png
    const outputPath = path.join(tempDir, `output_${jobId}_${data.fileName.split('.')[0]}.png`);

    this.logger.log(
      `Upscaling image locally (CPU): ${data.fileName} by ${String(data.upscaleFactor)}x`,
    );

    try {
      await job.updateProgress(5);

      // Save input buffer to temp file
      await fs.writeFile(inputPath, Buffer.from(data.buffer));
      await job.updateProgress(10);

      // -g -1 forces CPU mode. -m specifies the models path for the Docker container.
      const modelsPath = process.env.NODE_ENV === 'production' ? '/opt/upscayl/models' : 'models';
      const cmd = `upscayl-bin -i "${inputPath}" -o "${outputPath}" -s ${String(data.upscaleFactor)} -g -1 -m "${modelsPath}" -n ${data.model}`;

      this.logger.log(`Executing: ${cmd}`);

      try {
        await execPromise(cmd);
      } catch (execError) {
        const error = execError as Error;
        if (error.message.includes('not found') || error.message.includes('ENOENT')) {
          throw new Error(
            'upscayl-bin not found. If running locally on Mac, install it via "brew install upscayl-ncnn" or run via Docker.',
          );
        }
        throw error;
      }
      await job.updateProgress(90);

      // Read result
      const outputBuffer = await fs.readFile(outputPath);
      const base64 = `data:image/png;base64,${outputBuffer.toString('base64')}`;

      // Cleanup
      await Promise.all([
        fs.unlink(inputPath).catch(() => {
          /* ignore */
        }),
        fs.unlink(outputPath).catch(() => {
          /* ignore */
        }),
      ]);

      await job.updateProgress(100);
      this.logger.log(`Finished local upscaling: ${data.fileName}`);

      return { success: true, base64 };
    } catch (error) {
      this.logger.error(`Error during local upscale: ${(error as Error).message}`);

      // Ensure cleanup on error
      await Promise.all([
        fs.unlink(inputPath).catch(() => {
          /* ignore */
        }),
        fs.unlink(outputPath).catch(() => {
          /* ignore */
        }),
      ]);

      throw error;
    }
  }
}
