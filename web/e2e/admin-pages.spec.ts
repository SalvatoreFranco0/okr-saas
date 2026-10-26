import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

// Pagine di amministrazione (Fase 7). Le Edge Functions non girano nello stack effimero della CI
// (edge-runtime è escluso): qui si provano Periodi, Sedi, Team e la lettura della pagina Utenti.
// Inviti e modifica dei membri si provano su dev con i token di ruolo (vedi docs/decisioni.md).
const stamp = () => String(Date.now());

test.describe('Amministrazione: Admin', () => {
  test('vede tutte le voci e gestisce Periodi, Sedi e Team', async ({ page }) => {
    await login(page, 'alfa_admin');
    for (const name of ['Utenti', 'Periodi', 'Sedi', 'Team']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }

    // Periodi: crea, chiudi, riapri.
    const periodName = `E2E periodo ${stamp()}`;
    await page.getByRole('link', { name: 'Periodi', exact: true }).click();
    await page.locator('#p_name').fill(periodName);
    await page.locator('#p_start').fill('2030-01-01');
    await page.locator('#p_end').fill('2030-03-31');
    await page.getByRole('button', { name: 'Aggiungi' }).click();
    const prow = page.getByRole('row', { name: new RegExp(periodName) });
    await expect(prow).toContainText('Aperto');
    await prow.getByRole('button', { name: 'Chiudi' }).click();
    await expect(prow).toContainText('Chiuso');
    await prow.getByRole('button', { name: 'Riapri' }).click();
    await expect(prow).toContainText('Aperto');

    // Date incoerenti: errore di validazione, nessuna scrittura.
    await page.locator('#p_name').fill(`${periodName} bis`);
    await page.locator('#p_start').fill('2030-06-30');
    await page.locator('#p_end').fill('2030-06-01');
    await page.getByRole('button', { name: 'Aggiungi' }).click();
    await expect(page.getByText('La data di fine non può precedere quella di inizio')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`${periodName} bis`) })).toHaveCount(0);

    // Sedi: crea e disattiva.
    const locName = `E2E sede ${stamp()}`;
    await page.getByRole('link', { name: 'Sedi', exact: true }).click();
    await page.locator('#l_name').fill(locName);
    await page.getByRole('button', { name: 'Aggiungi' }).click();
    const lrow = page.getByRole('row', { name: new RegExp(locName) });
    await expect(lrow).toContainText('Attivo');
    await lrow.getByRole('button', { name: 'Disattiva' }).click();
    await expect(lrow).toContainText('Disattivato');

    // Team: crea, assegna un membro, lo rimuove.
    const teamName = `E2E team ${stamp()}`;
    await page.getByRole('link', { name: 'Team', exact: true }).click();
    await page.locator('#t_name').fill(teamName);
    await page.getByRole('button', { name: 'Aggiungi' }).click();
    const trow = page.getByRole('row', { name: new RegExp(teamName) });
    await expect(trow).toBeVisible();
    await trow.getByRole('button', { name: 'Membri' }).click();
    const panel = page.getByRole('region', { name: `Membri di ${teamName}` });
    await expect(panel.getByText('Nessun membro assegnato.')).toBeVisible();
    await expect(panel.locator('#t_add option')).not.toHaveCount(1);
    await panel.locator('#t_add').selectOption({ index: 1 });
    await panel.getByRole('button', { name: 'Aggiungi' }).click();
    await expect(panel.getByRole('listitem')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Rimuovi' }).click();
    await expect(panel.getByText('Nessun membro assegnato.')).toBeVisible();
  });

  test('Utenti: elenca i membri con ruolo e sedi (sola lettura, nessuna funzione chiamata)', async ({ page }) => {
    await login(page, 'alfa_admin');
    await page.getByRole('link', { name: 'Utenti', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Utenti', exact: true })).toBeVisible();
    const row = page.getByRole('row', { name: /alfa_manager@test\.local/ });
    await expect(row).toContainText('Manager OKR');
    await expect(page.getByRole('row', { name: /alfa_viewer_roma@test\.local/ })).toContainText('Viewer');
    // Nessun utente di un'altra organizzazione.
    await expect(page.getByText('beta_admin@test.local')).toHaveCount(0);
    // L'Admin non può disattivare né cambiare il proprio ruolo dalla propria riga.
    const mine = page.getByRole('row', { name: /alfa_admin@test\.local/ });
    await expect(mine.getByRole('button', { name: 'Disattiva' })).toBeDisabled();
  });
});

test.describe('Amministrazione: Manager', () => {
  test('vede Periodi e Team ma non Sedi e Utenti; le scritture vietate sono rifiutate', async ({ page }) => {
    await login(page, 'alfa_manager');
    await expect(page.getByRole('link', { name: 'Periodi', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sedi', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Utenti', exact: true })).toHaveCount(0);
    await page.goto('/o/alfa/locations');
    await expect(page).not.toHaveURL(/\/locations$/);
    await page.goto('/o/alfa/users');
    await expect(page).not.toHaveURL(/\/users$/);

    const token = await tokenFor('alfa_manager');
    const loc = await api(token, 'POST', 'locations', { organization_id: SEED.alfa, name: `E2E vietata ${stamp()}` });
    expect(loc.status).toBe(403);
    const period = await api(token, 'POST', 'periods', {
      organization_id: SEED.alfa, name: `E2E manager ${stamp()}`, start_date: '2031-01-01', end_date: '2031-03-31',
    });
    expect(period.status).toBe(201);
  });
});

for (const user of ['alfa_tl_milano', 'alfa_viewer_roma']) {
  test.describe(`Amministrazione: ${user}`, () => {
    test('nessuna voce di amministrazione e scritture rifiutate', async ({ page }) => {
      await login(page, user);
      for (const name of ['Utenti', 'Periodi', 'Sedi', 'Team']) {
        await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
      }
      await page.goto('/o/alfa/periods');
      await expect(page).not.toHaveURL(/\/periods$/);

      const token = await tokenFor(user);
      const period = await api(token, 'POST', 'periods', {
        organization_id: SEED.alfa, name: `E2E ${user} ${stamp()}`, start_date: '2031-01-01', end_date: '2031-03-31',
      });
      expect(period.status).toBe(403);
      const team = await api(token, 'POST', 'teams', { organization_id: SEED.alfa, name: `E2E ${user} ${stamp()}` });
      expect(team.status).toBe(403);
      // Le funzioni admin respingono chi non è Admin dell'organizzazione (se deployate: qui lo stack le esclude).
      const rpc = await api(token, 'POST', 'rpc/admin_apply_member', {
        p_org: SEED.alfa, p_user: 'd0000000-0000-4000-8000-000000000006', p_role: 'admin', p_is_active: true,
      });
      expect(rpc.status).toBe(403);
    });
  });
}
