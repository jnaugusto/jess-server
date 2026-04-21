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
exports.TracksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const auth_guard_1 = require("../auth/guards/auth.guard");
const response_message_decorator_1 = require("../common/decorators/response-message.decorator");
const tracks_service_1 = require("./tracks.service");
let TracksController = class TracksController {
    tracksService;
    constructor(tracksService) {
        this.tracksService = tracksService;
    }
    getTracks(session) {
        return this.tracksService.getTracks(session.user.id);
    }
    getTracksWithPoints(session) {
        return this.tracksService.getTracksWithPoints(session.user.id);
    }
    getTrackWithPoints(session, trackId) {
        return this.tracksService.getTrackWithPoints(session.user.id, trackId);
    }
    getPoints(session, trackId) {
        return this.tracksService.getPoints(session.user.id, trackId);
    }
};
exports.TracksController = TracksController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all tracks for the current user' }),
    (0, response_message_decorator_1.ResponseMessage)('Tracks retrieved.'),
    __param(0, (0, nestjs_better_auth_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TracksController.prototype, "getTracks", null);
__decorate([
    (0, common_1.Get)('with-points'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all tracks with their location points in a single query' }),
    (0, response_message_decorator_1.ResponseMessage)('Tracks with points retrieved.'),
    __param(0, (0, nestjs_better_auth_1.Session)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TracksController.prototype, "getTracksWithPoints", null);
__decorate([
    (0, common_1.Get)(':trackId/detail'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a single track with all its points' }),
    (0, response_message_decorator_1.ResponseMessage)('Track retrieved.'),
    __param(0, (0, nestjs_better_auth_1.Session)()),
    __param(1, (0, common_1.Param)('trackId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TracksController.prototype, "getTrackWithPoints", null);
__decorate([
    (0, common_1.Get)(':trackId/points'),
    (0, swagger_1.ApiOperation)({ summary: 'Get location points for a track' }),
    (0, response_message_decorator_1.ResponseMessage)('Track points retrieved.'),
    __param(0, (0, nestjs_better_auth_1.Session)()),
    __param(1, (0, common_1.Param)('trackId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TracksController.prototype, "getPoints", null);
exports.TracksController = TracksController = __decorate([
    (0, swagger_1.ApiTags)('tracks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('tracks'),
    __metadata("design:paramtypes", [tracks_service_1.TracksService])
], TracksController);
//# sourceMappingURL=tracks.controller.js.map