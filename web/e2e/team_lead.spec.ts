import { expect, test } from '@playwright/test';
import { api, login, openOkr, tokenFor, SEED } from './helpers';

test.describe('Team Lead (alfa_tl_milano)', () => {
  test('consentito: modifica e check-in sul proprio OKR di Milano', async ({ page }) => {
    await login(page, 'alfa_tl_milano');
    await page.goto('/o/alfa/okrs');
    const milano = page.getByRole('row', { name: /Alfa: OKR Milano/ });
    await expect(milano.getByRole('link', { name: 'Modifica' })).toBeVisible();
    await expect(milano.getByRole('button', { name: 'Elimina' })).toHaveCount(0);

    await openOkr(page, SEED.okrMilano);
    // KR Milano 1 (0..100, era 50) e KR Milano 2 (0..10, 10 = 100%): con 60 la media pesata è 80%.
    const card = page.getByText('KR Milano 1', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await card.locator('input[type=number]').fill('60');
    await card.getByRole('button', { name: 'Check-in' }).click();
    await expect(page.getByText('80.0%').first()).toBeVisible();
  });

  test('vietato: l\'OKR di Roma non è visibile e il check-in è rifiutato dal database', async ({ page }) => {
    await login(page, 'alfa_tl_milano');
    await page.goto('/o/alfa/okrs');
    await expect(page.getByRole('row', { name: /Alfa: OKR Roma/ })).toHaveCount(0);
    await openOkr(page, SEED.okrRoma);
    await expect(page.getByText('OKR non trovato')).toBeVisible();

    const token = await tokenFor('alfa_tl_milano');
    const checkIn = await api(token, 'POST', 'rpc/kr_check_in', { p_kr: SEED.krRoma, p_value: 99 });
    expect(checkIn.status).toBe(403);
    const del = await api(token, 'PATCH', `okrs?id=eq.${SEED.okrMilano}`, { deleted_at: new Date().toISOString() });
    expect(del.status).toBe(403);
  });
});
