// Generazione CSV per Excel in italiano: separatore `;`, BOM UTF-8, CRLF.
// Le celle di testo che Excel potrebbe interpretare come formula vengono neutralizzate (CSV injection).

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '﻿';

export type CsvCell = string | number | null | undefined;

// Caratteri iniziali che Excel/LibreOffice trattano come formula o come inizio di comando.
const FORMULA_START = /^[=+\-@\t\r\n]/;

/** Prefissa con `'` il testo che inizia con `=`, `+`, `-`, `@`, tabulazione o ritorno a capo. */
export function neutralizeCell(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Celle numeriche: solo numeri finiti (il segno meno di un numero non è una formula). Il testo viene neutralizzato. */
export function cellToString(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  return neutralizeCell(value);
}

/** Racchiude tra virgolette se la cella contiene separatore, virgolette o a capo; raddoppia le virgolette. */
export function escapeCell(text: string): string {
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(cells: CsvCell[]): string {
  return cells.map((c) => escapeCell(cellToString(c))).join(CSV_SEPARATOR);
}

/** Intestazione + righe, con BOM iniziale e CRLF (anche in coda). */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return CSV_BOM + [toCsvRow(header), ...rows.map(toCsvRow)].join('\r\n') + '\r\n';
}

export interface ExportOkr {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: string;
  progress_percentage: number;
  period_id: string;
  location_id: string | null;
  team_id: string | null;
  start_date: string | null;
  end_date: string | null;
  tags: string[] | null;
}

export interface ExportKr {
  okr_id: string;
  title: string;
  unit: string | null;
  initial_metric: number;
  target_metric: number;
  current_metric: number;
  weight: number;
  status: string;
}

export interface ExportLabels {
  header: string[];
  status: (s: string) => string;
  krStatus: (s: string) => string;
  weight: string;
  priority: (p: string) => string;
  orgLevel: string;
  periods: Map<string, string>;
  locations: Map<string, string>;
  teams: Map<string, string>;
}

/** Un KR in forma leggibile: "Titolo (attuale/obiettivo unità, peso N, stato)". */
export function formatKr(kr: ExportKr, statusLabel: (s: string) => string, weightLabel: string): string {
  const unit = kr.unit ? ` ${kr.unit}` : '';
  return `${kr.title} (${kr.current_metric}/${kr.target_metric}${unit}, ${weightLabel} ${kr.weight}, ${statusLabel(kr.status)})`;
}

/**
 * Una riga per OKR; i Key Result sono raccolti in due colonne (numero e dettaglio separato da " | ").
 * Colonne: titolo, obiettivo, stato, priorità, avanzamento %, periodo, sede, team, inizio, fine, tag, n. KR, dettaglio KR.
 */
export function okrsToRows(okrs: ExportOkr[], krs: ExportKr[], labels: ExportLabels): CsvCell[][] {
  const byOkr = new Map<string, ExportKr[]>();
  for (const kr of krs) {
    const list = byOkr.get(kr.okr_id);
    if (list) list.push(kr);
    else byOkr.set(kr.okr_id, [kr]);
  }
  return okrs.map((o) => {
    const list = byOkr.get(o.id) ?? [];
    return [
      o.title,
      o.objective,
      labels.status(o.status),
      labels.priority(o.priority),
      o.progress_percentage,
      labels.periods.get(o.period_id) ?? '',
      o.location_id ? (labels.locations.get(o.location_id) ?? '') : labels.orgLevel,
      o.team_id ? (labels.teams.get(o.team_id) ?? '') : '',
      o.start_date,
      o.end_date,
      (o.tags ?? []).join(', '),
      list.length,
      list.map((k) => formatKr(k, labels.krStatus, labels.weight)).join(' | '),
    ];
  });
}
