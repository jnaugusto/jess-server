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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfService = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const fsPromises = __importStar(require("fs/promises"));
const path_1 = require("path");
const queue_service_1 = require("../common/services/queue.service");
let PdfService = class PdfService {
    pdfQueue;
    queueService;
    constructor(pdfQueue, queueService) {
        this.pdfQueue = pdfQueue;
        this.queueService = queueService;
    }
    async generatePdf(generatePdfDto) {
        try {
            const { address, pageCount, templateType, url } = generatePdfDto;
            const job = await this.pdfQueue.add('generate', {
                address,
                pageCount,
                templateType,
                url,
            });
            return { jobId: String(job.id) };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during PDF generation queuing';
            throw new common_1.InternalServerErrorException(`Failed to queue PDF generation task: ${message}`);
        }
    }
    async getJobStatus(jobId) {
        return await this.queueService.getJobStatus(this.pdfQueue, jobId, 25);
    }
    getJobProgressStream(jobId) {
        return this.queueService.getJobProgressStream(this.pdfQueue, jobId, 25);
    }
    async getDownloadStream(jobId) {
        const filePath = (0, path_1.join)(process.cwd(), 'generated', `${jobId}.pdf`);
        try {
            return await fsPromises.readFile(filePath);
        }
        catch {
            throw new common_1.NotFoundException(`PDF for job ${jobId} not found or not yet ready.`);
        }
    }
};
exports.PdfService = PdfService;
exports.PdfService = PdfService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('pdf-generation')),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        queue_service_1.QueueService])
], PdfService);
//# sourceMappingURL=pdf.service.js.map