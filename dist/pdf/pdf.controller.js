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
exports.PdfController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const rxjs_1 = require("rxjs");
const response_message_decorator_1 = require("../common/decorators/response-message.decorator");
const generate_pdf_dto_1 = require("./dto/generate-pdf.dto");
const pdf_service_1 = require("./pdf.service");
let PdfController = class PdfController {
    pdfService;
    constructor(pdfService) {
        this.pdfService = pdfService;
    }
    async generatePdf(generatePdfDto) {
        return await this.pdfService.generatePdf(generatePdfDto);
    }
    async getJobStatus(jobId) {
        const status = await this.pdfService.getJobStatus(jobId);
        if (!status)
            throw new common_1.NotFoundException(`Job ${jobId} not found.`);
        return status;
    }
    async downloadPdf(jobId) {
        const stream = await this.pdfService.getDownloadStream(jobId);
        return new common_1.StreamableFile(stream, {
            type: 'application/pdf',
            disposition: `attachment; filename="${jobId}.pdf"`,
        });
    }
    getJobProgress(jobId) {
        return this.pdfService.getJobProgressStream(jobId);
    }
};
exports.PdfController = PdfController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, swagger_1.ApiOperation)({ summary: 'Queue a PDF generation task' }),
    (0, response_message_decorator_1.ResponseMessage)('PDF generation queued.'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_pdf_dto_1.GeneratePdfDto]),
    __metadata("design:returntype", Promise)
], PdfController.prototype, "generatePdf", null);
__decorate([
    (0, common_1.Get)(':jobId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the status and progress of a PDF generation task' }),
    (0, swagger_1.ApiParam)({ name: 'jobId', description: 'The ID of the PDF generation job' }),
    (0, response_message_decorator_1.ResponseMessage)('Job status retrieved.'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PdfController.prototype, "getJobStatus", null);
__decorate([
    (0, common_1.Get)(':jobId/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download the generated PDF for a completed job' }),
    (0, swagger_1.ApiParam)({ name: 'jobId', description: 'The ID of the PDF generation job' }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PdfController.prototype, "downloadPdf", null);
__decorate([
    (0, common_1.Sse)(':jobId/progress'),
    (0, swagger_1.ApiOperation)({ summary: 'Stream the progress of a PDF generation task using SSE' }),
    (0, swagger_1.ApiParam)({ name: 'jobId', description: 'The ID of the PDF generation job' }),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", rxjs_1.Observable)
], PdfController.prototype, "getJobProgress", null);
exports.PdfController = PdfController = __decorate([
    (0, nestjs_better_auth_1.AllowAnonymous)(),
    (0, swagger_1.ApiTags)('pdf'),
    (0, common_1.Controller)('pdf'),
    __metadata("design:paramtypes", [pdf_service_1.PdfService])
], PdfController);
//# sourceMappingURL=pdf.controller.js.map