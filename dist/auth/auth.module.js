"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AuthModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const nestjs_better_auth_1 = require("@thallesp/nestjs-better-auth");
const database_module_1 = require("../database/database.module");
const database_service_1 = require("../database/database.service");
const auth_1 = require("./auth");
let AuthModule = AuthModule_1 = class AuthModule {
    static register() {
        return {
            module: AuthModule_1,
            imports: [
                nestjs_better_auth_1.AuthModule.forRootAsync({
                    isGlobal: true,
                    disableGlobalAuthGuard: false,
                    imports: [database_module_1.DatabaseModule],
                    inject: [database_service_1.DatabaseService],
                    useFactory: (databaseService) => {
                        return {
                            auth: (0, auth_1.createAuth)(databaseService.db),
                        };
                    },
                }),
            ],
            controllers: [],
            exports: [nestjs_better_auth_1.AuthModule],
        };
    }
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = AuthModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], AuthModule);
//# sourceMappingURL=auth.module.js.map