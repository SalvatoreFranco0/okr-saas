import { expect, test } from '@playwright/test';
import { api, login, tokenFor, SEED } from './helpers';

// Pagina Piattaforma (Fase 7b): riservata al super-admin con aal2. Le Edge Functions non girano nello stack
// effimero della CI (edge-runtime escluso): qui si prova che nessun ruolo normale veda o raggiunga la pagina e
// che le tabelle della piattaforma siano illeggibili dall'API. Le funzioni si provano su dev con i token di ruolo.
const USERS = ['alfa_admin', 'alfa_manager', 'alfa_tl_milano', 'alfa_viewer_roma'];

for (const user of USERS) {
  test(`${user}: nessuna voce Piattaforma e rotta non raggiungibile`, async ({ page }) => {
    await login(page, user);
    await expect(page.getByRole('link', { name: 'Piattaforma', exact: true })).toHaveCount(0);
    await page.goto('/platform');
    await expect(page).not.toHaveURL(/\/platform$/);
  });

  test(`${user}: tabelle di piattaforma illeggibili e funzioni di piattaforma non eseguibili con il suo token`, async () => {
    const token = await tokenFor(user);
    const audit = await api(token, 'GET', 'platform_audit_logs?select=id');
    expect(audit.status).toBe(200);
    expect(audit.json).toEqual([]);
    const sessions = await api(token, 'GET', 'support_sessions?select=id');
    expect(sessions.status).toBe(200);
    expect(sessions.json).toEqual([]);
    const admins = await api(token, 'GET', 'platform_admins?select=user_id');
    expect(admins.status).toBe(200);
    expect(admins.json).toEqual([]);
    const insert = await api(token, 'POST', 'support_sessions', {
      platform_admin_id: 'd0000000-0000-4000-8000-000000000001',
      organization_id: SEED.alfa,
      reason: 'tentativo non consentito',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(insert.status).toBe(403);
    const purge = await api(token, 'DELETE', `organizations?id=eq.${SEED.alfa}`);
    expect([403, 200]).toContain(purge.status);
    if (purge.status === 200) expect(purge.json).toEqual([]);
  });
}
