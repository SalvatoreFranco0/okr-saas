import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

/** Toglie dati personali e contenuti degli OKR prima dell'invio a Sentry. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const cleanUrl = (url: string) => url.split(/[?#]/)[0].replace(UUID, ':id');

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;
  delete event.contexts;
  // Gli errori di Postgres/PostgREST possono citare valori (email, titoli): si tiene solo il tipo.
  delete event.message;
  for (const ex of event.exception?.values ?? []) ex.value = ex.type ?? 'Error';
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = cleanUrl(event.request.url);
  }
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .filter((b) => b.category !== 'ui.input' && b.category !== 'console')
    .map((b) => {
      const { data, ...rest } = b;
      const url = typeof data?.url === 'string' ? cleanUrl(data.url) : undefined;
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
