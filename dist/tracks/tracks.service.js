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
exports.TracksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../database/database.service");
const schema_1 = require("../database/schema");
let TracksService = class TracksService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getTracks(userId) {
        return this.db.db
            .select()
            .from(schema_1.tracks)
            .where((0, drizzle_orm_1.eq)(schema_1.tracks.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tracks.startTime));
    }
    async getTracksWithPoints(userId) {
        const allTracks = await this.db.db
            .select()
            .from(schema_1.tracks)
            .where((0, drizzle_orm_1.eq)(schema_1.tracks.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tracks.startTime));
        if (!allTracks.length)
            return [];
        const allPoints = await this.db.db
            .select({
            trackId: schema_1.locationPoints.trackId,
            latitude: schema_1.locationPoints.latitude,
            longitude: schema_1.locationPoints.longitude,
            timestamp: schema_1.locationPoints.timestamp,
        })
            .from(schema_1.locationPoints)
            .where((0, drizzle_orm_1.eq)(schema_1.locationPoints.userId, userId))
            .orderBy(schema_1.locationPoints.timestamp);
        const pointsByTrack = new Map();
        for (const point of allPoints) {
            if (!pointsByTrack.has(point.trackId))
                pointsByTrack.set(point.trackId, []);
            pointsByTrack.get(point.trackId).push({
                latitude: point.latitude,
                longitude: point.longitude,
                timestamp: point.timestamp,
            });
        }
        return allTracks.map(track => ({
            ...track,
            points: pointsByTrack.get(track.id) ?? [],
        }));
    }
    async getTrackWithPoints(userId, trackId) {
        const [track] = await this.db.db
            .select()
            .from(schema_1.tracks)
            .where((0, drizzle_orm_1.eq)(schema_1.tracks.id, trackId))
            .limit(1);
        if (!track || track.userId !== userId)
            throw new common_1.NotFoundException(`Track ${trackId} not found.`);
        const points = await this.db.db
            .select({
            latitude: schema_1.locationPoints.latitude,
            longitude: schema_1.locationPoints.longitude,
            timestamp: schema_1.locationPoints.timestamp,
            speed: schema_1.locationPoints.speed,
            altitude: schema_1.locationPoints.altitude,
        })
            .from(schema_1.locationPoints)
            .where((0, drizzle_orm_1.eq)(schema_1.locationPoints.trackId, trackId))
            .orderBy(schema_1.locationPoints.timestamp);
        return { ...track, points };
    }
    async getPoints(_userId, trackId) {
        return this.db.db
            .select()
            .from(schema_1.locationPoints)
            .where((0, drizzle_orm_1.eq)(schema_1.locationPoints.trackId, trackId))
            .orderBy(schema_1.locationPoints.timestamp);
    }
};
exports.TracksService = TracksService;
exports.TracksService = TracksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], TracksService);
//# sourceMappingURL=tracks.service.js.map