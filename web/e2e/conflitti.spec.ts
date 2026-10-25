import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

const PERIOD_Q4 = '30000000-0000-4000-8000-000000000001';
const ADMIN_ID = 'd0000000-0000-4000-8000-000000000002';

async function createOkr(token: string, title: string): Promise<string> {
  const r = await api(token, 'POST', 'rpc/okr_create_with_krs', {
    p_okr: { organization_id: SEED.alfa, period_id: PERIOD_Q4, owner_id: ADMIN_ID, title, objective: 'creato dal test E2E' },
    p_krs: [{ title: 'KR', target_metric: 100 }],
  });
  expect(r.status).toBe(200);
  return r.json as unknown as string;
}

test.describe('Conflitti e integrità (Admin)', () => {
  test('conflitto di versione: la modifica su dati cambiati altrove è respinta con "Ricarica"', async ({ page }) => {
    const token = await tokenFor('alfa_admin');
    const title = `E2E conflitto ${Date.now()}`;
    const id = await createOkr(token, title);

    await login(page, 'alfa_admin');
    await page.goto(`/o/alfa/okrs/${id}/edit`);
    await expect(page.locator('#title')).toHaveValue(title);

    // Un altro utente modifica l'OKR mentre il form è aperto: la version cambia.
    const other = await api(token, 'PATCH', `okrs?id=eq.${id}`, { notes: 'modificato altrove' });
    expect(other.status).toBe(200);

    await page.locator('#title').fill(`${title} (mia modifica)`);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('alert')).toContainText('già stato modificato');
    await expect(page.getByRole('button', { name: 'Ricarica' })).toBeVisible();

    // Il dato altrui non è stato sovrascritto.
    const after = await api(token, 'GET', `okrs?id=eq.${id}&select=title,notes`);
    expect(after.json).toEqual([{ title, notes: 'modificato altrove' }]);
  });

  test('allineamenti: il ciclo è rifiutato dal database', async () => {
    const token = await tokenFor('alfa_admin');
    const a = await createOkr(token, `E2E ciclo A ${Date.now()}`);
    const b = await createOkr(token, `E2E ciclo B ${Date.now()}`);
    const link = (parent: string, child: string) =>
      api(token, 'POST', 'okr_alignments', { organization_id: SEED.alfa, parent_okr_id: parent, child_okr_id: child });

    expect((await link(a, b)).status).toBe(201);
    const cycle = await link(b, a);
    expect(cycle.status).toBe(400);
    expect((cycle.json as { hint?: string }).hint).toBe('alignment_cycle');
  });
});
