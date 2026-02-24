import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp'; // Add this dependency
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
    const upscaleFactor = '2';

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${jobId}.png`); // Always use PNG for input
    const normalizedPath = path.join(tempDir, `normalized_${jobId}.png`);
    const outputPath = path.join(tempDir, `output_${jobId}.png`);

    this.logger.log(
      `Upscaling image: ${data.fileName} by ${upscaleFactor}x using model ${data.model}`,
    );

    try {
      await job.updateProgress(5);

      // Convert buffer
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

      await fs.writeFile(inputPath, imageBuffer);
      await job.updateProgress(10);

      // **CRITICAL FIX: Normalize the image first to prevent color artifacts**
      this.logger.log('Normalizing image...');
      await sharp(inputPath)
        .removeAlpha() // Remove transparency
        .toColorspace('srgb') // Ensure sRGB color space
        .png({ compressionLevel: 0 }) // Uncompressed for best quality
        .toFile(normalizedPath);

      await job.updateProgress(20);

      const modelsPath = process.env.NODE_ENV === 'production' ? '/opt/upscayl/models' : 'models';

      // Debug: List models directory
      try {
        const files = await fs.readdir(modelsPath);
        this.logger.log(`Available models in ${modelsPath}: ${files.join(', ')}`);
      } catch (e) {
        this.logger.error(`Could not list models in ${modelsPath}: ${(e as Error).message}`);
      }

      // Optimized params: -s for explicit scale, -x for TTA mode (better quality), -t 400 for larger tiles (fewer artifacts)
      const cmd = `realesrgan-ncnn-vulkan -i "${normalizedPath}" -o "${outputPath}" -s ${upscaleFactor} -m "${modelsPath}" -n ${data.model} -t 400 -x -f png -v`;

      this.logger.log(`Executing: ${cmd}`);

      try {
        const { stdout, stderr } = await execPromise(cmd);
        if (stdout) this.logger.log(`stdout: ${stdout}`);
        if (stderr) this.logger.warn(`stderr: ${stderr}`);
      } catch (e: unknown) {
        const execError = e as { stderr?: string; stdout?: string; message: string };
        const stderr = execError.stderr ?? '';
        const stdout = execError.stdout ?? '';
        this.logger.error(`Upscayl failed. Stderr: ${stderr}, Stdout: ${stdout}`);

        if (stderr.includes('not found') || execError.message.includes('ENOENT')) {
          throw new Error(
            'realesrgan-ncnn-vulkan not found. Please ensure the binary is installed in the Docker container.',
          );
        }
        throw e;
      }

      await job.updateProgress(90);

      // Read result
      const outputBuffer = await fs.readFile(outputPath);
      const base64 = `data:image/png;base64,${outputBuffer.toString('base64')}`;

      // Cleanup all temp files
      await Promise.all([
        fs.unlink(inputPath).catch(() => {
          /* ignore */
        }),
        fs.unlink(normalizedPath).catch(() => {
          /* ignore */
        }),
        fs.unlink(outputPath).catch(() => {
          /* ignore */
        }),
      ]);

      await job.updateProgress(100);
      this.logger.log(`Finished upscaling: ${data.fileName}`);

      return { success: true, base64 };
    } catch (error) {
      this.logger.error(`Error during upscale: ${(error as Error).message}`);

      // Ensure cleanup on error
      await Promise.all([
        fs.unlink(inputPath).catch(() => {
          /* ignore */
        }),
        fs.unlink(normalizedPath).catch(() => {
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
