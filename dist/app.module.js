"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const express_1 = require("@bull-board/express");
const nestjs_1 = require("@bull-board/nestjs");
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const chat_module_1 = require("./chat/chat.module");
const common_module_1 = require("./common/common.module");
const database_module_1 = require("./database/database.module");
const env_1 = require("./env");
const image_module_1 = require("./image/image.module");
const pdf_module_1 = require("./pdf/pdf.module");
const locations_module_1 = require("./locations/locations.module");
const powersync_module_1 = require("./powersync/powersync.module");
const tracks_module_1 = require("./tracks/tracks.module");
const template_module_1 = require("./template/template.module");
const users_module_1 = require("./users/users.module");
const analyze_site_module_1 = require("./analyze-site/analyze-site.module");
const drive_module_1 = require("./drive/drive.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
            bullmq_1.BullModule.forRoot({
                connection: {
                    host: env_1.env.REDIS_HOST,
                    port: env_1.env.REDIS_PORT,
                },
            }),
            nestjs_1.BullBoardModule.forRoot({
                route: '/queues',
                adapter: express_1.ExpressAdapter,
            }),
            common_module_1.CommonModule,
            image_module_1.ImageModule,
            pdf_module_1.PdfModule,
            template_module_1.TemplateModule,
            database_module_1.DatabaseModule,
            powersync_module_1.PowerSyncModule,
            locations_module_1.LocationsModule,
            tracks_module_1.TracksModule,
            auth_module_1.AuthModule.register(),
            users_module_1.UsersModule,
            analyze_site_module_1.AnalyzeSiteModule,
            drive_module_1.DriveModule,
            chat_module_1.ChatModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map