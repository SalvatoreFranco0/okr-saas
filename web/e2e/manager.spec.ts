import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

test.describe('Manager OKR (alfa_manager)', () => {
  test('consentito: elimina un OKR (soft delete) e lo ripristina dall\'archivio', async ({ page }) => {
    await login(page, 'alfa_manager');
    await page.goto('/o/alfa/okrs');
    const row = page.getByRole('row', { name: /Alfa: OKR Roma/ });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Elimina' }).click();
    await page.getByRole('button', { name: 'Elimina' }).last().click();
    await expect(page.getByRole('row', { name: /Alfa: OKR Roma/ })).toHaveCount(0);

    await page.goto('/o/alfa/okrs/archive');
    const archived = page.getByRole('row', { name: /Alfa: OKR Roma/ });
    await expect(archived).toBeVisible();
    await archived.getByRole('button', { name: 'Ripristina' }).click();
    await expect(page.getByRole('row', { name: /Alfa: OKR Roma/ })).toHaveCount(0);

    await page.goto('/o/alfa/okrs');
    await expect(page.getByRole('row', { name: /Alfa: OKR Roma/ })).toBeVisible();
  });

  test('vietato: nessuna scrittura sulle membership, nemmeno via API', async () => {
    const token = await tokenFor('alfa_manager');
    const promote = await api(token, 'PATCH', 'memberships?user_id=eq.d0000000-0000-4000-8000-000000000003', { role: 'admin' });
    // Nessuna policy di UPDATE: nessuna riga toccata oppure rifiuto esplicito.
    expect([200, 403]).toContain(promote.status);
    if (promote.status === 200) expect(promote.json).toEqual([]);
    const insert = await api(token, 'POST', 'memberships', {
      organization_id: SEED.alfa,
      user_id: 'd0000000-0000-4000-8000-000000000007',
      role: 'viewer',
    });
    expect(insert.status).toBe(403);
  });
});
