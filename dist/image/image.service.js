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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const sharp_1 = __importDefault(require("sharp"));
const queue_service_1 = require("../common/services/queue.service");
let ImageService = class ImageService {
    imageQueue;
    queueService;
    constructor(imageQueue, queueService) {
        this.imageQueue = imageQueue;
        this.queueService = queueService;
    }
    async upscaleImage(file, factor = 2, model = '4x_NMKD-Siax_200k') {
        try {
            const job = await this.imageQueue.add('upscale', {
                fileName: file.originalname,
                upscaleFactor: factor,
                buffer: file.buffer,
                mimeType: file.mimetype,
                model,
            });
            return { jobId: String(job.id) };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during upscale queuing';
            throw new common_1.InternalServerErrorException(`Failed to queue upscale task: ${message}`);
        }
    }
    async getJobStatus(jobId) {
        return await this.queueService.getJobStatus(this.imageQueue, jobId, 25);
    }
    getJobProgressStream(jobId) {
        return this.queueService.getJobProgressStream(this.imageQueue, jobId, 25);
    }
    async compressImage(file, quality = 80, format = 'webp') {
        try {
            const image = (0, sharp_1.default)(file.buffer).resize({ width: 1200, withoutEnlargement: true });
            let buffer;
            let mimeType;
            let ext;
            if (format === 'jpeg') {
                buffer = await image.jpeg({ quality, mozjpeg: true }).toBuffer();
                mimeType = 'image/jpeg';
                ext = 'jpg';
            }
            else if (format === 'png') {
                const compressionLevel = Math.round(9 - (quality / 100) * 9);
                buffer = await image.png({ compressionLevel }).toBuffer();
                mimeType = 'image/png';
                ext = 'png';
            }
            else {
                buffer = await image.webp({ quality }).toBuffer();
                mimeType = 'image/webp';
                ext = 'webp';
            }
            return { buffer, mimeType, ext };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during compression';
            throw new common_1.InternalServerErrorException(`Failed to compress image: ${message}`);
        }
    }
};
exports.ImageService = ImageService;
exports.ImageService = ImageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('image-processing')),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        queue_service_1.QueueService])
], ImageService);
//# sourceMappingURL=image.service.js.map