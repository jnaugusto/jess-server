"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerSyncService = exports.PowerSyncTransaction = exports.PowerSyncOp = void 0;
const common_1 = require("@nestjs/common");
const jose = __importStar(require("jose"));
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../database/database.service");
const env_1 = require("../env");
class PowerSyncOp {
    table;
    op;
    row;
}
exports.PowerSyncOp = PowerSyncOp;
class PowerSyncTransaction {
    ops;
}
exports.PowerSyncTransaction = PowerSyncTransaction;
let PowerSyncService = class PowerSyncService {
    databaseService;
    constructor(databaseService) {
        this.databaseService = databaseService;
    }
    async generateToken(userId) {
        const privateKey = await jose.importPKCS8(Buffer.from(env_1.env.POWERSYNC_JWT_PRIVATE_KEY, 'base64').toString('utf-8'), 'RS256');
        const jwt = await new jose.SignJWT({})
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .setIssuedAt()
            .setIssuer('jess-server')
            .setAudience(env_1.env.POWERSYNC_URL)
            .setSubject(userId)
            .setExpirationTime('1h')
            .sign(privateKey);
        return jwt;
    }
    async handleUpload(userId, transaction) {
        const ops = transaction.ops;
        await this.databaseService.transaction(async (tx) => {
            for (const op of ops) {
                const { table, op: operation, row } = op;
                if (row.user_id && row.user_id !== userId) {
                    throw new Error('Unauthorized');
                }
                switch (operation) {
                    case 'PUT':
                        await this.handlePut(tx, table, row);
                        break;
                    case 'PATCH':
                        await this.handlePatch(tx, table, row);
                        break;
                    case 'DELETE':
                        await this.handleDelete(tx, table, row);
                        break;
                }
            }
        });
    }
    async handlePut(tx, table, row) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const query = (0, drizzle_orm_1.sql) `
      INSERT INTO ${drizzle_orm_1.sql.identifier(table)} (${drizzle_orm_1.sql.join(columns.map((c) => drizzle_orm_1.sql.identifier(c)), (0, drizzle_orm_1.sql) `, `)})
      VALUES (${drizzle_orm_1.sql.join(values.map((v) => (0, drizzle_orm_1.sql) `${v}`), (0, drizzle_orm_1.sql) `, `)})
      ON CONFLICT (id) DO UPDATE SET ${drizzle_orm_1.sql.join(columns.map((col) => (0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.identifier(col)} = EXCLUDED.${drizzle_orm_1.sql.identifier(col)}`), (0, drizzle_orm_1.sql) `, `)}
    `;
        await tx.execute(query);
    }
    async handlePatch(tx, table, row) {
        const { id, ...updates } = row;
        const columns = Object.keys(updates);
        const values = Object.values(updates);
        const query = (0, drizzle_orm_1.sql) `
      UPDATE ${drizzle_orm_1.sql.identifier(table)}
      SET ${drizzle_orm_1.sql.join(columns.map((col, i) => (0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.identifier(col)} = ${values[i]}`), (0, drizzle_orm_1.sql) `, `)}
      WHERE id = ${id}
    `;
        await tx.execute(query);
    }
    async handleDelete(tx, table, row) {
        const { id } = row;
        const query = (0, drizzle_orm_1.sql) `DELETE FROM ${drizzle_orm_1.sql.identifier(table)} WHERE id = ${id}`;
        await tx.execute(query);
    }
};
exports.PowerSyncService = PowerSyncService;
exports.PowerSyncService = PowerSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PowerSyncService);
//# sourceMappingURL=powersync.service.js.map