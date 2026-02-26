"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const better_auth_1 = require("better-auth");
exports.auth = (0, better_auth_1.betterAuth)({
    database: {
        dialect: "pg",
        type: "postgres",
    },
    emailAndPassword: {
        enabled: true,
    }
});
//# sourceMappingURL=test-auth.js.map