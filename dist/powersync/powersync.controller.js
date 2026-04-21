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
exports.PowerSyncController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const powersync_service_1 = require("./powersync.service");
let PowerSyncController = class PowerSyncController {
    powerSyncService;
    constructor(powerSyncService) {
        this.powerSyncService = powerSyncService;
    }
    async getToken(session) {
        const userId = session.user.id;
        const token = await this.powerSyncService.generateToken(userId);
        return { token };
    }
    async upload(body, session) {
        const userId = session.user.id;
        await this.powerSyncService.handleUpload(userId, body);
        return { success: true };
    }
};
exports.PowerSyncController = PowerSyncController;
__decorate([
    (0, common_1.Get)('token'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a temporary PowerSync JWT' }),
    __param(0, (0, nestjs_better_auth_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PowerSyncController.prototype, "getToken", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload local changes from PowerSync' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, nestjs_better_auth_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [powersync_service_1.PowerSyncTransaction, Object]),
    __metadata("design:returntype", Promise)
], PowerSyncController.prototype, "upload", null);
exports.PowerSyncController = PowerSyncController = __decorate([
    (0, swagger_1.ApiTags)('powersync'),
    (0, common_1.UseGuards)(nestjs_better_auth_1.AuthGuard),
    (0, common_1.Controller)('powersync'),
    __metadata("design:paramtypes", [powersync_service_1.PowerSyncService])
], PowerSyncController);
//# sourceMappingURL=powersync.controller.js.map