// Logica pura dell'export (nessun accesso a rete o DOM): testabile senza configurazione Supabase.
import type { ExportKr, ExportOkr } from './csv';

export const EXPORT_PAGE_SIZE = 1000;
export const EXPORT_MAX_ROWS = 10000;
const KR_CHUNK = 100; // id nella query string: 100 UUID restano ben sotto il limite di lunghezza dell'URL

export interface ExportProgress {
  loaded: number;
  total: number;
}

export interface ExportResult {
  okrs: ExportOkr[];
  krs: ExportKr[];
  /** Gli OKR del filtro sono più del limite: l'export contiene solo i primi `EXPORT_MAX_ROWS`. */
  truncated: boolean;
  total: number;
}

export interface ExportSource {
  page(offset: number, limit: number): Promise<{ rows: ExportOkr[]; total: number }>;
  krs(okrIds: string[]): Promise<ExportKr[]>;
}

export class ExportCancelled extends Error {
  constructor() {
    super('export_cancelled');
    this.name = 'ExportCancelled';
  }
}

/** Scarica tutte le pagine del filtro a blocchi, fino a `max` righe, con avanzamento e annullamento. */
export async function collectExport(
  source: ExportSource,
  opts: { onProgress?: (p: ExportProgress) => void; signal?: AbortSignal; max?: number; pageSize?: number } = {},
): Promise<ExportResult> {
  const max = opts.max ?? EXPORT_MAX_ROWS;
  const pageSize = opts.pageSize ?? EXPORT_PAGE_SIZE;
  const check = () => {
    if (opts.signal?.aborted) throw new ExportCancelled();
  };

  const okrs: ExportOkr[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    check();
    const limit = Math.min(pageSize, max - offset);
    if (limit <= 0) break;
    const page = await source.page(offset, limit);
    total = page.total;
    okrs.push(...page.rows);
    offset += page.rows.length;
    opts.onProgress?.({ loaded: Math.min(offset, Math.min(total, max)), total: Math.min(total, max) });
    if (page.rows.length < limit || offset >= total) break;
  }

  const krs: ExportKr[] = [];
  for (let i = 0; i < okrs.length; i += KR_CHUNK) {
    check();
    krs.push(...(await source.krs(okrs.slice(i, i + KR_CHUNK).map((o) => o.id))));
  }
  return { okrs, krs, truncated: total > max, total };
}

