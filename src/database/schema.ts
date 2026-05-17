import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// Types
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type Account = InferSelectModel<typeof accounts>;
export type NewAccount = InferInsertModel<typeof accounts>;

export type Verification = InferSelectModel<typeof verifications>;
export type NewVerification = InferInsertModel<typeof verifications>;

// Track and Location Points schema updated based on TARALES_SPEC
export const tracks = pgTable(
  'tracks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    status: text('status').notNull().default('completed'), // 'active' | 'paused' | 'completed'
    startTime: bigint('start_time', { mode: 'number' }).notNull(),
    endTime: bigint('end_time', { mode: 'number' }), // Nullable
    distance: doublePrecision('distance').notNull(),
    avgSpeed: doublePrecision('avg_speed').notNull(),
    maxSpeed: doublePrecision('max_speed').notNull().default(0),
    durationSec: bigint('duration_sec', { mode: 'number' }).notNull().default(0),
    deviceId: text('device_id'),
    startGeocode: text('start_geocode'),
    endGeocode: text('end_geocode'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userStartedIdx: index('idx_tracks_user_started').on(table.userId, table.startTime.desc()),
  }),
);

export const locationPoints = pgTable(
  'location_points',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracy: doublePrecision('accuracy').notNull(),
    altitude: doublePrecision('altitude'),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    trackTimeIdx: index('idx_points_track_time').on(table.trackId, table.timestamp),
    userTimeIdx: index('idx_points_user_time').on(table.userId, table.timestamp),
  }),
);

export type Track = InferSelectModel<typeof tracks>;
export type NewTrack = InferInsertModel<typeof tracks>;
export type LocationPoint = InferSelectModel<typeof locationPoints>;
export type NewLocationPoint = InferInsertModel<typeof locationPoints>;

// Zod Schemas
export const selectTrackSchema = createSelectSchema(tracks);
export const insertTrackSchema = createInsertSchema(tracks);
export const selectLocationPointSchema = createSelectSchema(locationPoints);
export const insertLocationPointSchema = createInsertSchema(locationPoints);

// Zod Schemas
export const selectUserSchema = createSelectSchema(users);
export const insertUserSchema = createInsertSchema(users);
export const selectSessionSchema = createSelectSchema(sessions);
export const insertSessionSchema = createInsertSchema(sessions);
export const selectAccountSchema = createSelectSchema(accounts);
export const insertAccountSchema = createInsertSchema(accounts);
export const selectVerificationSchema = createSelectSchema(verifications);
export const insertVerificationSchema = createInsertSchema(verifications);

// ─────────── Drivers ───────────
export const drivers = pgTable(
  'drivers',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    driverUserId: text('driver_user_id').references(() => users.id),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    code: text('code').notNull(),
    status: text('status').notNull().default('active'),
    assignedVehicleId: text('assigned_vehicle_id'),
    notes: text('notes'),
    lastActiveAt: timestamp('last_active_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_drivers_owner').on(table.ownerUserId),
    driverUserIdx: index('idx_drivers_driver_user').on(table.driverUserId),
    // A user can only belong to one fleet at a time.
    // Partial index: only enforced when driverUserId is not null, so
    // uninvited/manually-created driver rows (driverUserId = NULL) are
    // still allowed to coexist freely.
    driverUserUniq: uniqueIndex('uq_drivers_driver_user_id')
      .on(table.driverUserId)
      .where(sql`${table.driverUserId} is not null`),
  }),
);

// ─────────── Vehicles ───────────
export const vehicles = pgTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    code: text('code').notNull(),
    plate: text('plate').notNull(),
    make: text('make'),
    model: text('model'),
    year: integer('year'),
    type: text('type'),
    odometerKm: doublePrecision('odometer_km').notNull().default(0),
    nextServiceKm: doublePrecision('next_service_km'),
    status: text('status').notNull().default('available'),
    assignedDriverId: text('assigned_driver_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_vehicles_owner').on(table.ownerUserId),
  }),
);

// ─────────── Driver invites ───────────
export const driverInvites = pgTable(
  'driver_invites',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    email: text('email'),
    fullName: text('full_name').notNull(),
    code: text('code').notNull(),
    assignedVehicleId: text('assigned_vehicle_id'),
    role: text('role').notNull().default('driver'),
    message: text('message'),
    mode: text('mode').notNull().default('email'),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    acceptedByUserId: text('accepted_by_user_id').references(() => users.id),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_invites_owner').on(table.ownerUserId),
    tokenIdx: index('idx_invites_token').on(table.token),
  }),
);

// ─────────── User settings ───────────
export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  orgName: text('org_name'),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  units: text('units').notNull().default('metric'),
  dateFormat: text('date_format').notNull().default('D MMM YYYY'),
  weekStart: text('week_start').notNull().default('mon'),
  autoStart: boolean('auto_start').notNull().default(true),
  autoEnd: boolean('auto_end').notNull().default(true),
  highAccuracy: boolean('high_accuracy').notNull().default(false),
  sampleIntervalSec: integer('sample_interval_sec').notNull().default(10),
  speedAlertKmh: integer('speed_alert_kmh').notNull().default(80),
  privacyMode: text('privacy_mode').notNull().default('off'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types
export type Driver = InferSelectModel<typeof drivers>;
export type NewDriver = InferInsertModel<typeof drivers>;
export type Vehicle = InferSelectModel<typeof vehicles>;
export type NewVehicle = InferInsertModel<typeof vehicles>;
export type DriverInvite = InferSelectModel<typeof driverInvites>;
export type NewDriverInvite = InferInsertModel<typeof driverInvites>;
export type UserSettings = InferSelectModel<typeof userSettings>;
export type NewUserSettings = InferInsertModel<typeof userSettings>;

// Zod Schemas
export const selectDriverSchema = createSelectSchema(drivers);
export const insertDriverSchema = createInsertSchema(drivers);
export const selectVehicleSchema = createSelectSchema(vehicles);
export const insertVehicleSchema = createInsertSchema(vehicles);
export const selectDriverInviteSchema = createSelectSchema(driverInvites);
export const insertDriverInviteSchema = createInsertSchema(driverInvites);
export const selectUserSettingsSchema = createSelectSchema(userSettings);
export const insertUserSettingsSchema = createInsertSchema(userSettings);
