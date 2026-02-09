import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class ImageService {
  async compressImage(file: Express.Multer.File, quality = 80): Promise<Buffer> {
    return await sharp(file.buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  }
}
