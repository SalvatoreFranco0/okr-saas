// Schemi Zod dell'input delle funzioni admin. Modulo PURO (unica dipendenza: zod, risolto
// dall'import map supabase/functions/deno.json in Deno e da un alias in web/vite.config.ts).
// Oggetti "strict": campi sconosciuti (es. un `actor` o `caller_role` nel body) = 400.
// Identita' e ruolo del chiamante non arrivano MAI dal body.

import { z } from 'zod';
import { ApiError } from './errors.ts';

// z.guid(): formato 8-4-4-4-12 esadecimale senza vincoli di versione/variante RFC, come il
// tipo uuid di Postgres (z.uuid() di Zod 4 rifiuterebbe uuid validi per il DB).
const id = z.guid();

export const ORG_ROLES = ['admin', 'manager_okr', 'team_lead', 'viewer'] as const;
export const roleSchema = z.enum(ORG_ROLES);
export type OrgRole = z.infer<typeof roleSchema>;

/** Nome opzionale: trim, max 100 (come profiles); stringa vuota = assente. */
const optionalName = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Sedi: uuid deduplicati, al massimo 100. */
const locationIds = z
  .array(id)
  .max(100)
  .transform((ids) => [...new Set(ids.map((x) => x.toLowerCase()))]);

/** Email normalizzata: trim + minuscolo, poi validata. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const inviteUserSchema = z.strictObject({
  organization_id: id,
  email: emailSchema,
  first_name: optionalName,
  last_name: optionalName,
  role: roleSchema,
  location_ids: locationIds.default([]),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const resendInviteSchema = z.strictObject({
  organization_id: id,
  user_id: id,
});
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;

export const updateMemberSchema = z
  .strictObject({
    organization_id: id,
    user_id: id,
    role: roleSchema.optional(),
    is_active: z.boolean().optional(),
    location_ids: locationIds.optional(),
  })
  .refine((v) => v.role !== undefined || v.is_active !== undefined || v.location_ids !== undefined, {
    message: 'Indica almeno uno tra role, is_active e location_ids.',
  });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const removeMemberSchema = z.strictObject({
  organization_id: id,
  user_id: id,
});
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

/**
 * Valida il body; in caso di errore 400 `invalid_input` con i soli percorsi dei campi errati
 * (mai i valori: potrebbero contenere l'email).
 */
export function parseInput<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const fields = [...new Set(r.error.issues.map((i) => i.path.join('.') || '(body)'))];
  throw new ApiError('invalid_input', { message: `Dati non validi: ${fields.join(', ')}.` });
}
