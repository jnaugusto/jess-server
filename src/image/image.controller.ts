import { Body, Controller, Header, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CompressImageDto } from './dto/compress-image.dto';
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
    @UploadedFile() file: Express.Multer.File,
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
    @UploadedFile() file: Express.Multer.File,
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
}
