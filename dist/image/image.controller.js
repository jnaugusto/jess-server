"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ImageController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const express = __importStar(require("express"));
const rxjs_1 = require("rxjs");
const compress_image_dto_1 = require("./dto/compress-image.dto");
const upscale_image_dto_1 = require("./dto/upscale-image.dto");
const image_service_1 = require("./image.service");
let ImageController = class ImageController {
    static { ImageController_1 = this; }
    imageService;
    static ALLOWED_FORMATS = ['webp', 'jpeg', 'png'];
    static toFormat(value) {
        return ImageController_1.ALLOWED_FORMATS.find((f) => f === value) ?? 'webp';
    }
    constructor(imageService) {
        this.imageService = imageService;
    }
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm)).toString()} ${sizes[i]}`;
    }
    async compressImage(file, compressImageDto) {
        const quality = parseInt(String(compressImageDto.quality ?? 80), 10);
        const format = ImageController_1.toFormat(compressImageDto.format);
        const { buffer, mimeType, ext } = await this.imageService.compressImage(file, quality, format);
        const baseName = file.originalname.replace(/\.[^.]+$/, '');
        return {
            success: true,
            originalName: file.originalname,
            compressedName: `compressed_${baseName}.${ext}`,
            mimeType,
            format: ext,
            originalSize: file.size,
            originalSizeHuman: this.formatBytes(file.size),
            compressedSize: buffer.length,
            compressedSizeHuman: this.formatBytes(buffer.length),
            compressionRatio: `${((1 - buffer.length / file.size) * 100).toFixed(2)}%`,
            base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
        };
    }
    async compressAndDownload(file, compressImageDto, res) {
        const quality = parseInt(String(compressImageDto.quality ?? 80), 10);
        const format = ImageController_1.toFormat(compressImageDto.format);
        const { buffer, mimeType, ext } = await this.imageService.compressImage(file, quality, format);
        const baseName = file.originalname.replace(/\.[^.]+$/, '');
        res.set({
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="compressed_${baseName}.${ext}"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
    async upscaleImage(file, upscaleImageDto) {
        const { factor = 2, model = '4x_NMKD-Siax_200k' } = upscaleImageDto;
        return await this.imageService.upscaleImage(file, factor, model);
    }
    async downloadUpscaledImage(jobId, res) {
        const status = await this.imageService.getJobStatus(jobId);
        if (!status) {
            throw new common_1.NotFoundException(`Job with ID ${jobId} not found`);
        }
        if (status.state !== 'completed') {
            throw new common_1.BadRequestException(`Job is not completed yet. Current state: ${status.state}`);
        }
        let base64 = '';
        if (typeof status.result === 'string') {
            base64 = status.result;
        }
        else if (status.result && typeof status.result === 'object') {
            const result = status.result;
            base64 = result.base64 ?? '';
        }
        if (!base64.includes('base64,')) {
            throw new common_1.InternalServerErrorException(`Upscaled image result is invalid or missing base64 data. Result: ${JSON.stringify(status.result)}`);
        }
        const base64Data = base64.split('base64,')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="upscaled_${jobId}.png"`,
            'Content-Length': imageBuffer.length,
        });
        res.end(imageBuffer);
    }
    async getUpscaleStatus(jobId) {
        const status = await this.imageService.getJobStatus(jobId);
        if (!status) {
            throw new common_1.NotFoundException(`Job with ID ${jobId} not found`);
        }
        return status;
    }
    getUpscaleProgress(jobId) {
        return this.imageService.getJobProgressStream(jobId);
    }
};
exports.ImageController = ImageController;
__decorate([
    (0, common_1.Post)('compress'),
    (0, swagger_1.ApiOperation)({
        summary: 'Compress an image and optimize it (Returns Base64 + Metadata)',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                quality: { type: 'integer', default: 80, minimum: 1, maximum: 100 },
                format: { type: 'string', default: 'webp', enum: ['webp', 'jpeg', 'png'] },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
            new common_1.FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
    }))),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, compress_image_dto_1.CompressImageDto]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "compressImage", null);
__decorate([
    (0, common_1.Post)('compress/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Compress an image and download the webp file' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
            new common_1.FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
    }))),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, compress_image_dto_1.CompressImageDto, Object]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "compressAndDownload", null);
__decorate([
    (0, common_1.Post)('upscale'),
    (0, swagger_1.ApiOperation)({
        summary: 'Queue an image upscaling and optimization task',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
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
                model: {
                    type: 'string',
                    default: '4x_NMKD-Siax_200k',
                    description: 'The name of the model to use',
                },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
            new common_1.FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
    }))),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, upscale_image_dto_1.UpscaleImageDto]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "upscaleImage", null);
__decorate([
    (0, common_1.Get)('upscale/:jobId/download'),
    (0, swagger_1.ApiOperation)({
        summary: 'Download the completed upscaled image',
    }),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "downloadUpscaledImage", null);
__decorate([
    (0, common_1.Get)('upscale/:jobId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get the status and progress of an upscaling task',
    }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ImageController.prototype, "getUpscaleStatus", null);
__decorate([
    (0, common_1.Sse)('upscale/:jobId/progress'),
    (0, swagger_1.ApiOperation)({
        summary: 'Stream the progress of an upscaling task using SSE',
    }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", rxjs_1.Observable)
], ImageController.prototype, "getUpscaleProgress", null);
exports.ImageController = ImageController = ImageController_1 = __decorate([
    (0, nestjs_better_auth_1.AllowAnonymous)(),
    (0, swagger_1.ApiTags)('image'),
    (0, common_1.Controller)('image'),
    __metadata("design:paramtypes", [image_service_1.ImageService])
], ImageController);
//# sourceMappingURL=image.controller.js.map