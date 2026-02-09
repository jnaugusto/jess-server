import { Body, Controller, Header, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CompressImageDto } from './dto/compress-image.dto';
import { ImageService } from './image.service';

@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('compress')
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
      size: compressedBuffer.length,
      base64: `data:image/webp;base64,${compressedBuffer.toString('base64')}`,
    };
  }

  @Post('compress/download')
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
