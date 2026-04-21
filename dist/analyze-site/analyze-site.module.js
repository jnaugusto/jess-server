"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzeSiteModule = void 0;
const common_1 = require("@nestjs/common");
const analyze_site_controller_1 = require("./analyze-site.controller");
const analyze_site_service_1 = require("./analyze-site.service");
let AnalyzeSiteModule = class AnalyzeSiteModule {
};
exports.AnalyzeSiteModule = AnalyzeSiteModule;
exports.AnalyzeSiteModule = AnalyzeSiteModule = __decorate([
    (0, common_1.Module)({
        controllers: [analyze_site_controller_1.AnalyzeSiteController],
        providers: [analyze_site_service_1.AnalyzeSiteService],
        exports: [analyze_site_service_1.AnalyzeSiteService],
    })
], AnalyzeSiteModule);
//# sourceMappingURL=analyze-site.module.js.map