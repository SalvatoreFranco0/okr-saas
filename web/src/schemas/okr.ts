import { z } from 'zod';

// Stessi vincoli del database (0003): titolo 1-300, obiettivo 1-2000, descrizione/note <= 5000,
// unità <= 30, peso >= 0, date coerenti (fine >= inizio).
const required = (max: number) => z.string().trim().min(1, 'validation.required').max(max, 'validation.tooLong');
const optional = (max: number) => z.string().trim().max(max, 'validation.tooLong').default('');
const num = z.coerce.number({ error: 'validation.number' });

export const OKR_STATUSES = ['in_pianificazione', 'attivo', 'in_pausa', 'completato', 'non_raggiunto'] as const;
export const KR_STATUSES = ['non_iniziato', 'in_progresso', 'on_track', 'at_risk', 'completato'] as const;
export const PRIORITIES = ['bassa', 'media', 'alta', 'critica'] as const;

export const keyResultSchema = z
  .object({
    title: required(300),
    description: optional(5000),
    unit: z.string().trim().max(30, 'validation.tooLong').default('%'),
    initial_metric: num,
    target_metric: num,
    current_metric: num.optional(),
    weight: num.pipe(z.number().min(0, 'validation.nonNegative')).default(100),
    status: z.enum(KR_STATUSES).default('non_iniziato'),
  })
  .refine((kr) => kr.initial_metric !== kr.target_metric, {
    path: ['target_metric'],
    message: 'validation.targetDiffers',
  });

const okrFields = z.object({
  title: required(300),
  objective: required(2000),
  description: optional(5000),
  period_id: z.string().min(1, 'validation.required'),
  /** '' = "Tutta l'organizzazione" (nessuna sede). */
  location_id: z.string().default(''),
  team_id: z.string().default(''),
  owner_id: z.string().min(1, 'validation.required'),
  priority: z.enum(PRIORITIES).default('media'),
  status: z.enum(OKR_STATUSES).default('in_pianificazione'),
  /** Tag separati da virgola. */
  tags: z.string().trim().max(500, 'validation.tooLong').default(''),
  start_date: z.string().default(''),
  end_date: z.string().default(''),
  notes: optional(5000),
});

const datesOk = (d: { start_date: string; end_date: string }) => !d.start_date || !d.end_date || d.end_date >= d.start_date;
const datesIssue = { path: ['end_date'], message: 'validation.dateOrder' };

export const okrEditSchema = okrFields.refine(datesOk, datesIssue);

export const okrCreateSchema = okrFields
  .extend({ keyResults: z.array(keyResultSchema).min(1, 'validation.required').max(20) })
  .refine(datesOk, datesIssue);

export type OkrEditInput = z.input<typeof okrEditSchema>;
export type OkrEditData = z.output<typeof okrEditSchema>;
export type OkrCreateInput = z.input<typeof okrCreateSchema>;
export type OkrCreateData = z.output<typeof okrCreateSchema>;
export type KeyResultInput = z.input<typeof keyResultSchema>;
export type KeyResultData = z.output<typeof keyResultSchema>;

export const checkInSchema = z.object({
  value: num,
  note: z.string().trim().max(2000, 'validation.tooLong').optional(),
});
export type CheckInInput = z.input<typeof checkInSchema>;

export const actionSchema = z.object({
  title: required(300),
  description: optional(5000),
  due_date: z.string().default(''),
  assignee_id: z.string().default(''),
});
export type ActionInput = z.input<typeof actionSchema>;
export type ActionData = z.output<typeof actionSchema>;

/** '' → null, per i campi opzionali che il database vuole nulli e non vuoti. */
export const orNull = (s: string | null | undefined): string | null => (s && s.trim() !== '' ? s : null);

/** "a, b ,,c" → ['a','b','c'] (senza duplicati, max 20 tag da 50 caratteri). */
export function parseTags(s: string): string[] {
  const seen = new Set<string>();
  for (const raw of s.split(',')) {
    const t = raw.trim().slice(0, 50);
    if (t) seen.add(t);
  }
  return [...seen].slice(0, 20);
}
