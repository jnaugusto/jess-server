import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Header,
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
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { CompressImageDto } from './dto/compress-image.dto';
import { UpscaleImageDto } from './dto/upscale-image.dto';
import { ImageService } from './image.service';

@ApiTags('image')
@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  private formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${String(parseFloat((bytes / Math.pow(k, i)).toFixed(dm)))} ${sizes[i]}`;
  }

  @Post('compress')
  @ApiOperation({
    summary: 'Compress an image and return metadata with base64',
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
    @Res() res: Response,
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
    const factor = upscaleImageDto.factor ?? 2;
    return await this.imageService.upscaleImage(file, factor);
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
