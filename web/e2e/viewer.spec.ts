import { expect, test } from '@playwright/test';
import { api, login, openOkr, tokenFor, SEED } from './helpers';

test.describe('Viewer (alfa_viewer_roma)', () => {
  test('consentito: legge gli OKR di organizzazione e della propria sede', async ({ page }) => {
    await login(page, 'alfa_viewer_roma');
    await page.goto('/o/alfa/okrs');
    await expect(page.getByRole('row', { name: /Alfa: OKR di organizzazione/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Alfa: OKR Roma/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Alfa: OKR Milano/ })).toHaveCount(0);
  });

  test('vietato: nessun pulsante di scrittura e il database rifiuta le scritture', async ({ page }) => {
    await login(page, 'alfa_viewer_roma');
    await page.goto('/o/alfa/okrs');
    await expect(page.getByRole('link', { name: 'Nuovo OKR' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Modifica' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Elimina' })).toHaveCount(0);

    await openOkr(page, SEED.okrRoma);
    await expect(page.getByRole('heading', { name: 'Alfa: OKR Roma' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check-in' })).toHaveCount(0);

    await page.goto('/o/alfa/okrs/new');
    await expect(page).toHaveURL(/\/o\/alfa\/okrs$/);

    const token = await tokenFor('alfa_viewer_roma');
    const checkIn = await api(token, 'POST', 'rpc/kr_check_in', { p_kr: SEED.krRoma, p_value: 99 });
    expect(checkIn.status).toBe(403);
    const insert = await api(token, 'POST', 'okrs', {
      organization_id: SEED.alfa,
      period_id: '30000000-0000-4000-8000-000000000001',
      owner_id: 'd0000000-0000-4000-8000-000000000006',
      title: 'non deve esistere',
      objective: 'x',
    });
    expect(insert.status).toBe(403);
    const update = await api(token, 'PATCH', `okrs?id=eq.${SEED.okrRoma}`, { title: 'hack' });
    expect(update.json).toEqual([]);
  });
});
