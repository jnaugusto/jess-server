export interface DriveUploadResult {
    id: string;
    name: string;
    url: string;
    mimeType: string;
    size: number;
    originalName: string;
    converted: boolean;
}
export type UploadProgressEvent = {
    event: 'start';
    total: number;
} | {
    event: 'progress';
    file: string;
    index: number;
    total: number;
    status: 'done';
    result: DriveUploadResult;
} | {
    event: 'progress';
    file: string;
    index: number;
    total: number;
    status: 'error';
    error: string;
} | {
    event: 'complete';
    succeeded: number;
    failed: number;
};
export declare class DriveService {
    private getDriveClient;
    private needsConversion;
    toJpg(file: Express.Multer.File): Promise<Express.Multer.File & {
        converted: boolean;
    }>;
    uploadFile(file: Express.Multer.File): Promise<DriveUploadResult>;
    uploadFiles(files: Express.Multer.File[]): Promise<DriveUploadResult[]>;
    uploadFilesWithProgress(files: Express.Multer.File[]): AsyncGenerator<UploadProgressEvent>;
}
