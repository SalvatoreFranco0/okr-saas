import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { scrubEvent } from './sentry';

describe('scrubEvent', () => {
  it('rimuove utente, cookie, header, body e query string', () => {
    const event = {
      type: undefined,
      user: { id: 'u1', email: 'a@b.it' },
      request: {
        url: 'https://app.example/o/alfa/okrs?search=segreto#x',
        cookies: { sb: '1' },
        headers: { authorization: 'Bearer x' },
        data: { title: 'Contenuto OKR' },
        query_string: 'search=segreto',
      },
      breadcrumbs: [
        { category: 'ui.input', message: 'Contenuto OKR' },
        { category: 'console', message: 'log con dati' },
        { category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/okrs?title=eq.Segreto', method: 'GET' } },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.url).toBe('https://app.example/o/alfa/okrs');
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs?.[0].data).toEqual({ url: 'https://x.supabase.co/rest/v1/okrs' });
  });
});
