import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import sharp from 'sharp';
import { env } from '../env';

export interface DriveUploadResult {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  originalName: string;
  converted: boolean;
}

export type UploadProgressEvent =
  | { event: 'start'; total: number }
  | { event: 'progress'; file: string; index: number; total: number; status: 'done'; result: DriveUploadResult }
  | { event: 'progress'; file: string; index: number; total: number; status: 'error'; error: string }
  | { event: 'complete'; succeeded: number; failed: number };

const PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png']);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

@Injectable()
export class DriveService {
  private getDriveClient() {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_OAUTH_CLIENT_ID,
      env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  private needsConversion(file: Express.Multer.File): boolean {
    if (!PASSTHROUGH_TYPES.has(file.mimetype)) return true;

    // Browsers sometimes label HEIC files as application/octet-stream
    const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
    if (HEIC_EXTENSIONS.has(ext)) return true;

    return false;
  }

  async toJpg(file: Express.Multer.File): Promise<Express.Multer.File & { converted: boolean }> {
    if (!this.needsConversion(file)) {
      return { ...file, converted: false };
    }

    try {
      const converted = await sharp(file.buffer)
        .rotate() // auto-correct EXIF orientation (important for phone photos)
        .keepMetadata()
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

      const baseName = file.originalname.replace(/\.[^/.]+$/, '');

      return {
        ...file,
        buffer: converted,
        mimetype: 'image/jpeg',
        originalname: `${baseName}.jpg`,
        size: converted.length,
        converted: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown conversion error';
      throw new InternalServerErrorException(`Failed to convert image to JPG: ${message}`);
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<DriveUploadResult> {
    const { converted, ...processedFile } = await this.toJpg(file);
    const drive = this.getDriveClient();

    try {
      const response = await drive.files.create({
        requestBody: {
          name: file.originalname,
          parents: [env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: processedFile.mimetype,
          body: Readable.from(processedFile.buffer),
        },
        fields: 'id, name, webViewLink, mimeType, size',
      });

      const { id, name, webViewLink, mimeType, size } = response.data;

      return {
        id: id!,
        name: name!,
        url: webViewLink!,
        mimeType: mimeType!,
        size: Number(size ?? processedFile.size),
        originalName: file.originalname,
        converted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown upload error';
      throw new InternalServerErrorException(`Failed to upload file to Google Drive: ${message}`);
    }
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<DriveUploadResult[]> {
    return await Promise.all(files.map((file) => this.uploadFile(file)));
  }

  async *uploadFilesWithProgress(files: Express.Multer.File[]): AsyncGenerator<UploadProgressEvent> {
    yield { event: 'start', total: files.length };

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await this.uploadFile(file);
        succeeded++;
        yield { event: 'progress', file: file.originalname, index: i + 1, total: files.length, status: 'done', result };
      } catch (error) {
        failed++;
        yield {
          event: 'progress',
          file: file.originalname,
          index: i + 1,
          total: files.length,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        };
      }
    }

    yield { event: 'complete', succeeded, failed };
  }
}
