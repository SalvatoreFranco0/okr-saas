import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

// Il nome inizia con "00" perché Playwright esegue i file in ordine alfabetico: i numeri attesi
// vengono dal seed (Alfa: 4 OKR visibili, media 50.0; Milano 2 con media 67.5; Roma 1), prima che
// gli altri file creino OKR. Il file crea solo un OKR temporaneo per il CSV e lo elimina a fine test.
// Seed: Q4 = 30..01, sede Milano = 10..01, sede Roma = 10..02.
const LOC_MILANO = '10000000-0000-4000-8000-000000000001';
const ADMIN_ID = 'd0000000-0000-4000-8000-000000000002';
const PERIOD_Q4 = '30000000-0000-4000-8000-000000000001';

test.describe('Dashboard', () => {
  test('Admin: numeri del seed e filtro per sede', async ({ page }) => {
    await login(page, 'alfa_admin');
    await expect(page.getByTestId('kpi-total')).toHaveText('4');
    await expect(page.getByTestId('kpi-avg')).toHaveText('50.0%');
    await expect(page.getByTestId('kpi-critical')).toHaveText('0');
    await expect(page.getByTestId('kpi-at-risk')).toHaveText('0');
    await expect(page.getByTestId('panel-latest').getByRole('link')).toHaveCount(4);

    await page.getByLabel('Sede', { exact: true }).selectOption({ value: LOC_MILANO });
    await expect(page.getByTestId('kpi-total')).toHaveText('2');
    await expect(page.getByTestId('kpi-avg')).toHaveText('67.5%');
    await expect(page.getByText('Alfa: OKR Roma')).toHaveCount(0);
    await expect(page.getByText('Con un filtro per sede o team')).toBeVisible();

    // Alternativa testuale del grafico: tabella con i conteggi per stato.
    await page.getByRole('button', { name: 'Mostra come tabella' }).click();
    const table = page.getByTestId('table-by-status');
    await expect(table.getByRole('row', { name: /Attivo\s+2/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Completato\s+0/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /Grafico a barre degli OKR per stato/ })).toBeVisible();
  });

  test('Admin: la dashboard coincide con il conteggio indipendente via API', async ({ page }) => {
    const token = await tokenFor('alfa_admin');
    const rows = await api(token, 'GET', `okrs?organization_id=eq.${SEED.alfa}&deleted_at=is.null&select=id`);
    const expected = (rows.json as unknown[]).length;
    await login(page, 'alfa_admin');
    await expect(page.getByTestId('kpi-total')).toHaveText(String(expected));
  });

  test('Viewer di Roma: solo i dati visibili al ruolo, nessun dato di Milano o di Beta', async ({ page }) => {
    await login(page, 'alfa_viewer_roma');
    await expect(page.getByTestId('kpi-total')).toHaveText('2');
    await expect(page.getByTestId('kpi-avg')).toHaveText('32.5%');
    const latest = page.getByTestId('panel-latest');
    await expect(latest.getByText('Alfa: OKR di organizzazione')).toBeVisible();
    await expect(latest.getByText('Alfa: OKR Roma')).toBeVisible();
    await expect(page.getByText('Alfa: OKR Milano')).toHaveCount(0);
    await expect(page.getByText('Beta: OKR Torino')).toHaveCount(0);

    // Stessa barriera via API: il filtro per un'altra sede non allarga la visibilità.
    const token = await tokenFor('alfa_viewer_roma');
    const milano = await api(token, 'POST', 'rpc/dashboard_stats', { p_org: SEED.alfa, p_location: LOC_MILANO });
    expect((milano.json as { total: number }).total).toBe(0);
    const beta = await api(token, 'POST', 'rpc/dashboard_stats', { p_org: 'e0000000-0000-4000-8000-000000000002' });
    expect((beta.json as { total: number }).total).toBe(0);
  });
});

test.describe('Export CSV', () => {
  test('Admin: file con BOM e separatore ";", formule neutralizzate, nessun dato di Beta', async ({ page }) => {
    const token = await tokenFor('alfa_admin');
    const created = await api(token, 'POST', 'rpc/okr_create_with_krs', {
      p_okr: { organization_id: SEED.alfa, period_id: PERIOD_Q4, owner_id: ADMIN_ID, title: '=E2E formula', objective: '@SUM(1;2)' },
      p_krs: [{ title: '+KR formula', target_metric: 100 }],
    });
    expect(created.status).toBe(200);
    const id = created.json as unknown as string;
    try {
      await login(page, 'alfa_admin');
      await page.goto('/o/alfa/okrs');
      await expect(page.getByText('Alfa: OKR di organizzazione')).toBeVisible();

      // Export di tutto il filtro attivo (nessun filtro): seed + OKR con formula.
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta CSV' }).click()]);
      expect(download.suggestedFilename()).toMatch(/^okr-\d{4}-\d{2}-\d{2}\.csv$/);
      const bytes = readFileSync((await download.path())!);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = bytes.toString('utf8').slice(1);
      const lines = text.split('\r\n');
      expect(lines[0]).toBe('Titolo;Obiettivo;Stato;Priorità;Avanzamento %;Periodo;Sede;Team;Data inizio;Data fine;Tag;N. Key Result;Key Result');
      expect(text).toContain('Alfa: OKR Milano');
      expect(text).toContain('Alfa: OKR periodo chiuso');
      expect(text).not.toContain('Beta: OKR Torino');
      expect(text).not.toContain('Alfa: OKR eliminato');
      // Le celle che iniziano con = + - @ sono prefissate con apice.
      expect(text).toContain("'=E2E formula");
      expect(text).toContain("'@SUM(1;2)");
      expect(text).toContain("'+KR formula");
      expect(lines.some((l) => /^[=+\-@]/.test(l))).toBe(false);
      await expect(page.getByText(/Esportati \d+ OKR/)).toBeVisible();
    } finally {
      await api(token, 'PATCH', `okrs?id=eq.${id}`, { deleted_at: new Date().toISOString() });
    }
  });
});
