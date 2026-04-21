"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriveController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const response_message_decorator_1 = require("../common/decorators/response-message.decorator");
const drive_service_1 = require("./drive.service");
const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'application/octet-stream',
]);
const ALLOWED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic', '.heif',
]);
let DriveController = class DriveController {
    driveService;
    constructor(driveService) {
        this.driveService = driveService;
    }
    async uploadFiles(files) {
        if (!files?.length)
            throw new common_1.BadRequestException('No files provided.');
        return await this.driveService.uploadFiles(files);
    }
    async uploadFilesWithProgress(files, res) {
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
};
exports.DriveController = DriveController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, swagger_1.ApiOperation)({
        summary: 'Upload one or more images to Google Drive (auto-converts HEIC/HEIF/WebP → JPG)',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                },
            },
        },
    }),
    (0, response_message_decorator_1.ResponseMessage)('Files uploaded to Google Drive.'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 60, {
        limits: { fileSize: 25 * 1024 * 1024 },
        fileFilter: (_, file, cb) => {
            const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
            const ok = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext);
            cb(ok ? null : new common_1.BadRequestException(`Unsupported file type: ${file.mimetype}`), ok);
        },
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], DriveController.prototype, "uploadFiles", null);
__decorate([
    (0, common_1.Post)('upload/progress'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload multiple images with SSE progress stream' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                files: { type: 'array', items: { type: 'string', format: 'binary' } },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 60, {
        limits: { fileSize: 25 * 1024 * 1024 },
        fileFilter: (_, file, cb) => {
            const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
            const ok = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext);
            cb(ok ? null : new common_1.BadRequestException(`Unsupported file type: ${file.mimetype}`), ok);
        },
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], DriveController.prototype, "uploadFilesWithProgress", null);
exports.DriveController = DriveController = __decorate([
    (0, nestjs_better_auth_1.AllowAnonymous)(),
    (0, swagger_1.ApiTags)('drive'),
    (0, common_1.Controller)('drive'),
    __metadata("design:paramtypes", [drive_service_1.DriveService])
], DriveController);
//# sourceMappingURL=drive.controller.js.map