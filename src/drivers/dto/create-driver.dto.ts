import { z } from 'zod';

export const createDriverSchema = z.object({
  fullName: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  status: z.enum(['active', 'pending', 'idle', 'offline', 'deactivated']).default('active'),
  assignedVehicleId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type CreateDriverDto = z.infer<typeof createDriverSchema>;
