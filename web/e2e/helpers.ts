import { expect, type Page } from '@playwright/test';

// UUID del seed (supabase/seed.sql): Alfa e..01; OKR 4..01 org, 4..02 Milano, 4..03 Roma; KR 5..02 Milano, 5..04 Roma.
export const SEED = {
  alfa: 'e0000000-0000-4000-8000-000000000001',
  okrOrg: '40000000-0000-4000-8000-000000000001',
  okrMilano: '40000000-0000-4000-8000-000000000002',
  okrRoma: '40000000-0000-4000-8000-000000000003',
  okrBeta: '40000000-0000-4000-8000-000000000006',
  krMilano: '50000000-0000-4000-8000-000000000002',
  krRoma: '50000000-0000-4000-8000-000000000004',
  krOrg: '50000000-0000-4000-8000-000000000001',
};

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? '';
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? '';
export const PASSWORD = process.env.E2E_PASSWORD ?? 'PasswordSoloPerTest-12345';

export async function login(page: Page, user: string) {
  await page.goto('/login');
  await page.locator('#email').fill(`${user}@test.local`);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page).toHaveURL(/\/o\/alfa\/dashboard/);
}

/** Access token del ruolo, per chiamare l'API direttamente (stessa barriera RLS dell'interfaccia). */
export async function tokenFor(user: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${user}@test.local`, password: PASSWORD }),
  });
  const j = (await r.json()) as { access_token?: string; msg?: string; error_code?: string };
  if (!j.access_token) throw new Error(`login API fallito per ${user}: ${r.status} ${j.error_code ?? ""} ${j.msg ?? ""}`);
  return j.access_token;
}

export async function api(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // risposta non JSON
  }
  return { status: r.status, json: json as Record<string, unknown> | Record<string, unknown>[] | null };
}

export const openOkr = (page: Page, id: string) => page.goto(`/o/alfa/okrs/${id}`);
