import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

/** Toglie dati personali e contenuti degli OKR prima dell'invio a Sentry. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0];
  }
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .filter((b) => b.category !== 'ui.input' && b.category !== 'console')
    .map((b) => {
      const { data, ...rest } = b;
      const url = typeof data?.url === 'string' ? data.url.split('?')[0] : undefined;
      return url ? { ...rest, data: { url } } : rest;
    });
  return event;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // senza DSN il monitoraggio è disattivato
  Sentry.init({
    dsn, // il DSN deve puntare al progetto in regione UE (ingest.de.sentry.io)
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}
