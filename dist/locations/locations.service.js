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
exports.LocationsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../database/database.service");
const schema_1 = require("../database/schema");
let LocationsService = class LocationsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getLocations(userId, dto) {
        return this.db.db
            .select()
            .from(schema_1.locations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.locations.userId, userId), (0, drizzle_orm_1.eq)(schema_1.locations.deviceId, dto.deviceId), (0, drizzle_orm_1.between)(schema_1.locations.timestamp, String(dto.from), String(dto.to))))
            .orderBy(schema_1.locations.timestamp);
    }
    async getDevices(userId) {
        const rows = await this.db.db
            .selectDistinct({ deviceId: schema_1.locations.deviceId })
            .from(schema_1.locations)
            .where((0, drizzle_orm_1.eq)(schema_1.locations.userId, userId));
        return rows.map((r) => r.deviceId);
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map