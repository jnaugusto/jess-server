import { z } from 'zod';

export const updateDriverSchema = z.object({
  fullName: z.string().min(1).max(80).optional(),
  code: z.string().min(1).max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  status: z.enum(['active', 'pending', 'idle', 'offline', 'deactivated']).optional(),
  assignedVehicleId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type UpdateDriverDto = z.infer<typeof updateDriverSchema>;
