import { z } from 'zod';

// Stessi vincoli del database (0002): nome 1-100, indirizzo <= 300, descrizione team <= 2000, fine >= inizio.
const name = z.string().trim().min(1, 'validation.required').max(100, 'validation.tooLong');

export const periodSchema = z
  .object({
    name,
    start_date: z.string().min(1, 'validation.required'),
    end_date: z.string().min(1, 'validation.required'),
  })
  .refine((p) => p.end_date >= p.start_date, { path: ['end_date'], message: 'validation.dateOrder' });

export const locationSchema = z.object({
  name,
  address: z.string().trim().max(300, 'validation.tooLong').default(''),
});

export const teamSchema = z.object({
  name,
  description: z.string().trim().max(2000, 'validation.tooLong').default(''),
});

export type PeriodData = z.infer<typeof periodSchema>;
export type LocationData = z.infer<typeof locationSchema>;
export type TeamData = z.infer<typeof teamSchema>;

/** Primo messaggio di errore per campo (chiave i18n), per mostrarlo sotto l'input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
