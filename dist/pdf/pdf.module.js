"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfModule = void 0;
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const nestjs_1 = require("@bull-board/nestjs");
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const template_module_1 = require("../template/template.module");
const pdf_controller_1 = require("./pdf.controller");
const pdf_processor_1 = require("./pdf.processor");
const pdf_service_1 = require("./pdf.service");
const playwright_service_1 = require("./playwright.service");
let PdfModule = class PdfModule {
};
exports.PdfModule = PdfModule;
exports.PdfModule = PdfModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: 'pdf-generation',
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: 'pdf-generation',
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            template_module_1.TemplateModule,
        ],
        providers: [pdf_service_1.PdfService, pdf_processor_1.PdfProcessor, playwright_service_1.PlaywrightService],
        controllers: [pdf_controller_1.PdfController],
    })
], PdfModule);
//# sourceMappingURL=pdf.module.js.map