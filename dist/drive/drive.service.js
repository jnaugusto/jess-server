"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriveService = void 0;
const common_1 = require("@nestjs/common");
const googleapis_1 = require("googleapis");
const stream_1 = require("stream");
const sharp_1 = __importDefault(require("sharp"));
const env_1 = require("../env");
const PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png']);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);
let DriveService = class DriveService {
    getDriveClient() {
        const oauth2Client = new googleapis_1.google.auth.OAuth2(env_1.env.GOOGLE_OAUTH_CLIENT_ID, env_1.env.GOOGLE_OAUTH_CLIENT_SECRET);
        oauth2Client.setCredentials({
            refresh_token: env_1.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        });
        return googleapis_1.google.drive({ version: 'v3', auth: oauth2Client });
    }
    needsConversion(file) {
        if (!PASSTHROUGH_TYPES.has(file.mimetype))
            return true;
        const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
        if (HEIC_EXTENSIONS.has(ext))
            return true;
        return false;
    }
    async toJpg(file) {
        if (!this.needsConversion(file)) {
            return { ...file, converted: false };
        }
        try {
            const converted = await (0, sharp_1.default)(file.buffer)
                .rotate()
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown conversion error';
            throw new common_1.InternalServerErrorException(`Failed to convert image to JPG: ${message}`);
        }
    }
    async uploadFile(file) {
        const { converted, ...processedFile } = await this.toJpg(file);
        const drive = this.getDriveClient();
        try {
            const response = await drive.files.create({
                requestBody: {
                    name: file.originalname,
                    parents: [env_1.env.GOOGLE_DRIVE_FOLDER_ID],
                },
                media: {
                    mimeType: processedFile.mimetype,
                    body: stream_1.Readable.from(processedFile.buffer),
                },
                fields: 'id, name, webViewLink, mimeType, size',
            });
            const { id, name, webViewLink, mimeType, size } = response.data;
            return {
                id: id,
                name: name,
                url: webViewLink,
                mimeType: mimeType,
                size: Number(size ?? processedFile.size),
                originalName: file.originalname,
                converted,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown upload error';
            throw new common_1.InternalServerErrorException(`Failed to upload file to Google Drive: ${message}`);
        }
    }
    async uploadFiles(files) {
        return await Promise.all(files.map((file) => this.uploadFile(file)));
    }
    async *uploadFilesWithProgress(files) {
        yield { event: 'start', total: files.length };
        let succeeded = 0;
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const result = await this.uploadFile(file);
                succeeded++;
                yield { event: 'progress', file: file.originalname, index: i + 1, total: files.length, status: 'done', result };
            }
            catch (error) {
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
};
exports.DriveService = DriveService;
exports.DriveService = DriveService = __decorate([
    (0, common_1.Injectable)()
], DriveService);
//# sourceMappingURL=drive.service.js.map