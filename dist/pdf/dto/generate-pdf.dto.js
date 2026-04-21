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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratePdfDto = exports.PdfTemplateType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
var PdfTemplateType;
(function (PdfTemplateType) {
    PdfTemplateType["FINANCIAL_REPORT"] = "financial-report";
    PdfTemplateType["RESUME"] = "resume";
    PdfTemplateType["INVOICE"] = "invoice";
    PdfTemplateType["REAL_ESTATE"] = "real-estate";
    PdfTemplateType["SITE_CAPTURE"] = "site-capture";
})(PdfTemplateType || (exports.PdfTemplateType = PdfTemplateType = {}));
class GeneratePdfDto {
    templateType;
    address;
    pageCount;
    url;
}
exports.GeneratePdfDto = GeneratePdfDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The template to generate.',
        enum: PdfTemplateType,
        default: PdfTemplateType.FINANCIAL_REPORT,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(PdfTemplateType),
    __metadata("design:type", String)
], GeneratePdfDto.prototype, "templateType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Used by financial-report, real-estate, and invoice. ' +
            'For real-estate: the property address. For invoice: the billing address.',
        required: false,
        example: '42 Ocean Drive, Bondi Beach NSW 2026',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GeneratePdfDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'financial-report only: number of pages to generate.',
        required: false,
        example: 5,
        default: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], GeneratePdfDto.prototype, "pageCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'site-capture only: the public URL to screenshot and convert to PDF.',
        required: false,
        example: 'https://example.com',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], GeneratePdfDto.prototype, "url", void 0);
//# sourceMappingURL=generate-pdf.dto.js.map