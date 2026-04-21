import type { Response } from 'express';
import { DriveService } from './drive.service';
export declare class DriveController {
    private readonly driveService;
    constructor(driveService: DriveService);
    uploadFiles(files: Express.Multer.File[]): Promise<import("./drive.service").DriveUploadResult[]>;
    uploadFilesWithProgress(files: Express.Multer.File[], res: Response): Promise<void>;
}
