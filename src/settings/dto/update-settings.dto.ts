import { z } from 'zod';

export const updateSettingsSchema = z.object({
  orgName: z.string().max(100).nullable().optional(),
  timezone: z.string().max(50).optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  dateFormat: z.string().max(20).optional(),
  weekStart: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).optional(),
  autoStart: z.boolean().optional(),
  autoEnd: z.boolean().optional(),
  highAccuracy: z.boolean().optional(),
  sampleIntervalSec: z.number().int().min(1).max(300).optional(),
  speedAlertKmh: z.number().int().min(0).max(300).optional(),
  privacyMode: z.enum(['off', 'low', 'high']).optional(),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
