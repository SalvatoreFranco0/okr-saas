import { z } from 'zod';

// Stessi vincoli del database (0003): titolo 1-300, obiettivo 1-2000, unità <= 30.
const num = z.coerce.number({ error: 'validation.number' });

export const keyResultSchema = z
  .object({
    title: z.string().trim().min(1, 'validation.required').max(300, 'validation.tooLong'),
    unit: z.string().trim().max(30, 'validation.tooLong'),
    initial_metric: num,
    target_metric: num,
  })
  .refine((kr) => kr.initial_metric !== kr.target_metric, {
    path: ['target_metric'],
    message: 'validation.targetDiffers',
  });

export const okrCreateSchema = z.object({
  title: z.string().trim().min(1, 'validation.required').max(300, 'validation.tooLong'),
  objective: z.string().trim().min(1, 'validation.required').max(2000, 'validation.tooLong'),
  period_id: z.string().min(1, 'validation.required'),
  priority: z.enum(['bassa', 'media', 'alta', 'critica']),
  keyResults: z.array(keyResultSchema).min(1).max(2),
});

export type OkrCreateInput = z.input<typeof okrCreateSchema>;
export type OkrCreateData = z.output<typeof okrCreateSchema>;

export const checkInSchema = z.object({
  value: num,
  note: z.string().trim().max(2000, 'validation.tooLong').optional(),
});
export type CheckInInput = z.input<typeof checkInSchema>;
