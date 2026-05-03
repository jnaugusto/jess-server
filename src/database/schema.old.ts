import { bigint, doublePrecision, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './schema';

export const locationsOld = pgTable('locations', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: text('device_id').notNull(),
  latitude: text('latitude').notNull(),
  longitude: text('longitude').notNull(),
  accuracy: text('accuracy').notNull(),
  speed: text('speed').notNull(),
  timestamp: text('timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tracksOld = pgTable('tracks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  startTime: bigint('start_time', { mode: 'number' }).notNull(),
  endTime: bigint('end_time', { mode: 'number' }).notNull(),
  distance: doublePrecision('distance').notNull(),
  avgSpeed: doublePrecision('avg_speed').notNull(),
});
