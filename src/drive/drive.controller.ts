import {
  Controller,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { DriveService } from './drive.service';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'application/octet-stream', // iOS sometimes sends HEIC with this type
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic', '.heif',
]);

@AllowAnonymous()
@ApiTags('drive')
@Controller('drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload one or more images to Google Drive (auto-converts HEIC/HEIF/WebP → JPG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ResponseMessage('Files uploaded to Google Drive.')
  @UseInterceptors(
    FilesInterceptor('files', 60, {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — HEIC raws can be large
      fileFilter: (_, file, cb) => {
        const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
        const ok = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext);
        cb(ok ? null : new BadRequestException(`Unsupported file type: ${file.mimetype}`), ok);
      },
    }),
  )
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('No files provided.');
    return await this.driveService.uploadFiles(files);
  }

  @Post('upload/progress')
  @ApiOperation({ summary: 'Upload multiple images with SSE progress stream' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 60, {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
        const ok = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext);
        cb(ok ? null : new BadRequestException(`Unsupported file type: ${file.mimetype}`), ok);
      },
    }),
  )
  async uploadFilesWithProgress(
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    if (!files?.length) {
      res.status(400).json({ message: 'No files provided.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const event of this.driveService.uploadFilesWithProgress(files)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
  }
}
