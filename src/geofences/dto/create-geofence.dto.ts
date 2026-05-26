import { z } from 'zod';

export const CreateGeofenceSchema = z.object({
  name:        z.string().min(1).max(100),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d4ff4f'),
  shape:       z.enum(['polygon', 'circle']),
  coordinates: z.array(z.tuple([z.number(), z.number()])).optional(),
  center:      z.tuple([z.number(), z.number()]).optional(),
  radiusM:     z.number().positive().optional(),
  trigger:     z.enum(['enter', 'exit', 'both']).default('both'),
  active:      z.boolean().default(true),
});

export type CreateGeofenceDto = z.infer<typeof CreateGeofenceSchema>;
export const UpdateGeofenceSchema = CreateGeofenceSchema.partial();
export type UpdateGeofenceDto = z.infer<typeof UpdateGeofenceSchema>;
