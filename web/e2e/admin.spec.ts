import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

test.describe('Admin (alfa_admin)', () => {
  test('consentito: crea un OKR con un KR e vede l\'avanzamento calcolato dal database', async ({ page }) => {
    await login(page, 'alfa_admin');
    await page.goto('/o/alfa/okrs');
    await expect(page.getByText('Alfa: OKR di organizzazione')).toBeVisible();

    await page.getByRole('link', { name: 'Nuovo OKR' }).click();
    const title = `E2E admin ${Date.now()}`;
    await page.locator('#title').fill(title);
    await page.locator('#objective').fill('Obiettivo creato dal test E2E');
    await page.locator('#period_id').selectOption({ label: 'Q4 2026' });
    await page.locator('fieldset input').first().fill('KR di prova');
    await page.getByRole('button', { name: 'Crea' }).click();

    await expect(page).toHaveURL(/\/o\/alfa\/okrs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('0.0%')).toBeVisible();

    // Check-in: il KR va da 0 a 100, quindi 50 = 50% calcolato dal trigger.
    const card = page.getByText('KR di prova', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await card.locator('input[type=number]').fill('50');
    await card.getByRole('button', { name: 'Check-in' }).click();
    await expect(page.getByText('50.0%').first()).toBeVisible();
  });

  test('vietato: nessun dato di un altro tenant, né via API', async () => {
    const token = await tokenFor('alfa_admin');
    const read = await api(token, 'GET', `okrs?id=eq.${SEED.okrBeta}&select=id`);
    expect(read.status).toBe(200);
    expect(read.json).toEqual([]);
    const checkIn = await api(token, 'POST', 'rpc/kr_check_in', { p_kr: '50000000-0000-4000-8000-000000000006', p_value: 1 });
    expect(checkIn.status).toBe(403);
  });
});
