# OKR SaaS — regole per Claude Code

Fonte di verità: `docs/Piano_Operativo_OKR_SaaS_Supabase.md`. Rileggila all'inizio di ogni sessione.
Lingua con l'utente: italiano. Stato corrente: vedi `docs/decisioni.md` (sezione "Fase corrente").

## Come si lavora
- Una fase del piano per sessione, nell'ordine. All'inizio della fase: Plan mode, task list, attendi approvazione.
- A fine fase: esegui i controlli "Fatto quando", mostra l'output reale, riassumi in 3 righe, aggiorna `docs/decisioni.md`.
- Dove il piano dice STOP-UTENTE: fermati e chiedi all'utente.
- Un commit per task logico (Conventional Commits). Branch `feat/...` + PR su `main` dopo la fase 1.
- Non fare commit, push o PR se l'utente non lo chiede.

## Vincoli non negoziabili
- Repo di lavoro: `C:\dev\okr-saas`. Mai lavorare dentro OneDrive. La cartella OneDrive del vecchio software è solo lettura.
- Prod si tocca SOLO via GitHub Actions con approvazione manuale. In locale la CLI Supabase è collegata SOLO a `okr-saas-dev`.
- Mai segreti in git, nei log o nel frontend. `service_role` solo nei secret delle Edge Functions e di GitHub. Mai chiedere all'utente di incollarlo in chat.
- Non leggere né stampare file `.env*`.
- Migrazioni SQL scritte a mano in `supabase/migrations/`, retrocompatibili (expand/contract). Mai modificare lo schema dall'interfaccia Supabase.
- Docker non è installato: niente `supabase start/db diff/db pull/db reset` in locale (solo in CI).
- Chiedi conferma prima di: eliminare dati, cambiare impostazioni di sicurezza, spendere denaro, qualunque cosa su prod.
- Sicurezza: RLS abilitata e forzata su ogni tabella, nessun privilegio ad `anon`, funzioni di supporto nello schema `private`, FK composte con `organization_id`.

## Verifica
- Non dichiarare "fatto" senza evidenza (test, lint, build, output dei comandi).
- Se un test fallisce non indebolire il test: correggi il codice o segnala il problema.
