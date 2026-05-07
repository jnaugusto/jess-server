import { z } from 'zod';

export const createVehicleSchema = z.object({
  code: z.string().min(1).max(20),
  plate: z.string().min(1).max(20),
  make: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  type: z.enum(['van', 'mpv', 'sedan', 'suv', 'truck', 'motorcycle']).optional(),
  odometerKm: z.number().min(0).default(0),
  nextServiceKm: z.number().min(0).optional(),
  status: z.enum(['available', 'in_use', 'maintenance']).default('available'),
  assignedDriverId: z.string().optional(),
});

export type CreateVehicleDto = z.infer<typeof createVehicleSchema>;
