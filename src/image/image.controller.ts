import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  InternalServerErrorException,
  MaxFileSizeValidator,
  MessageEvent,
  Ip,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import * as express from 'express';
import { Observable } from 'rxjs';
import { CompressImageDto } from './dto/compress-image.dto';
import { UpscaleImageDto } from './dto/upscale-image.dto';
import { ImageService } from './image.service';

@AllowAnonymous()
@ApiTags('image')
@Controller('image')
export class ImageController {
  private static readonly ALLOWED_FORMATS = ['webp', 'jpeg', 'png'] as const;
  private static toFormat(value: unknown): 'webp' | 'jpeg' | 'png' {
    return ImageController.ALLOWED_FORMATS.find((f) => f === value) ?? 'webp';
  }

  constructor(private readonly imageService: ImageService) {}

  private formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm)).toString()} ${sizes[i]}`;
  }

  @Post('ocr')
  @ApiOperation({ summary: 'Extract text from an image using OCR (Tesseract)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        language: {
          type: 'string',
          default: 'eng',
          enum: ['eng', 'spa', 'fra', 'deu', 'por'],
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ocrImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif|bmp|tiff?)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('language') language: string,
  ) {
    return await this.imageService.ocrImage(file, language || 'eng');
  }

  @Post('compress')
  @ApiOperation({
    summary: 'Compress an image and optimize it (Returns Base64 + Metadata)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        quality: { type: 'integer', default: 80, minimum: 1, maximum: 100 },
        format: { type: 'string', default: 'webp', enum: ['webp', 'jpeg', 'png'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async compressImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() compressImageDto: CompressImageDto,
  ) {
    const quality = parseInt(String(compressImageDto.quality ?? 80), 10);
    const format = ImageController.toFormat(compressImageDto.format);
    const { buffer, mimeType, ext } = await this.imageService.compressImage(file, quality, format);
    const baseName = file.originalname.replace(/\.[^.]+$/, '');

    return {
      success: true,
      originalName: file.originalname,
      compressedName: `compressed_${baseName}.${ext}`,
      mimeType,
      format: ext,
      originalSize: file.size,
      originalSizeHuman: this.formatBytes(file.size),
      compressedSize: buffer.length,
      compressedSizeHuman: this.formatBytes(buffer.length),
      compressionRatio: `${((1 - buffer.length / file.size) * 100).toFixed(2)}%`,
      base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
    };
  }

  @Post('compress/download')
  @ApiOperation({ summary: 'Compress an image and download the webp file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        quality: {
          type: 'integer',
          default: 80,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async compressAndDownload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() compressImageDto: CompressImageDto,
    @Res() res: express.Response,
  ) {
    const quality = parseInt(String(compressImageDto.quality ?? 80), 10);
    const format = ImageController.toFormat(compressImageDto.format);
    const { buffer, mimeType, ext } = await this.imageService.compressImage(file, quality, format);
    const baseName = file.originalname.replace(/\.[^.]+$/, '');

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="compressed_${baseName}.${ext}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post('upscale')
  @ApiOperation({
    summary: 'Queue an image upscaling and optimization task',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        factor: {
          type: 'integer',
          default: 2,
          minimum: 2,
          maximum: 4,
        },
        model: {
          type: 'string',
          default: '4x_NMKD-Siax_200k',
          description: 'The name of the model to use',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upscaleImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() upscaleImageDto: UpscaleImageDto,
    @Ip() ip: string,
  ) {
    const { factor = 2, model = '4x_NMKD-Siax_200k' } = upscaleImageDto;
    return await this.imageService.upscaleImage(file, factor, model, ip);
  }

  @Get('upscale/:jobId/download')
  @ApiOperation({
    summary: 'Download the completed upscaled image',
  })
  async downloadUpscaledImage(@Param('jobId') jobId: string, @Res() res: express.Response) {
    const status = await this.imageService.getJobStatus(jobId);

    if (!status) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    if (status.state !== 'completed') {
      throw new BadRequestException(`Job is not completed yet. Current state: ${status.state}`);
    }

    // Handle different result formats (direct string or object with base64)
    let base64 = '';
    if (typeof status.result === 'string') {
      base64 = status.result;
    } else if (status.result && typeof status.result === 'object') {
      const result = status.result as { base64?: string };
      base64 = result.base64 ?? '';
    }

    if (!base64.includes('base64,')) {
      throw new InternalServerErrorException(
        `Upscaled image result is invalid or missing base64 data. Result: ${JSON.stringify(status.result)}`,
      );
    }

    // Convert base64 to buffer
    const base64Data = base64.split('base64,')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="upscaled_${jobId}.png"`,
      'Content-Length': imageBuffer.length,
    });

    res.end(imageBuffer);
  }

  @Get('upscale/:jobId')
  @ApiOperation({
    summary: 'Get the status and progress of an upscaling task',
  })
  async getUpscaleStatus(@Param('jobId') jobId: string) {
    const status = await this.imageService.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }
    return status;
  }

  @Sse('upscale/:jobId/progress')
  @ApiOperation({
    summary: 'Stream the progress of an upscaling task using SSE',
  })
  getUpscaleProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    console.log(`[SSE] Progress requested for Job ID: ${jobId}`);
    return this.imageService.getJobProgressStream(jobId);
  }
}
