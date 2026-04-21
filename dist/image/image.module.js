"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageModule = void 0;
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const nestjs_1 = require("@bull-board/nestjs");
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const image_controller_1 = require("./image.controller");
const image_processor_1 = require("./image.processor");
const image_service_1 = require("./image.service");
let ImageModule = class ImageModule {
};
exports.ImageModule = ImageModule;
exports.ImageModule = ImageModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: 'image-processing',
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: 'image-processing',
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
        ],
        providers: [image_service_1.ImageService, image_processor_1.ImageProcessor],
        controllers: [image_controller_1.ImageController],
    })
], ImageModule);
//# sourceMappingURL=image.module.js.map