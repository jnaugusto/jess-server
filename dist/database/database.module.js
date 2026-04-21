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
var DatabaseModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const env_1 = require("../env");
const database_service_1 = require("./database.service");
let DatabaseModule = DatabaseModule_1 = class DatabaseModule {
    databaseService;
    logger = new common_1.Logger(DatabaseModule_1.name);
    constructor(databaseService) {
        this.databaseService = databaseService;
    }
    async onModuleInit() {
        try {
            await this.databaseService.query('SELECT 1');
            this.logger.log('Database connected successfully');
        }
        catch (e) {
            this.logger.error(`Failed to connect to database: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async onModuleDestroy() {
        await this.databaseService.close();
    }
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = DatabaseModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: 'DATABASE_POOL',
                useFactory: () => {
                    return new pg_1.Pool({
                        connectionString: env_1.env.DATABASE_URL,
                    });
                },
            },
            database_service_1.DatabaseService,
        ],
        exports: [database_service_1.DatabaseService, 'DATABASE_POOL'],
    }),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], DatabaseModule);
//# sourceMappingURL=database.module.js.map