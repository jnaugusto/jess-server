import { z } from 'zod';

export const updateVehicleSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  plate: z.string().min(1).max(20).optional(),
  make: z.string().max(50).nullable().optional(),
  model: z.string().max(50).nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  type: z.enum(['van', 'mpv', 'sedan', 'suv', 'truck', 'motorcycle']).nullable().optional(),
  odometerKm: z.number().min(0).optional(),
  nextServiceKm: z.number().min(0).nullable().optional(),
  status: z.enum(['available', 'in_use', 'maintenance']).optional(),
  assignedDriverId: z.string().nullable().optional(),
});

export type UpdateVehicleDto = z.infer<typeof updateVehicleSchema>;
