import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
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

// Track and Location Points schema updated based on MERIDIAN_SPEC
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
