import { z } from 'zod';

export const inviteDriverSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  assignedVehicleId: z.string().optional(),
  role: z.literal('driver').default('driver'),
  mode: z.enum(['email', 'link']).default('email'),
  message: z.string().max(500).optional(),
  expiresIn: z.enum(['24h', '7d', '30d', 'never']).default('7d'),
});

export type InviteDriverDto = z.infer<typeof inviteDriverSchema>;
