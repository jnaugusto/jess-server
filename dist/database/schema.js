"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertVerificationSchema = exports.selectVerificationSchema = exports.insertAccountSchema = exports.selectAccountSchema = exports.insertSessionSchema = exports.selectSessionSchema = exports.insertUserSchema = exports.selectUserSchema = exports.locationPoints = exports.tracks = exports.locations = exports.verifications = exports.accounts = exports.sessions = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_zod_1 = require("drizzle-zod");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    name: (0, pg_core_1.text)('name').notNull(),
    email: (0, pg_core_1.text)('email').notNull().unique(),
    emailVerified: (0, pg_core_1.boolean)('email_verified').notNull(),
    image: (0, pg_core_1.text)('image'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull(),
});
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    token: (0, pg_core_1.text)('token').notNull().unique(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull(),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    userId: (0, pg_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id),
});
exports.accounts = (0, pg_core_1.pgTable)('accounts', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    accountId: (0, pg_core_1.text)('account_id').notNull(),
    providerId: (0, pg_core_1.text)('provider_id').notNull(),
    userId: (0, pg_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id),
    accessToken: (0, pg_core_1.text)('access_token'),
    refreshToken: (0, pg_core_1.text)('refresh_token'),
    idToken: (0, pg_core_1.text)('id_token'),
    accessTokenExpiresAt: (0, pg_core_1.timestamp)('access_token_expires_at'),
    refreshTokenExpiresAt: (0, pg_core_1.timestamp)('refresh_token_expires_at'),
    scope: (0, pg_core_1.text)('scope'),
    password: (0, pg_core_1.text)('password'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull(),
});
exports.verifications = (0, pg_core_1.pgTable)('verifications', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    identifier: (0, pg_core_1.text)('identifier').notNull(),
    value: (0, pg_core_1.text)('value').notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at'),
});
exports.locations = (0, pg_core_1.pgTable)('locations', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    userId: (0, pg_core_1.text)('user_id')
        .notNull()
        .references(() => exports.users.id),
    deviceId: (0, pg_core_1.text)('device_id').notNull(),
    latitude: (0, pg_core_1.text)('latitude').notNull(),
    longitude: (0, pg_core_1.text)('longitude').notNull(),
    accuracy: (0, pg_core_1.text)('accuracy').notNull(),
    speed: (0, pg_core_1.text)('speed').notNull(),
    timestamp: (0, pg_core_1.text)('timestamp').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.tracks = (0, pg_core_1.pgTable)('tracks', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    userId: (0, pg_core_1.text)('user_id').notNull().references(() => exports.users.id),
    title: (0, pg_core_1.text)('title').notNull(),
    startTime: (0, pg_core_1.bigint)('start_time', { mode: 'number' }).notNull(),
    endTime: (0, pg_core_1.bigint)('end_time', { mode: 'number' }).notNull(),
    distance: (0, pg_core_1.doublePrecision)('distance').notNull(),
    avgSpeed: (0, pg_core_1.doublePrecision)('avg_speed').notNull(),
});
exports.locationPoints = (0, pg_core_1.pgTable)('location_points', {
    id: (0, pg_core_1.text)('id').primaryKey(),
    userId: (0, pg_core_1.text)('user_id').notNull(),
    trackId: (0, pg_core_1.text)('track_id').notNull().references(() => exports.tracks.id),
    latitude: (0, pg_core_1.doublePrecision)('latitude').notNull(),
    longitude: (0, pg_core_1.doublePrecision)('longitude').notNull(),
    accuracy: (0, pg_core_1.doublePrecision)('accuracy').notNull(),
    altitude: (0, pg_core_1.doublePrecision)('altitude'),
    speed: (0, pg_core_1.doublePrecision)('speed'),
    heading: (0, pg_core_1.doublePrecision)('heading'),
    timestamp: (0, pg_core_1.bigint)('timestamp', { mode: 'number' }).notNull(),
});
exports.selectUserSchema = (0, drizzle_zod_1.createSelectSchema)(exports.users);
exports.insertUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.users);
exports.selectSessionSchema = (0, drizzle_zod_1.createSelectSchema)(exports.sessions);
exports.insertSessionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.sessions);
exports.selectAccountSchema = (0, drizzle_zod_1.createSelectSchema)(exports.accounts);
exports.insertAccountSchema = (0, drizzle_zod_1.createInsertSchema)(exports.accounts);
exports.selectVerificationSchema = (0, drizzle_zod_1.createSelectSchema)(exports.verifications);
exports.insertVerificationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.verifications);
//# sourceMappingURL=schema.js.map