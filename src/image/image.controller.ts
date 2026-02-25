import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Header,
  InternalServerErrorException,
  MaxFileSizeValidator,
  MessageEvent,
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
  constructor(private readonly imageService: ImageService) {}

  private formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm)).toString()} ${sizes[i]}`;
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
  async compressImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() compressImageDto: CompressImageDto,
  ) {
    const quality = compressImageDto.quality ?? 80;
    const compressedBuffer = await this.imageService.compressImage(file, quality);

    return {
      success: true,
      originalName: file.originalname,
      compressedName: `compressed_${file.originalname.split('.')[0]}.webp`,
      mimeType: 'image/webp',
      originalSize: file.size,
      originalSizeHuman: this.formatBytes(file.size),
      compressedSize: compressedBuffer.length,
      compressedSizeHuman: this.formatBytes(compressedBuffer.length),
      compressionRatio: `${((1 - compressedBuffer.length / file.size) * 100).toFixed(2)}%`,
      base64: `data:image/webp;base64,${compressedBuffer.toString('base64')}`,
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
  @Header('Content-Type', 'image/webp')
  async compressAndDownload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() compressImageDto: CompressImageDto,
    @Res() res: express.Response,
  ) {
    const quality = compressImageDto.quality ?? 80;
    const compressedBuffer = await this.imageService.compressImage(file, quality);

    res.set({
      'Content-Disposition': `attachment; filename="compressed_${
        file.originalname.split('.')[0]
      }.webp"`,
      'Content-Length': compressedBuffer.length,
    });

    res.end(compressedBuffer);
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
  ) {
    const { factor = 2, model = '4x_NMKD-Siax_200k' } = upscaleImageDto;
    return await this.imageService.upscaleImage(file, factor, model);
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
    return this.imageService.getJobProgressStream(jobId);
  }
}
