# OKR SaaS

Software di gestione OKR multi-organizzazione. Ogni cliente è un'`organization` isolata (RLS su Postgres), con sedi e team come sotto-unità.

- **Backend**: Supabase (Postgres + Auth + Edge Functions), regione UE (Francoforte)
- **Frontend**: React 19 + Vite + TypeScript + Tailwind v4, pubblicato su Vercel
- **CI/CD**: GitHub Actions

Piano completo: [`docs/Piano_Operativo_OKR_SaaS_Supabase.md`](docs/Piano_Operativo_OKR_SaaS_Supabase.md). Decisioni e stato: [`docs/decisioni.md`](docs/decisioni.md).

## Requisiti
- Node.js ≥ 20, git, GitHub CLI
- Supabase CLI via `npx supabase` (collegata solo al progetto `okr-saas-dev`)
- Docker **non** richiesto: i test del database girano solo in CI

## Comandi (cartella `web/`)
```
npm ci               # installa le dipendenze
npm run dev          # server di sviluppo
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm test             # Vitest
npm run build        # build di produzione
```

## Struttura
```
web/         frontend Vite
supabase/    config.toml, migrations/, functions/, tests/ (pgTAP), seed.sql
e2e/         test Playwright
scripts/     amministrazione (bootstrap super-admin)
docs/        piano, decisioni, documentazione di architettura
.github/     workflow CI, Dependabot, CodeQL
```

## Regole
Migrazioni SQL scritte a mano in `supabase/migrations/`; prod si modifica solo via GitHub Actions con approvazione manuale. Nessun segreto in git.
