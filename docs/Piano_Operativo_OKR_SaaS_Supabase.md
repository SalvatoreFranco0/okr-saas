# Piano operativo: OKR SaaS su Supabase + Vercel

> **Destinatario: Claude Code.** Questo documento è la fonte di verità per ricostruire il software di gestione OKR come SaaS multi-organizzazione su Supabase (database, auth, Edge Functions) con frontend React + Vite su Vercel. Eseguilo per fasi, nell'ordine. Dove c'è scritto **STOP-UTENTE**, fermati e chiedi all'utente di completare il passaggio manuale (di solito nel browser), poi riprendi.
>
> Versione 1.2 · 25 ottobre 2026 · Lingua dell'utente: italiano
> **Modelli**: sessione predefinita su **Sonnet**; **Opus** solo per i task marcati `[OPUS]` (vedi 0.1).
> Le versioni 1.0 e 1.1 sono archiviate in `storico/` (`..._v1.0.md`, `..._v1.1.md`). Il registro delle modifiche è in fondo (sezione 16).

---

## 0. Regole di lavoro

1. **Prima di scrivere codice** crea una task list con tutte le fasi (sezione 15) e aggiornala man mano.
2. **Leggi il codice esistente come riferimento** (sola lettura, non modificarlo): `C:\Users\salva\OneDrive\Documenti\Claude\Projects\Software di gestione degli OKR dell'azienda\`
   - `frontend/src/` → pagine, componenti, store, stile da riusare
   - `backend/src/services/okr.service.ts` e `action.service.ts` → logica di calcolo avanzamento da replicare (leggi **entrambi**: serve capire se le Azioni influenzano l'avanzamento, vedi 5.5)
   - `backend/prisma/schema.prisma` → modello dati originale
   - `00. Documentazione/` → architettura e prompt funzionale originale (`PROMPT_CLAUDE_CODE.md`)
3. **Lavora nel nuovo repo**, mai dentro OneDrive: `C:\dev\okr-saas` (vedi fase 1). La cartella OneDrive resta archivio di riferimento.
4. **Segreti**: mai in git, mai nei log, mai nel frontend. Il `service_role` key vive solo nei secret delle Edge Functions e in GitHub Secrets. Nel frontend va solo la chiave pubblica (`anon` / publishable).
5. **Migrazioni scritte a mano** in `supabase/migrations/`. Docker non è installato sul PC: non usare in locale `supabase start`, `db diff`, `db pull`, `db reset` (richiedono Docker). Questi comandi girano solo in GitHub Actions.
6. **Mai modificare a mano il database dall'interfaccia Supabase**: ogni cambio schema è una migrazione versionata.
7. **Migrazioni retrocompatibili** (expand/contract): una migrazione non deve rompere la versione precedente del frontend. In produzione l'ordine di rilascio è comunque forzato (DB → funzioni → frontend, vedi 11.1), ma la retrocompatibilità resta la rete di sicurezza.
8. **Un commit per task logico**, messaggi in stile Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Lavora su branch `feat/...` e apri PR su `main`; non fare push diretto su `main` dopo la fase 1.
9. **Chiedi conferma all'utente prima di**: eliminare dati, cambiare impostazioni di sicurezza di Supabase, spendere denaro (cambio piano), toccare in qualunque modo **prod**.
10. **Credenziali dell'agente: solo dev.** In locale la CLI Supabase è collegata **solo** al progetto `okr-saas-dev` (`supabase link` verso prod è vietato in locale). Prod si modifica **esclusivamente** tramite GitHub Actions con approvazione manuale. Il token personale Supabase dà comunque accesso a entrambi i progetti: è un rischio residuo, mitigato da questa regola e dall'approvazione del deploy.
11. **Al termine di ogni fase** esegui i controlli del "Fatto quando" e riassumi in 3 righe cosa è stato fatto.
12. **Ambiguità**: dove il piano segna una decisione come *(da confermare)*, usa il default indicato, annotalo in `docs/decisioni.md` e segnalalo all'utente a fine fase.
13. **Modello per task**: ogni voce della task list riporta il tag `[OPUS]` o `[SONNET]` secondo la sezione 0.1. Lavora su Sonnet; passa a Opus solo per i task `[OPUS]` e torna a Sonnet al termine. Applica le regole di escalation di 0.1.

### 0.1 Assegnazione dei modelli (Opus / Sonnet)

**Principio**: Sonnet è il modello predefinito. Opus si usa solo dove un errore è sottile, costoso e difficile da vedere a posteriori. Il resto ha specifiche già dettagliate nel piano e un esito verificabile da test, lint, build o interfaccia.

**Un task è `[OPUS]` se vale almeno uno di questi criteri:**
1. tocca l'isolamento tra tenant o i permessi (RLS, funzioni `security definer`, schema `private`, FK composte, trigger di integrità);
2. usa il `service_role`, crea utenti o assegna privilegi;
3. tocca prod, backup, ripristino o dati reali;
4. richiede ragionamento su concorrenza, lock o trigger;
5. richiede di ricavare una semantica da codice legacy (il piano non la specifica);
6. è un controllo finale di sicurezza o di prestazioni.

**Altrimenti è `[SONNET]`**: specifica completa nel piano, nessun segreto, errore visibile subito. Un task `[SONNET + review OPUS]` lo scrive Sonnet, poi Opus rilegge il diff (solo il diff, in breve) prima della PR.

**Come si cambia modello**
- In Claude Code: sessione avviata con `/model sonnet`; per un task `[OPUS]` esegui `/model opus`, completa il task, poi torna a `/model sonnet`. In alternativa delega il task a un subagente con modello Opus e lascia la sessione principale su Sonnet.
- Raggruppa i task Opus della stessa fase (es. 5.3 → 5.7) in un'unica sessione Opus, invece di alternare modello a ogni passo.
- I criteri "Fatto quando" e i test sono identici qualunque sia il modello: il modello non attenua nessun controllo.

**Escalation (da Sonnet a Opus, chiedendo conferma all'utente)**
- un test pgTAP o E2E continua a fallire dopo 2 tentativi e la causa non è banale;
- serve decidere una semantica di permessi non specificata dal piano;
- un task `[SONNET]` si rivela toccare RLS, `service_role` o prod: fermati, segnalalo e passa a Opus.

**De-escalation**: se un task `[OPUS]` si riduce a lavoro meccanico (es. rigenerare tipi, rinominare), completalo in Sonnet.

**Tabella di assegnazione**

| Fase / punto | Modello | Motivo |
|---|---|---|
| 0 Prerequisiti, 1 Bootstrap repo e CI di base | `[SONNET]` | procedure elencate, nessuna decisione architetturale |
| 2 · 5.2 Hardening e tipi | `[SONNET]` | SQL fornito nel piano |
| 2 · 5.3 Identità e struttura | `[OPUS]` | FK composte, regola dell'ultimo Admin nel DB, trigger profilo che non deve mai fallire |
| 2 · 5.4 Dominio OKR | `[OPUS]` | FK composte, anti-ciclo con advisory lock, blocco periodi chiusi |
| 2 · 5.5 Funzioni e calcolo avanzamento | `[OPUS]` | `security definer`, trigger a livello di statement, lettura dei servizi legacy per la semantica |
| 2 · 5.6 RLS | `[OPUS]` | unica barriera di isolamento tra clienti |
| 2 · 5.7 Audit e tabelle predisposte | `[OPUS]` | trigger `security definer`, immutabilità |
| 2 · 5.8 Viste e RPC | `[SONNET + review OPUS]` | `security_invoker` già specificato; la review verifica che non esista alcun `definer` |
| 3 · 6.1 Seed | `[SONNET]` | dati di test descritti nel piano |
| 3 · 6.2 pgTAP, casi 1, 5, 6, 7, 8, 9, 12, 17 | `[OPUS]` | anon, privilegi, super-admin/aal2, iniezione cross-tenant, immutabilità, cicli, audit |
| 3 · 6.2 pgTAP, casi 2, 3, 4, 10, 11, 13, 14, 15, 16 | `[SONNET + review OPUS]` | casi descritti riga per riga; la review controlla che ogni riga della matrice 5.6 abbia un test |
| 3 · 6.3 Job CI pgTAP | `[SONNET]` | configurazione standard |
| 4 Fondamenta frontend e fetta verticale | `[SONNET]` | eccezioni con review Opus: punto 8 (blocco senza `aal2` del super-admin) e punto 10 (CSP) |
| 5 OKR, KR, Azioni, Allineamenti, E2E | `[SONNET]` | porting con specifiche chiare; i test E2E segnalano le divergenze UI/RLS |
| 6 Dashboard, report, export CSV | `[SONNET]` | logica di presentazione; la protezione da CSV injection è coperta da test Vitest |
| 7 · 10.1 Edge Functions 1, 2, 4, 6, 7, 8 e helper di rate limit | `[OPUS]` | `service_role`, privilegi, sessioni di supporto, export e purge di tenant |
| 7 · 10.1 Edge Functions 3, 5 | `[SONNET + review OPUS]` | operazioni privilegiate ma semplici |
| 7 · 10.2 Interfaccia admin | `[SONNET]` | UI; le autorizzazioni reali sono nel DB e nelle funzioni |
| 7 · 10.3 Script di bootstrap | `[SONNET + review OPUS]` | usa il `service_role` |
| 8 · 11.1 `deploy-prod.yml`, `backup-prod.yml`, rollback | `[OPUS]` | toccano prod e i backup |
| 8 · 11.1 `ci.yml`, `deploy-dev.yml`, `reset-dev.yml` | `[SONNET]` | solo dev e CI |
| 8 · 11.2 Guida ai passaggi manuali, 11.5 Smoke test | `[SONNET]` | istruzioni e verifiche elencate |
| 8 · 11.3 Importazione legacy, 11.4 Primo rilascio in prod | `[OPUS]` | dati reali, hash delle password, prod |
| 9 · punti 1 (controllo sicurezza), 2 (prestazioni), 7 (prova di ripristino) | `[OPUS]` | audit finale, analisi di `EXPLAIN` con RLS, ripristino di backup |
| 9 · punti 3, 4, 5, 6, 8, 9 | `[SONNET]` | accessibilità, bozze GDPR (revisione legale a cura dell'utente), inglese, documentazione |

---

## 1. Decisioni vincolanti

| Tema | Decisione |
|---|---|
| Interpretazione del requisito "più clienti in sedi separate" | Ogni **cliente** è un'`organization` (tenant) isolata; le **sedi** sono sotto-unità interne del cliente. *(da confermare con l'utente in fase 0)*. Poiché `organization_id` è su ogni tabella, un cliente enterprise potrà in futuro essere spostato su un progetto Supabase dedicato senza cambiare lo schema |
| Modello multi-cliente | Database condiviso, colonna `organization_id` su ogni tabella di dominio, isolamento con Row Level Security (RLS) |
| Sedi | Sotto-unità dell'organizzazione (`locations`). Un utente può appartenere a **zero, una o più sedi** (`membership_locations`). Team **indipendenti** dalle sedi (un team può coprire più sedi) |
| Gerarchia OKR | Un OKR ha `organization_id`, `location_id` **opzionale** e `team_id` opzionale. Senza sede = OKR "di organizzazione", visibile a tutti i membri |
| Periodi | Tabella `periods` per organizzazione (nome, date, `is_closed`); niente testo libero. Un periodo chiuso blocca le modifiche ai suoi OKR (tranne Admin/Manager) |
| Backend | Express **dismesso**. Supabase (Postgres + Auth + Edge Functions) in regione UE (Francoforte, `eu-central-1`) |
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + Zustand + React Hook Form + Zod + React Router (riuso del codice esistente). Axios rimosso |
| Contesto organizzazione | Nell'**URL** (`/o/:orgSlug/...`), non solo in `localStorage`: link condivisibili, nessun conflitto tra schede |
| i18n | Infrastruttura `i18next` / `react-i18next` e chiavi di traduzione fin dall'inizio. Italiano completo in V1; inglese completo come obiettivo *Should* (fase 9) |
| Autenticazione | Supabase Auth, email + password (minimo 12 caratteri). **Registrazione pubblica disattivata**. **TOTP (MFA) obbligatorio per il super-admin già in V1**; facoltativo per gli altri |
| Accesso del super-admin ai dati dei clienti | Il super-admin gestisce organizzazioni e utenti, ma accede ai **dati di dominio** di un tenant solo con una **sessione di supporto** attiva (motivazione obbligatoria, durata massima 4 ore, tutto registrato in `audit_logs`) |
| Ambienti | Due progetti Supabase cloud: `okr-saas-dev` e `okr-saas-prod`. Niente Docker locale |
| Hosting frontend | Vercel. Produzione pubblicata **dalla GitHub Action** dopo le migrazioni (auto-deploy di `main` disattivato); preview automatiche per ogni branch/PR |
| Repository | Nuovo repo GitHub privato `okr-saas`, cartella `C:\dev\okr-saas` |
| Test | pgTAP per RLS, integrità e calcolo avanzamento, in GitHub Actions; Vitest per utilità frontend; Playwright per pochi E2E sui quattro ruoli |
| Stati OKR e KR | **Manuali** in V1 (nessun cambio automatico di stato). *(da confermare)* |
| Automazioni (email, digest, notifiche) | In codice (Edge Functions), non in Make/n8n. **Non in V1** |
| Strumenti LCNC | Solo per versioning e deploy: GitHub, GitHub Actions, Vercel, Supabase Dashboard |
| Fatturazione | Non in V1. Il campo `organizations.plan` esiste ma vale sempre `internal` |
| Concorrenza | Controllo ottimistico con colonna `version` su OKR, KR e Azioni |
| Dati personali (GDPR) | Dati in UE; DPA e sub-responsabili documentati; export e cancellazione definitiva di un tenant previsti già in V1 (vedi 10.1 e 12) |

### Ambito V1 e priorità (MoSCoW)

Accesso solo del proprietario in produzione, ma schema multi-tenant completo.

| Priorità | Contenuto |
|---|---|
| **Must** | Schema multi-tenant con RLS e test; OKR, Key Result, Azioni, Allineamenti; check-in e storico avanzamento; periodi; ruoli (Admin, Manager OKR, Team Lead, Viewer); gestione utenti, sedi, team da interfaccia; dashboard base; export CSV; super-admin con MFA e sessioni di supporto; CI/CD, backup, monitoraggio; documentazione GDPR minima |
| **Should** | Inglese completo; pagina Piattaforma con creazione organizzazioni da UI; report avanzati (per sede, per team, trend, analisi allineamento); test E2E Playwright su tutti i ruoli |
| **Could** | Esportazione e purge di un tenant da UI (in V1 esistono come Edge Functions invocabili) |
| **Fuori (V2+)** | Registrazione self-service, pagamenti (Stripe), commenti in UI, audit log in UI, notifiche e digest email, SMTP e dominio personalizzati, SSO, app mobile/PWA, staging |

Le tabelle `comments` (vuota) e `audit_logs` (**già popolata** da trigger) vengono create in V1 per non dover migrare né perdere storia dopo.

### Obiettivi e criteri di successo V1 *(proposta, da validare con l'utente)*
- Zero fughe cross-tenant: la suite pgTAP di isolamento passa al 100% in CI a ogni PR.
- Tempo di risposta p95 della lista OKR sotto i 300 ms con 5.000 OKR in 20 organizzazioni (misura in fase 9).
- Almeno 1 organizzazione reale in produzione (la tua) per 30 giorni senza incidenti, poi 2-3 clienti pilota.
- Backup ripristinato con successo almeno una volta prima dei clienti pilota.

### Stima indicativa (da calibrare dopo la fase 3)

| Fase | Giorni di lavoro con supervisione |
|---|---|
| 0-1 | 1 |
| 2-3 | 5 |
| 4 | 3 |
| 5 | 4 |
| 6 | 3 |
| 7 | 4 |
| 8 | 2 |
| 9 | 3 |
| **Totale** | **circa 25 giorni (5 settimane)** |

---

## 2. Architettura target

```
Browser ──► Vercel (React SPA, build statica, header di sicurezza)
               │  supabase-js (chiave pubblica + JWT utente)
               ▼
          Supabase (UE)
           ├─ Auth            utenti, sessioni, inviti, TOTP
           ├─ Postgres + RLS  dati, permessi, calcolo avanzamento, storico, audit (trigger)
           │    ├─ schema public   tabelle, viste, RPC dell'app
           │    └─ schema private  funzioni di supporto alle policy (NON esposto via API)
           ├─ Views/RPC       dashboard e report (security_invoker)
           └─ Edge Functions  operazioni privilegiate (inviti, organizzazioni, supporto, export/purge)

GitHub ──► Actions: lint, typecheck, test (pgTAP + E2E su Supabase effimero),
           deploy dev (al merge), deploy prod (con approvazione): DB → funzioni → frontend,
           backup schedulato
```

Principi:
- **Il frontend non è mai la barriera di sicurezza.** Tutti i permessi sono applicati dalle policy RLS e dai trigger. Il frontend nasconde i pulsanti solo per usabilità.
- **Difesa in profondità**: oltre a RLS, `anon` non ha alcun privilegio sulle tabelle, le funzioni di supporto stanno in uno schema non esposto, le colonne di tenant sono immutabili, le scritture sui permessi passano solo da Edge Functions.

---

## 3. Fase 0 — Prerequisiti e passaggi manuali (STOP-UTENTE) `[SONNET]`

L'utente ha già un account GitHub, Supabase e Vercel. Chiedi di completare e confermare quanto segue, poi verifica tu stesso dove possibile.

**A. Sul PC**
1. Installati: Node.js ≥ 20, git, GitHub CLI (`gh`). Verifica con `node -v`, `git --version`, `gh --version`.
2. `gh auth login` completato (verifica con `gh auth status`).
3. Login alle CLI (si usa `npx`, nessuna installazione globale richiesta): `npx supabase login` e `npx vercel login`.
4. Creare la cartella `C:\dev` se non esiste.

**B. Nel browser: Supabase**
1. Creare il progetto **`okr-saas-dev`**: regione *Central EU (Frankfurt)*, password database robusta (salvarla in un password manager).
2. Creare il progetto **`okr-saas-prod`**: stessa regione, password diversa.
3. Per ciascuno annotare: **Project ref** (Settings → General), **URL** del progetto, **chiave pubblica** (anon / publishable) da Settings → API. La `service_role` **non** va incollata in chat.
4. Creare un **Access Token** personale dedicato alla CI (Account → Access Tokens), diverso da quello usato per il login locale. Va solo in GitHub Secrets.
5. **Piano e backup (blocco esplicito)**: i progetti del piano gratuito vengono messi in pausa dopo un periodo di inattività e non hanno backup point-in-time. **Prima di caricare dati reali in prod il progetto `okr-saas-prod` deve essere passato a Pro** (decisione di spesa dell'utente). Fino ad allora in prod ci sono solo dati di prova.

**C. Chiedi all'utente di darti** (in chat, sono valori non segreti): `DEV_PROJECT_REF`, `PROD_PROJECT_REF`, `DEV_URL`, `PROD_URL`, `DEV_ANON_KEY`, `PROD_ANON_KEY`. Le password del database e i token vengono inseriti dall'utente direttamente come GitHub Secrets (fase 8), non passano da te.

**D. Domande da porre all'utente** (le risposte guidano il resto del piano):
1. **Dati esistenti**: il vecchio sistema (Express/Prisma) contiene dati reali da portare? Se sì, la fase 8 include l'importazione (11.3). Se no, si parte da zero.
2. **Interpretazione del requisito**: conferma che "più clienti in sedi separate" significa tenant isolati con sedi interne (vedi sezione 1).
3. Conferma dei punti *(da confermare)* della sezione 1 e della matrice permessi (5.6).

**Fatto quando**: tutti i valori sono disponibili, `npx supabase projects list` mostra i due progetti, le risposte alle domande D sono annotate in `docs/decisioni.md`.

---

## 4. Fase 1 — Bootstrap del repository e CI di base `[SONNET]`

1. `gh repo create okr-saas --private --clone` dentro `C:\dev`.
2. Struttura:

```
okr-saas/
├─ web/                      # frontend Vite (portato da legacy frontend/)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/            # SQL numerati
│  ├─ functions/             # Edge Functions (Deno/TS)
│  ├─ tests/                 # pgTAP (*.test.sql)
│  └─ seed.sql               # dati di test (solo dev/CI)
├─ e2e/                      # test Playwright
├─ scripts/                  # amministrazione (bootstrap super-admin, import legacy)
├─ docs/                     # questo piano + documentazione portata dalla cartella OneDrive
├─ .github/
│  ├─ workflows/
│  └─ dependabot.yml
├─ .gitignore  .editorconfig  README.md
```

3. `npx supabase init` (genera `supabase/config.toml`). In `config.toml` imposta `[auth] enable_signup = false`, `minimum_password_length = 12`, `site_url` e `additional_redirect_urls` come da 11.2, e per ogni funzione `verify_jwt = true`. **Attenzione**: la sezione `[auth]` di `config.toml` vale per il Supabase locale/CI; per i progetti cloud va applicata con `npx supabase config push` (verifica prima con il diff che mostra) oppure impostata a mano e verificata (11.2).
4. Copia in `docs/` i documenti utili dalla cartella OneDrive (architettura, prompt originale, guida di deploy) e **questo** piano. Crea `docs/decisioni.md` (registro delle decisioni prese e dei default applicati). Riscrivi `README.md`: descrizione, requisiti, comandi, struttura. Il README originale è un residuo del template Prisma/Next.js e non va riportato.
5. `.gitignore`: `node_modules`, `dist`, `.env*` (tranne `.env.example`), `supabase/.temp`, `supabase/.branches`, `*.log`.
6. Copia `frontend/` in `web/`, escludendo `dist/` e `node_modules/`. Non portare `backend/`, `app/`, `lib/`, `prisma/`, `next.config.ts` della radice.
7. **CI di base** (`ci.yml`, vedi 11.1): lint, typecheck, test, build del frontend. Il job pgTAP si aggiunge in fase 3. Aggiungi `dependabot.yml` (npm e github-actions, settimanale) e il workflow CodeQL.
8. Primo commit e push su `main`. Da qui in avanti solo branch + PR. Nota all'utente: la **protezione del branch `main`** si attiva in 11.2 (richiede il check `ci`, che deve esistere e aver girato una volta; fallo subito dopo il primo run, non aspettare la fase 8).

**Fatto quando**: il repo esiste su GitHub con la struttura sopra, `cd web && npm ci && npm run build` funziona (anche se il codice è ancora legato all'API vecchia) e `ci.yml` gira verde su una PR di prova.

---

## 5. Fase 2 — Schema database (migrazioni) `[MISTO: vedi 0.1]`

Tutte le migrazioni sono in `supabase/migrations/` con nome `YYYYMMDDHHMMSS_descrizione.sql`. Durante lo sviluppo puoi applicarle a **dev** con `npx supabase link --project-ref <DEV_REF>` e `npx supabase db push`. Dopo ogni push genera i tipi: `npx supabase gen types typescript --linked > web/src/types/database.ts`. Il workflow `deploy-dev.yml` (11.1) riallinea dev a ogni merge su `main`; se dev diverge (migrazioni di branch abbandonati), si usa il workflow manuale `reset-dev.yml`, che ricrea dev da zero con migrazioni + seed.

### 5.1 Convenzioni `[riferimento]`
- Nomi in `snake_case`, chiavi `uuid` con `gen_random_uuid()`, timestamp `timestamptz`.
- Ogni tabella di dominio ha `organization_id uuid not null references organizations(id) on delete cascade` e un indice che inizia con `organization_id`.
- **Integrità tra tenant**: ogni tabella padre ha `unique (id, organization_id)`, e le tabelle figlie usano **chiavi esterne composte** `(parent_id, organization_id)`. Così è impossibile, anche con una policy sbagliata, collegare un record all'oggetto di un'altra organizzazione.
- **Comportamento `ON DELETE` delle FK composte**: usa `NO ACTION` (default) o `RESTRICT`, **mai** `SET NULL` sull'intera chiave (azzererebbe anche `organization_id`, che è NOT NULL). Sedi, team e periodi non si eliminano: si disattivano (`is_active = false`, nessuna policy DELETE). L'eliminazione fisica avviene solo con la purge di un intero tenant (10.1), che cancella dall'alto con `on delete cascade` su `organizations`.
- **Appartenenza degli utenti**: ogni colonna che indica un utente dell'organizzazione (`owner_id`, `assignee_id`, `team_members.user_id`, `membership_locations.user_id`) è una FK composta `(organization_id, user_id) → memberships(organization_id, user_id)`. Le membership non si cancellano (si disattivano), quindi la FK non si rompe e l'utente non può essere "non membro" dell'organizzazione del record.
- **Immutabilità**: trigger `forbid_tenant_change()` su tutte le tabelle di dominio: `id`, `organization_id`, `created_at`, `created_by` non sono modificabili da nessun ruolo (eccetto il service role nelle procedure di purge).
- **Autore**: trigger `set_actor_columns()` che valorizza `created_by` e `updated_by` da `auth.uid()`; il client non li può impostare.
- **Concorrenza ottimistica**: `okrs`, `key_results`, `actions` hanno `version int not null default 1`; trigger `bump_version()` la incrementa a ogni update. Il client aggiorna con `.eq('version', v)`; se non aggiorna nessuna riga mostra "il record è stato modificato da qualcun altro".
- Trigger `set_updated_at()` su tutte le tabelle con `updated_at`.
- RLS **abilitata e forzata** su ogni tabella in `public`: nessuna tabella senza policy.
- **Schema `private`**: tutte le funzioni di supporto a policy e trigger vivono in `private`, che **non** è esposto da PostgREST (verifica che non sia in "Exposed schemas"). Alle funzioni `security definer` si applica sempre `set search_path = ''` e nomi completamente qualificati. Concedi `usage` su `private` solo ai ruoli che servono (`authenticated`).

### 5.2 Migrazione 0001 — hardening e tipi `[SONNET]`

Hardening di base (prima di creare tabelle):

```sql
-- anon non deve avere alcun privilegio per default su nulla in public
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- niente introspezione GraphQL per ruoli non autenticati
drop extension if exists pg_graphql;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create extension if not exists pg_trgm;
```

Dopo aver creato le tabelle, nelle migrazioni stesse: `revoke all on all tables in schema public from anon;` e concessioni esplicite a `authenticated` solo dove serve (le policy fanno il resto).

```sql
create type public.org_role as enum ('admin','manager_okr','team_lead','viewer');
create type public.okr_status as enum ('in_pianificazione','attivo','in_pausa','completato','non_raggiunto');
create type public.priority as enum ('bassa','media','alta','critica');
create type public.kr_status as enum ('non_iniziato','in_progresso','on_track','at_risk','completato');
```

### 5.3 Migrazione 0002 — identità e struttura `[OPUS]`

- `organizations(id, name, slug unique, plan text default 'internal', is_active bool default true, created_at, updated_at)`
- `platform_admins(user_id uuid pk references auth.users on delete cascade)` — nessun accesso dal client (RLS attiva, nessuna policy; si legge solo tramite `private.is_platform_admin()`).
- `support_sessions(id, platform_admin_id references platform_admins, organization_id, reason text not null check (length(reason) >= 10), started_at, expires_at check (expires_at <= started_at + interval '4 hours'), ended_at null)` — scritta solo dalla Edge Function `admin-start-support-session`; nessuna policy per i client.
- `profiles(id uuid pk references auth.users on delete cascade, first_name, last_name, email text, locale text default 'it' check (locale in ('it','en')), created_at, updated_at)` — creata da un trigger `security definer` su `auth.users` (insert) che copia anche `email` e il `locale` dai metadati dell'invito; un secondo trigger tiene `email` allineato a `auth.users` (update). Il trigger di creazione deve essere **minimale e non fallire mai** (un errore bloccherebbe creazione utenti e inviti): ha un test dedicato.
- `periods(id, organization_id, name, start_date, end_date, is_closed bool default false, created_at, updated_at, unique (organization_id, name), unique (id, organization_id), check (end_date >= start_date))`
- `locations(id, organization_id, name, address null, is_active bool default true, created_at, updated_at, unique (organization_id, name), unique (id, organization_id))`
- `teams(id, organization_id, name, description, is_active bool default true, ..., unique (organization_id, name), unique (id, organization_id))`
- `memberships(id, organization_id, user_id references auth.users, role org_role not null default 'viewer', is_active bool default true, created_at, updated_at, unique (organization_id, user_id))`
- `membership_locations(organization_id, user_id, location_id, pk (user_id, location_id))` con FK composta `(organization_id, user_id) → memberships(organization_id, user_id)` e `(location_id, organization_id) → locations(id, organization_id)`. Un membro **senza sedi** vede solo gli OKR di organizzazione (senza sede). Admin e Manager OKR non sono limitati dalle sedi.
- `team_members(team_id, user_id, organization_id, pk (team_id, user_id))` con FK composta verso `teams` e verso `memberships(organization_id, user_id)`.
- **Trigger anti-orfano**: `before update or delete` su `memberships` rifiuta l'operazione se lascerebbe l'organizzazione senza almeno un Admin attivo (regola dell'ultimo Admin applicata **nel database**, non solo nelle Edge Functions).

### 5.4 Migrazione 0003 — dominio OKR `[OPUS]`

Replica lo schema Prisma originale con questi adattamenti:

- `okrs(id, organization_id, period_id, location_id null, team_id null, owner_id, title not null, description, objective not null, start_date date, end_date date, status okr_status default 'in_pianificazione', progress_percentage numeric(5,1) default 0 check 0–100, priority priority default 'media', tags text[] default '{}', notes, version int default 1, created_by, updated_by, deleted_at timestamptz null, created_at, updated_at, check (end_date >= start_date))` con FK composte per `period_id`, `location_id`, `team_id`, `(organization_id, owner_id) → memberships`, e `unique (id, organization_id)`.
- `key_results(id, organization_id, okr_id, title, description, initial_metric numeric default 0, target_metric numeric not null, current_metric numeric default 0, unit text default '%', weight numeric default 100 check (weight >= 0), status kr_status default 'non_iniziato', last_updated_at, version, created_at, updated_at)` — FK composta `(okr_id, organization_id) → okrs`, `on delete cascade`.
- `actions(id, organization_id, key_result_id, title, description, due_date, assignee_id null, is_completed bool default false, version, ...)` — FK composta verso `key_results`; `assignee_id` come FK composta verso `memberships`.
- `okr_alignments(id, organization_id, parent_okr_id, child_okr_id, unique (parent_okr_id, child_okr_id), check (parent_okr_id <> child_okr_id))` — FK composte verso `okrs`. Trigger che impedisce **cicli** (un OKR non può diventare discendente di sé stesso); il trigger prende prima un `pg_advisory_xact_lock(hashtext(organization_id::text))` per evitare che due transazioni concorrenti (A→B e B→A) creino un ciclo insieme.
- **Storico avanzamento** (nuovo): `okr_progress_history(id, organization_id, okr_id, progress_percentage, recorded_on date, recorded_at, unique (okr_id, recorded_on))` — una riga per OKR per giorno, aggiornata (upsert) dalla funzione di ricalcolo. Serve ai grafici di trend; non è recuperabile a posteriori.
- **Check-in dei KR** (nuovo): `key_result_updates(id, organization_id, key_result_id, old_value, new_value, note null, user_id, created_at)` — scritta dal trigger quando cambia `current_metric` (la `note` arriva dalla RPC `kr_check_in`, vedi 5.5).
- **Blocco periodi chiusi**: trigger `before insert or update` su `okrs`, `key_results`, `actions`, `okr_alignments` che rifiuta le modifiche se il periodo dell'OKR è `is_closed`, tranne per Admin/Manager OKR.
- Indici: `okrs(organization_id, status) where deleted_at is null`, `okrs(organization_id, location_id)`, `okrs(organization_id, team_id)`, `okrs(organization_id, period_id)`, `okrs(owner_id)`, GIN su `okrs.tags`, GIN trigram (`gin_trgm_ops`) su `lower(title || ' ' || coalesce(description,''))` per la ricerca, `key_results(okr_id)`, `actions(key_result_id)`, `memberships(user_id, organization_id) where is_active`, `membership_locations(user_id)`, `team_members(user_id)`.

### 5.5 Migrazione 0004 — funzioni di supporto e calcolo avanzamento `[OPUS]`

**Funzioni in `private`** (tutte `stable`, `security definer`, `set search_path = ''`, `execute` concesso solo ad `authenticated`):

```sql
-- Mappa dei permessi dell'utente corrente, valutata UNA volta per statement:
-- { "<org_uuid>": { "role":"admin", "locations":["<uuid>",...], "teams":["<uuid>",...], "support":false }, ... }
-- Include le organizzazioni con membership attiva e quelle con sessione di supporto attiva
-- del super-admin (role = 'admin', support = true).
create or replace function private.my_access() returns jsonb ...;

create or replace function private.is_platform_admin() returns boolean ...;
-- true solo se l'utente è in platform_admins E il JWT ha aal2 (TOTP verificato)

-- Funzioni pure (immutable, nessun accesso a tabelle) che leggono la mappa:
create or replace function private.role_of(access jsonb, org uuid) returns public.org_role ...;
create or replace function private.has_location(access jsonb, org uuid, loc uuid) returns boolean ...;
create or replace function private.has_team(access jsonb, org uuid, tm uuid) returns boolean ...;
```

**Come si usano nelle policy** (la `select` forza un InitPlan: la mappa si calcola una volta per query, non una volta per riga):

```sql
private.role_of((select private.my_access()), organization_id)
```

Questo sostituisce il vecchio schema `member_role(org)` chiamato per riga. In fase 9 si misura l'effetto con molte organizzazioni.

- `private.can_edit_okr(org uuid, okr uuid) returns boolean` (`security definer`): usata dalle policy di KR, Azioni e Allineamenti; applica la regola di modifica dell'OKR padre (5.6) leggendo la riga dell'OKR bypassando la RLS.
- **Calcolo avanzamento** — prima leggi `okr.service.ts` **e** `action.service.ts` e **replica il comportamento esistente**; documenta in `docs/` ogni differenza. Se il servizio legacy fa influire le Azioni sull'avanzamento del KR, replicalo e aggiungilo ai test; in assenza di indicazioni, **le Azioni non influenzano l'avanzamento** (*da confermare*). Specifica attesa:
  - Percentuale di un KR: `(current − initial) / (target − initial) × 100`, limitata a 0–100. Se `target = initial`: 100 se `current >= target`, altrimenti 0. Funziona anche per metriche decrescenti (target < initial).
  - Avanzamento OKR: media pesata `Σ(pct × weight) / Σ(weight)`; 0 se non ci sono KR o la somma dei pesi è 0; arrotondato a 1 decimale.
  - Funzione `private.recalc_okr_progress(p_okr uuid)`: prende un lock di riga con `select … from public.okrs where id = p_okr for update` (serializza ricalcoli concorrenti sullo stesso OKR), calcola, aggiorna `okrs.progress_percentage` e fa l'upsert in `okr_progress_history` per la data odierna.
  - Trigger su `key_results`: **a livello di statement** con tabelle di transizione (`REFERENCING NEW/OLD TABLE`), quindi tre trigger separati per insert, update e delete (PostgreSQL non permette tabelle di transizione su trigger multi-evento). Ricalcolano gli OKR distinti coinvolti; se cambia `okr_id` ricalcolano sia il vecchio sia il nuovo. Gli update massivi costano così un ricalcolo per OKR e non per riga.
  - Un trigger `before update` su `key_results` imposta `last_updated_at` quando cambia `current_metric` e scrive la riga in `key_result_updates` (con `note` letta da `current_setting('app.kr_note', true)`).
  - RPC `public.kr_check_in(p_kr uuid, p_value numeric, p_note text default null)` (`security invoker`, quindi rispetta la RLS): imposta `set_config('app.kr_note', p_note, true)` e aggiorna `current_metric`. È il percorso usato dalla UI per i check-in.
  - **Blocco di `progress_percentage`**: un trigger `before update` su `okrs` rifiuta qualunque modifica di `progress_percentage` quando `pg_trigger_depth() < 2` (cioè quando l'update non nasce da un altro trigger, come quello di ricalcolo).
  - Lo spostamento di un KR da un OKR a un altro è consentito solo se l'utente può modificare entrambi.
- `revoke execute` di `recalc_okr_progress` da tutti i ruoli client: si usa solo dai trigger.

### 5.6 Migrazione 0005 — RLS `[OPUS]`

Abilita RLS (`enable` + `force`) su tutte le tabelle e crea le policy per `authenticated`. Nessuna policy per `anon`. **Il super-admin non ha una corsia preferenziale sui dati di dominio**: vi accede solo tramite una sessione di supporto, che la funzione `my_access()` rappresenta come ruolo `admin` sull'organizzazione. Il super-admin ha invece policy proprie su `organizations`, `platform_admins`/`support_sessions` (lettura) e sulle tabelle della sola piattaforma.

**Matrice permessi** (decisioni *da confermare* marcate con ★):

| Risorsa | Admin | Manager OKR | Team Lead | Viewer |
|---|---|---|---|---|
| `organizations` | lettura della propria | lettura | lettura | lettura |
| `periods` | CRUD (no delete: chiusura/riapertura) | CRUD | lettura | lettura |
| `locations` | CRUD (disattivazione) | lettura | lettura | lettura |
| `teams`, `team_members` | CRUD | CRUD | lettura | lettura |
| `memberships`, `membership_locations` | **solo lettura**; ogni scrittura passa dalle Edge Functions | solo lettura | lettura propria | lettura propria |
| `profiles` | lettura dei membri delle proprie organizzazioni; modifica solo la propria | idem | idem | idem |
| OKR: lettura | tutti, anche eliminati | tutti, anche eliminati | non eliminati, senza sede **o** in una delle proprie sedi | idem Team Lead |
| OKR: creazione | tutti | tutti | ★ solo con `owner_id = io`, `location_id` in una delle proprie sedi, team nullo o di cui sono membro, periodo aperto | no |
| OKR: modifica | tutti | tutti | ★ solo OKR propri o del proprio team, con sede tra le proprie, periodo aperto. Gli OKR **senza sede** sono modificabili solo da Admin/Manager | no |
| OKR: eliminazione (soft, `deleted_at`) | sì | sì | **no** | no |
| Key Result e Azioni | come l'OKR padre (lettura/scrittura ereditate) | idem | solo se può modificare l'OKR padre | sola lettura |
| Allineamenti | CRUD | CRUD | solo tra OKR che può modificare entrambi | lettura |
| `okr_progress_history`, `key_result_updates` | lettura come l'OKR padre; **scrittura solo da trigger** | idem | idem | idem |
| `support_sessions`, `platform_admins` | nessun accesso client | idem | idem | idem |

Regole trasversali:
- Tutte le policy richiedono membership **attiva** nell'organizzazione del record (o sessione di supporto attiva).
- Nessuna policy `DELETE` sugli OKR: l'eliminazione è un `UPDATE` di `deleted_at`. Un trigger `before update` rifiuta modifiche a `deleted_at` se il ruolo non è `admin` o `manager_okr` (o sessione di supporto).
- Le policy `INSERT`/`UPDATE` hanno sempre `WITH CHECK` oltre a `USING`, così non si può "uscire" dalle regole modificando la riga.
- **Nessuna policy di scrittura su `memberships` e `membership_locations`** per nessun ruolo client: la modifica di ruoli, sedi e attivazioni passa solo da Edge Functions (che usano il service role dopo aver verificato il chiamante). Questo rende impossibile l'auto-promozione e preserva la regola dell'ultimo Admin.
- `team_members` resta scrivibile da Admin e Manager via RLS: non è un dato di privilegio e l'integrità è garantita dalle FK composte.
- Policy di esempio da usare come modello:

```sql
create policy okrs_select on public.okrs for select to authenticated using (
  private.role_of((select private.my_access()), organization_id) in ('admin','manager_okr')
  or (
    private.role_of((select private.my_access()), organization_id) is not null
    and deleted_at is null
    and (location_id is null
         or private.has_location((select private.my_access()), organization_id, location_id))
  )
);
```

- Le **viste** di report si creano con `with (security_invoker = true)` così ereditano la RLS (richiede PostgreSQL ≥ 15, disponibile su Supabase). Le RPC di report sono `security invoker`, **mai** `security definer`: il parametro `p_org` non è mai un'autorizzazione.

### 5.7 Migrazione 0006 — tabelle predisposte e audit `[OPUS]`

- `comments(id, organization_id, okr_id, user_id, content, created_at, updated_at)`: RLS con le stesse regole di visibilità dell'OKR, scrittura per tutti i ruoli (anche Viewer, come da specifica originale). Non usata dalla UI in V1.
- `audit_logs(id, organization_id, user_id, okr_id null, entity text, entity_id uuid, action text, details jsonb, created_at)`: **popolata in V1** dalla funzione trigger `private.audit_row_change()` (`security definer`) installata su `okrs`, `key_results`, `actions`, `okr_alignments`, `memberships`, `membership_locations`, `locations`, `teams`, `periods`. In `details` salva i campi cambiati (non i dati personali non necessari). Le azioni dei super-admin in sessione di supporto sono marcate. RLS: lettura solo Admin/Manager; **nessuna** policy di insert/update/delete per i client (immutabile). La UI di consultazione è V2.

### 5.8 Dashboard e report `[SONNET + review OPUS]`

Crea come viste/RPC (tutte `security_invoker`):
- `v_okr_summary` — conteggi per stato, priorità, periodo, sede, team per organizzazione.
- `v_okr_at_risk` — OKR attivi con KR `at_risk` o con scadenza entro 14 giorni e avanzamento basso.
- `v_org_members` — membri con ruolo, sedi, stato, email e nome (per la tabella utenti della UI).
- RPC `public.dashboard_stats(p_org uuid, p_period uuid default null)` che restituisce in una sola chiamata: totali, % medio di avanzamento, OKR per stato, ultimi 5 aggiornati, OKR critici.
- Il trend si legge da `okr_progress_history`.
- Per il CSV non serve una funzione: l'export si genera nel frontend (vedi fase 6).

**Fatto quando (fase 2)**: tutte le migrazioni sono applicate su dev senza errori, `gen types` produce `database.ts`, `npx supabase db lint --linked` non segnala errori, e una query su `pg_proc` conferma che nello schema `public` nessuna funzione `security definer` è eseguibile da `anon`.

---

## 6. Fase 3 — Dati di test e test automatici (RLS) `[MISTO: vedi 0.1]`

### 6.1 `supabase/seed.sql` (solo dev e CI, **mai in prod**) `[SONNET]`
- Organizzazione **Alfa** con sedi *Milano* e *Roma*, 3 team (alcuni con membri di entrambe le sedi), un periodo aperto e uno chiuso.
- Organizzazione **Beta** (serve esclusivamente a verificare l'isolamento).
- Utenti di prova (inseriti in `auth.users` con password nota solo per i test): `superadmin`, `alfa_admin`, `alfa_manager`, `alfa_tl_milano`, `alfa_tl_senza_sede`, `alfa_viewer_roma`, `beta_admin`.
- OKR di esempio: uno senza sede, uno a Milano, uno a Roma, uno eliminato (soft), uno in periodo chiuso, con KR e azioni; un OKR in Beta.
- Per i test di performance, uno script separato (`supabase/tests/perf/generate.sql`, non nel seed) genera 5.000 OKR in 20 organizzazioni.

### 6.2 Test pgTAP (`supabase/tests/*.test.sql`) `[OPUS]` casi 1, 5-9, 12, 17 · `[SONNET + review OPUS]` gli altri
Usa gli helper della libreria `supabase_test_helpers` (creazione utenti, `authenticate_as`) invece di scriverne di nuovi; i claim simulati devono includere `aal` (`aal2` per il super-admin). Casi **obbligatori**:

1. `anon` non legge né scrive nulla in nessuna tabella; nessuna funzione di `public` è eseguibile da `anon`; lo schema `private` non è raggiungibile come RPC.
2. `alfa_viewer_roma`: vede OKR senza sede + Roma, **non** vede Milano né eliminati; non può inserire, modificare, eliminare.
3. `alfa_tl_milano`: può creare un OKR proprio a Milano; **non** può crearlo a Roma né con `owner_id` altrui né senza sede; può modificare un OKR del proprio team; non può modificare OKR altrui fuori dal proprio team né OKR senza sede; **non** può impostare `deleted_at`. `alfa_tl_senza_sede` vede solo gli OKR senza sede e non può crearne.
4. `alfa_manager`: vede tutte le sedi e gli eliminati, può fare soft delete; non vede nulla di Beta.
5. `alfa_admin`: gestisce sedi/team/periodi di Alfa; **non** legge né scrive dati di Beta; non può creare organizzazioni; **non può scrivere direttamente** su `memberships` e `membership_locations` (né promuoversi), né rimuovere l'ultimo Admin attivo (trigger).
6. `superadmin` (aal2): **non** legge i dati di dominio di Alfa o Beta senza sessione di supporto; con sessione attiva li legge e le scritture finiscono in `audit_logs`; a sessione scaduta perde l'accesso; senza `aal2` non ha alcun accesso privilegiato.
7. Un membro con `is_active = false` non ha accesso a niente.
8. **Iniezione cross-tenant**: inserire un KR con `okr_id` di Beta e `organization_id` di Alfa deve fallire (FK composta); idem per allineamenti, azioni, team_members, `owner_id` e `assignee_id` di un utente non membro dell'organizzazione.
9. **Immutabilità**: nessun ruolo può cambiare `organization_id`, `created_by`, `created_at` di un record; `created_by`/`updated_by` impostati dal client vengono sovrascritti.
10. Ereditarietà: le policy di KR e azioni seguono quelle dell'OKR padre per tutti i ruoli.
11. Calcolo avanzamento: nessun KR → 0; un KR al 50% → 50; pesi diversi; valore sopra il target → limitato a 100; `target = initial`; metrica decrescente; spostamento di un KR da un OKR a un altro ricalcola entrambi; modifica diretta di `progress_percentage` rifiutata; `okr_progress_history` ha una riga per giorno; `key_result_updates` registra il check-in con la nota; update massivo di molti KR produce un solo ricalcolo per OKR.
12. Allineamenti: il ciclo A→B→A viene rifiutato (anche in due transazioni concorrenti, se testabile).
13. Periodi chiusi: un Team Lead non può modificare un OKR in un periodo chiuso; un Manager sì.
14. Concorrenza ottimistica: un update con `version` obsoleta non modifica righe.
15. Sedi, team e periodi non si possono eliminare (nessuna policy DELETE; FK in `RESTRICT`).
16. Il trigger di creazione profilo non fallisce con metadati mancanti.
17. Audit: le modifiche ai dati e ai permessi generano righe in `audit_logs`; un client non può inserire, modificare o cancellare righe di audit.

### 6.3 CI `[SONNET]`
Aggiungi a `ci.yml` il job pgTAP (Supabase effimero in Docker sul runner: `supabase start`, `supabase db reset`, `supabase test db`, `supabase stop`) e il controllo che `web/src/types/database.ts` sia aggiornato (rigenera con `--local` e `git diff --exit-code`).

**Fatto quando**: `npx supabase test db` passa al 100% **in CI** e il job fallisce se si rimuove anche una sola policy (verifica con una prova deliberata, poi ripristina).

---

## 7. Fase 4 — Frontend: fondamenta e fetta verticale `[SONNET]`

Lavora in `web/`. Obiettivo: arrivare presto a un risultato visibile e verificabile.

1. Dipendenze: aggiungi `@supabase/supabase-js`, `i18next`, `react-i18next`, `vitest`, `@sentry/react`; rimuovi `axios`.
2. `web/.env.example` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Il file `.env.local` (non committato) punta a **dev**.
3. `src/lib/supabase.ts`: client tipizzato con `Database` da `types/database.ts`; sostituisce `lib/axios.ts`.
4. `authStore` (Zustand): sessione Supabase (`onAuthStateChange`), profilo, elenco organizzazioni a cui appartiene, ruolo effettivo nell'organizzazione corrente, flag `isPlatformAdmin`. **L'organizzazione attiva viene dall'URL** (`/o/:orgSlug/...`); l'ultima usata si può ricordare in `localStorage` (con try/catch) solo per il reindirizzamento iniziale. L'id dell'organizzazione viene passato esplicitamente a ogni query (`.eq('organization_id', orgId)`) oltre alla RLS.
5. **TanStack Query**: ogni `queryKey` include `orgId`; al cambio organizzazione e al logout si fa `queryClient.clear()` (nessun dato di un'organizzazione deve restare in cache per un'altra).
6. `ProtectedRoute` e guardie per ruolo (solo per la UX). Selettore organizzazione nella `TopBar` (visibile solo se l'utente ne ha più di una).
7. Pagine di accesso: `Login`, **recupero password**, **imposta nuova password** (necessarie per gli inviti). **Rimuovi `Register`**. Messaggi di errore di login generici (nessuna enumerazione di email).
8. **Pagina Sicurezza** nel profilo: attivazione e gestione del TOTP (`supabase.auth.mfa.*`). Per il super-admin, dopo il login senza `aal2` l'app mostra solo questa pagina e la verifica del codice.
9. i18n: file `src/locales/it.json` (completo) e `en.json` (iniziato; completo in fase 9), tutte le stringhe UI sotto chiavi; lingua iniziale da `profiles.locale`, selettore lingua nel profilo. Etichette di stati, priorità e ruoli localizzate.
10. `vercel.json` con rewrite SPA (`/(.*)` → `/index.html`), **header di sicurezza** e disattivazione del deploy automatico di `main` (vedi 11.1):
    - `Content-Security-Policy` rigorosa (`default-src 'self'`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co` + Sentry EU; `script-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `object-src 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrittiva.
    - Regola ESLint `react/no-danger` attiva: vietato `dangerouslySetInnerHTML` (inclusa la pagina `UserManual`, da scrivere come componenti/markdown sanificato).
11. **Monitoraggio errori**: Sentry (regione UE) con `beforeSend` che rimuove dati personali e contenuti degli OKR; DSN in variabile d'ambiente.
12. **Fetta verticale** (milestone 1): login, selettore organizzazione, lista OKR, creazione di un OKR con 1-2 KR, check-in tramite `kr_check_in`, avanzamento aggiornato dal trigger. Usa dev con i quattro ruoli di test.

**Fatto quando**: dall'ambiente dev l'utente `alfa_admin` fa login, vede nome e ruolo, cambia lingua, crea un OKR con un KR e vede l'avanzamento calcolato dal database; un utente non autenticato viene reindirizzato al login; la milestone 1 è dimostrabile all'utente.

---

## 8. Fase 5 — Frontend: OKR, Key Result, Azioni, Allineamenti `[SONNET]`

Sostituisci i vecchi `services/*.ts` con servizi che usano `supabase-js` (stessa firma delle funzioni dove possibile, così le pagine cambiano poco):

| Vecchio | Nuovo |
|---|---|
| `okr.service.ts` | CRUD su `okrs`, `key_results`, `actions`, `okr_alignments`; check-in via RPC `kr_check_in`; filtri per sede, team, periodo, stato, priorità; ricerca testuale (sfrutta l'indice trigram); ordinamento e paginazione lato server |
| `user.service.ts` | lettura `v_org_members`; modifiche tramite Edge Function (fase 7) |
| `dashboard.service.ts` | RPC `dashboard_stats` e viste (fase 6) |
| `admin.service.ts`, `DatabaseManagement.tsx` | **Rimossi** in V1: il monitoraggio del database si fa dalla dashboard Supabase |
| `auth.service.ts` | `supabase.auth.*` |

Pagine da portare mantenendo il design esistente: `OkrList`, `OkrDetail`, `OkrForm`, `UserManual` (aggiornato e tradotto). Requisiti:
- Selettore di **periodo** (dalla tabella `periods`), **sede** (opzionale, con voce "Tutta l'organizzazione") e **team** nel form OKR; le opzioni sono già filtrate dalla RLS.
- Validazione con Zod (schemi condivisi in `src/schemas/`), stessi vincoli del database.
- **Soft delete** con conferma (`ConfirmDialog`); archivio degli eliminati visibile solo ad Admin/Manager con azione "Ripristina".
- **Concorrenza**: ogni modifica invia la `version` letta; se l'update non tocca righe, mostra un messaggio chiaro con l'opzione di ricaricare.
- Aggiornamento metriche KR tramite check-in (con nota facoltativa); dopo il salvataggio ricarica l'OKR per mostrare il nuovo avanzamento (calcolato dal trigger, **mai** dal client). Nel dettaglio KR mostra la cronologia dei check-in.
- Allineamenti: selezione di OKR padre/figlio dello stesso periodo/organizzazione; mostra la gerarchia; gestisci l'errore del ciclo in modo comprensibile.
- Pulsanti di modifica/eliminazione mostrati secondo la matrice permessi della sezione 5.6, ma ogni errore RLS (`42501`) mostra un messaggio chiaro tradotto, non un errore generico. Periodo chiuso: interfaccia in sola lettura con avviso.
- Mobile-first, tabelle scrollabili, menu hamburger (come nel prompt originale).

**Fatto quando**: con ciascuno dei quattro ruoli di test su dev, tutte le operazioni consentite funzionano e quelle vietate sono nascoste **e** rifiutate dal database (verifica anche chiamando l'API direttamente con il token di quel ruolo). Esiste almeno un test E2E Playwright per ruolo (login → azione consentita → azione vietata) che gira in CI contro il Supabase effimero.

---

## 9. Fase 6 — Dashboard, report ed export `[SONNET]`

- `Dashboard.tsx` (**Must**): widget con totali, OKR per stato, avanzamento medio, OKR critici, OKR a rischio, ultimi aggiornati; filtri per periodo, sede, team. Dati da `dashboard_stats` e dalle viste.
- Sezione **Report** (**Should**): tasso di completamento per periodo, per sede e per team; trend nel tempo da `okr_progress_history`; analisi allineamento (quanto i figli supportano i padri).
- **Export CSV** della lista filtrata (**Must**): l'export **non** si limita alla pagina corrente. Con la paginazione server-side, scarica tutte le pagine del filtro attivo (a blocchi, con indicatore di avanzamento e limite massimo ragionevole, es. 10.000 righe). Separatore `;` e BOM UTF-8 per compatibilità con Excel in italiano, colonne principali e KR.
  - **Protezione da CSV injection**: ogni cella di testo che inizia con `=`, `+`, `-`, `@`, tabulazione o ritorno a capo viene prefissata con un apice `'`. Test Vitest dedicato.
- Grafici con la libreria già usata nel frontend esistente (se non presente, scegli una libreria leggera e accessibile); ogni grafico ha tabella o testo alternativo.
- Test Vitest per le funzioni di trasformazione dati ed export CSV.

**Fatto quando**: i numeri della dashboard coincidono con una verifica manuale su un set di dati noto del seed, e il CSV (con almeno due pagine di dati) si apre correttamente in Excel e neutralizza le formule.

---

## 10. Fase 7 — Amministrazione ed Edge Functions `[MISTO: vedi 0.1]`

### 10.1 Edge Functions (`supabase/functions/`, Deno + TypeScript) `[OPUS]` funzioni 1, 2, 4, 6, 7, 8 · `[SONNET + review OPUS]` funzioni 3, 5
Regole comuni:
- `verify_jwt = true` per tutte le funzioni (in `config.toml`).
- Leggi il JWT dall'header `Authorization`, crea un client "come utente" per **verificare chi chiama e con quale ruolo** (mai fidarsi del body), poi usa un client `service_role` (variabile d'ambiente fornita da Supabase) solo per l'operazione privilegiata.
- Valida l'input con Zod; CORS limitato agli URL consentiti (mai `*`); errori in JSON con codice.
- **Rate limit** per organizzazione e per utente (es. massimo 20 inviti/ora), implementato contando le righe recenti in `audit_logs`; risposta `429` oltre il limite. Serve a proteggere la quota SMTP e la reputazione del dominio mittente.
- Ogni operazione scrive una riga in `audit_logs`.

Funzioni:
1. `admin-create-organization` — solo super-admin (con `aal2`). Crea organizzazione, periodo iniziale e, se indicata, invita il primo Admin.
2. `admin-invite-user` — Admin dell'organizzazione o sessione di supporto. **Gestisce due casi**: email nuova → `auth.admin.inviteUserByEmail` + membership + sedi; email **già registrata** (utente in un'altra organizzazione) → crea solo la membership e le sedi e invia una notifica, senza reinvito (`inviteUserByEmail` fallirebbe). Un Admin può invitare solo nella **propria** organizzazione. Gli inviti hanno scadenza e si possono reinviare tramite `admin-resend-invite`.
3. `admin-resend-invite` — rinnova un invito non ancora accettato (con rate limit).
4. `admin-update-member` — cambio ruolo, sedi (`membership_locations`), attivazione/disattivazione. Il vincolo "ultimo Admin attivo" è garantito dal trigger del database; la funzione restituisce un errore comprensibile. Un utente non può modificare il proprio ruolo.
5. `admin-remove-member` — disattiva (non cancella) la membership.
6. `admin-start-support-session` — solo super-admin con `aal2`: richiede organizzazione e motivazione (≥ 10 caratteri), crea una `support_sessions` di massimo 4 ore, scrive su `audit_logs`; una funzione gemella chiude la sessione in anticipo.
7. `admin-export-organization` — Admin dell'organizzazione o super-admin con sessione: produce un archivio (JSON/CSV) di tutti i dati del tenant (portabilità).
8. `admin-purge-organization` — solo super-admin con `aal2` e sessione di supporto: eliminazione definitiva di un tenant dopo export confermato e conferma digitando lo slug; esegue la cancellazione a cascata partendo da `organizations`. È l'unico percorso di eliminazione fisica dei dati di dominio.

Deploy: `npx supabase functions deploy <nome> --use-api --project-ref <REF>` (il flag evita la dipendenza da Docker).

### 10.2 Interfaccia admin `[SONNET]`
- `UserManagement.tsx` (da `v_org_members`): tabella membri con ruolo, sedi, stato, team; invito nuovo utente; reinvio; cambio ruolo/sedi; (dis)attivazione. Visibile ad Admin.
- Pagine **Periodi** (CRUD, chiusura/riapertura, Admin e Manager), **Sedi** (CRUD con disattivazione, solo Admin) e **Team** (CRUD per Admin e Manager, assegnazione membri).
- Pagina **Piattaforma** (solo super-admin, **Should**): elenco organizzazioni, creazione di una nuova organizzazione, avvio di una sessione di supporto con banner ben visibile "Sessione di supporto attiva su <org> fino alle HH:MM" mentre è attiva. In V1 contiene l'unica organizzazione dell'utente; resta pronta per i clienti.

### 10.3 Script di bootstrap `[SONNET + review OPUS]`
`scripts/bootstrap-super-admin.ts`: crea (o riusa) l'utente dell'email passata come argomento tramite Admin API, inserisce la riga in `platform_admins`, crea l'organizzazione iniziale e la membership `admin`. Legge URL e `service_role` da variabili d'ambiente passate al momento dell'esecuzione (non salvate su file versionati). Idempotente. Dopo il primo login l'utente attiva il TOTP dalla pagina Sicurezza (obbligatorio per i privilegi di super-admin).

**Fatto quando**: da dev, il super-admin (con TOTP) crea un'organizzazione, invita un utente, l'utente riceve l'email, imposta la password e accede con il ruolo giusto; un utente già registrato altrove viene aggiunto senza errori; un Admin non riesce a invitare in un'altra organizzazione né a scrivere su `memberships` con una chiamata diretta; l'export di un tenant e la sua purge funzionano su un'organizzazione di prova.

---

## 11. Fase 8 — CI/CD, produzione e checklist di rilascio `[MISTO: vedi 0.1]`

### 11.1 GitHub Actions `[OPUS]` prod e backup · `[SONNET]` CI e dev

Permessi del `GITHUB_TOKEN` minimi (`permissions: contents: read` di default, elevati per singolo job); tutte le Action di terze parti fissate per **hash di commit**.

**`ci.yml`** (su PR e push verso `main`):
1. Checkout, setup Node 20 con cache.
2. `cd web && npm ci && npm run lint && npm run typecheck && npm test && npm run build`; `npm audit --audit-level=high`.
3. Setup Supabase CLI (`supabase/setup-cli`), `supabase start` (Docker è disponibile sui runner), `supabase db reset`, `supabase test db`.
4. Controlla che `web/src/types/database.ts` sia aggiornato rispetto alle migrazioni (rigenera con `--local` e `git diff --exit-code`).
5. E2E Playwright contro l'istanza effimera e un build locale del frontend; poi `supabase stop`.

**`deploy-dev.yml`** (su push a `main`): `supabase link` al progetto dev, `supabase db push`, deploy delle funzioni. **`reset-dev.yml`** (solo `workflow_dispatch`): ricrea dev con migrazioni + seed, per riallineare dopo migrazioni di branch abbandonati.

**`deploy-prod.yml`** (su push a `main`, ambiente GitHub **`production`** con approvazione manuale richiesta all'utente), nell'ordine:
1. Backup logico di prod (`pg_dump`) prima di toccare lo schema, salvato come artefatto cifrato.
2. `supabase link --project-ref $PROD_PROJECT_REF`
3. `supabase db push` (solo migrazioni, **mai** `seed.sql`)
4. `supabase functions deploy --use-api` per ogni funzione
5. Pubblicazione del frontend: `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod` con `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Così il frontend esce **dopo** le migrazioni. In `vercel.json` il deploy automatico del branch `main` è disattivato (`"git": { "deploymentEnabled": { "main": false } }`); le preview degli altri branch restano automatiche.
6. Smoke test automatico minimo contro l'URL di produzione.

**`backup-prod.yml`** (schedulato, giornaliero): `pg_dump` del database prod (connection string in secret), cifratura (es. `age`) e upload su un bucket S3-compatibile **in UE** diverso da Supabase e da GitHub; retention 30 giorni. Va attivato **prima** dei dati reali (vedi fase 0, punto B5).

**Strategia di rollback**: le migrazioni sono solo in avanti (niente `down`). Un rilascio sbagliato si corregge con una migrazione correttiva (expand/contract) o ripristinando il backup preso al punto 1 del deploy; le Edge Functions si ridistribuiscono dalla versione precedente del repo; il frontend si riporta alla build precedente con la funzione "Promote/Rollback" di Vercel. Documenta i passi in `docs/operazioni.md`.

### 11.2 STOP-UTENTE: configurazioni da fare nel browser `[SONNET]`
1. **GitHub → Settings → Secrets and variables → Actions**: `SUPABASE_ACCESS_TOKEN` (il token dedicato alla CI), `PROD_PROJECT_REF`, `PROD_DB_PASSWORD`, `PROD_DB_URL`, `DEV_PROJECT_REF`, `DEV_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, credenziali del bucket di backup e chiave pubblica di cifratura.
2. **GitHub → Settings → Environments → `production`**: aggiungere sé stesso come *required reviewer*; i secret di prod stanno solo qui.
3. **GitHub → Settings → Branches**: proteggere `main` (PR obbligatoria, check `ci` obbligatorio). Attiva anche **secret scanning con push protection**, Dependabot alerts e CodeQL.
4. **Vercel**: importare il repo `okr-saas`, *Root Directory* `web`, preset Vite. Variabili d'ambiente:
   - *Production*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` di **prod** e il DSN Sentry.
   - *Preview* e *Development*: quelle di **dev**.
5. **Supabase → Authentication → URL Configuration**:
   - **Prod**: `Site URL` = URL Vercel di produzione; *Redirect URLs* = solo l'URL di produzione. **Niente `localhost` e niente caratteri jolly come `https://*.vercel.app/**`**.
   - **Dev**: `Site URL` = URL di preview/localhost; *Redirect URLs* con `http://localhost:5173/**` e un pattern **specifico del progetto** (es. `https://okr-saas-*-<tuo-team>.vercel.app/**`). Chiunque può creare un sottodominio `*.vercel.app`: un pattern generico permetterebbe di ricevere token di accesso.
6. **Supabase → Authentication → Providers/Settings** (entrambi i progetti): registrazioni disattivate, conferma email attiva, lunghezza minima password 12 (le impostazioni di `config.toml` non si applicano al cloud da sole: usa `supabase config push` o impostale a mano e verificale), TOTP abilitato, template email (inviti, reset password) in italiano. Su Pro, attiva anche la protezione contro le password compromesse.
7. **Supabase → API**: verifica che gli *Exposed schemas* contengano solo `public` (non `private`), imposta *Max rows* a 1000, e che nessuna tabella sia aggiunta alla pubblicazione Realtime (V1 non usa Realtime).
8. **Monitoraggio**: crea un monitor di uptime (es. UptimeRobot o Better Stack) sull'URL di produzione con avviso via email; crea il progetto Sentry (regione UE).
9. Promemoria: l'SMTP predefinito di Supabase ha limiti di invio bassi; basta per V1 con un solo utente. SMTP dedicato e dominio sono un passo V2 (richiesto prima dei clienti pilota).

### 11.3 Importazione dati legacy (solo se la risposta D.1 della fase 0 è "sì") `[OPUS]`
`scripts/import-legacy.ts`: legge un export del vecchio database (JSON/CSV), crea gli utenti tramite Admin API importando gli hash bcrypt esistenti (`password_hash`), mappa ruoli, sedi/team, OKR, KR, azioni e allineamenti sul nuovo modello (assegnando il periodo corretto), è idempotente e produce un report con i conteggi per tabella. Prova prima su dev, confronta i conteggi con l'origine, poi esegui su prod con l'approvazione dell'utente e un backup appena prima.

### 11.4 Primo rilascio in produzione `[OPUS]`
1. Merge su `main` → approvazione dell'utente → backup, migrazioni, funzioni, frontend su prod (nell'ordine di 11.1).
2. Con l'utente, esegui `bootstrap-super-admin` contro prod (l'utente fornisce `service_role` solo nel terminale, per quell'esecuzione). Poi attivazione del TOTP.
3. Smoke test su produzione (vedi sotto).

### 11.5 Smoke test di produzione `[SONNET]`
- Login con il super-admin (con TOTP); creazione di un OKR con 2 KR; check-in e aggiornamento dell'avanzamento; soft delete e ripristino.
- Creazione sede, team e periodo; invito di un utente di prova (Viewer) e verifica che non possa modificare nulla; poi disattivazione.
- Cambio lingua; export CSV; reset password.
- Verifica che da browser, senza login, le chiamate dirette alle tabelle restituiscano vuoto/negato e che l'introspezione GraphQL non risponda.
- Verifica che gli header di sicurezza siano presenti (CSP, HSTS) e che i monitor di uptime ed errori ricevano segnali.

**Fatto quando**: l'app è online sull'URL Vercel, la CI è verde, il deploy di produzione richiede l'approvazione e rispetta l'ordine DB → funzioni → frontend, lo smoke test passa e il primo backup schedulato è stato eseguito.

---

## 12. Fase 9 — Rifinitura, conformità e documentazione `[MISTO: vedi 0.1]`

1. **Controllo di sicurezza**: tutte le tabelle con RLS attiva e policy (query su `pg_tables`/`pg_policies` e `supabase db lint`); nessun privilegio per `anon` su `public`; nessuna funzione `security definer` esposta; nessun `service_role` nel bundle del frontend (cerca nel `dist/`); nessun segreto in git (`git log -p` mirato e secret scanning); `npm audit` senza vulnerabilità alte; header e CSP verificati con uno strumento esterno.
2. **Prestazioni**: genera 5.000 OKR in 20 organizzazioni (script della fase 3) e verifica con `EXPLAIN (ANALYZE)` le query principali di lista e dashboard **con RLS attiva** per ciascun ruolo; confronta con il criterio di successo (p95 < 300 ms); aggiungi gli indici mancanti.
3. **Accessibilità** di base: navigazione da tastiera, contrasto, etichette dei form.
4. **Conformità GDPR** (documenti in `docs/`, da far rivedere a un consulente legale prima dei clienti pilota):
   - `gdpr.md`: ruoli (titolare/responsabile), elenco dei sub-responsabili (Supabase, Vercel, GitHub, Sentry, SMTP) con sede dei dati, modello di DPA per i clienti, tempi di conservazione (inclusi backup e audit log), procedura per le richieste degli interessati (accesso, rettifica, cancellazione).
   - Pagina "Privacy" nell'app; testo informativo agli utenti.
   - Procedura di cancellazione di un singolo utente: anonimizzazione di `profiles` e disattivazione della membership, con gli audit log che mantengono solo l'identificativo tecnico.
   - Procedura di export e purge di un tenant (funzioni 7 e 8) verificata con un test.
5. **Inglese**: completa `en.json` (*Should*).
6. **Documenti** in `docs/`: `architettura.md` (aggiornata, con diagramma), `permessi.md` (matrice 5.6), `operazioni.md` (come fare una migrazione, rilasciare, **fare rollback**, **ripristinare un backup**, ruotare le chiavi, creare un'organizzazione cliente, avviare una sessione di supporto, rispondere a un incidente), `roadmap-v2.md`, `decisioni.md` aggiornato.
7. **Prova di ripristino**: ripristina l'ultimo backup in un progetto temporaneo e verifica i conteggi; annota data e esito in `operazioni.md`. Va ripetuta ogni trimestre.
8. Aggiorna il README con comandi e flusso di lavoro.
9. Archivia il prompt funzionale originale `PROMPT_CLAUDE_CODE.md` in `docs/storico/`.

**Fatto quando**: un nuovo sviluppatore può avviare il progetto seguendo solo il README, `docs/operazioni.md` copre i flussi sopra, la prova di ripristino è documentata e i criteri di successo della sezione 1 sono misurati.

---

## 13. Roadmap V2 (non implementare ora)

1. Onboarding clienti: creazione organizzazione da parte tua con checklist; poi eventuale registrazione self-service con approvazione.
2. Fatturazione con Stripe e limiti per piano (`organizations.plan`).
3. Commenti con menzioni, UI per audit log e storico modifiche per OKR.
4. Notifiche in-app, digest email settimanale, alert OKR a rischio (Edge Functions pianificate con `pg_cron`).
5. Dominio personalizzato + SMTP dedicato (es. Resend) e template email brandizzati.
6. MFA per tutti gli utenti, SSO (Google/Microsoft).
7. Ambiente di staging (o Supabase Branching) e test su dati simili a prod.
8. Funzioni OKR avanzate: punteggio di confidenza, tipi di KR (metrica, milestone, sì/no), template di OKR, punteggio di chiusura periodo, ruolo di "responsabile di team" (`is_lead` su `team_members`).
9. Tenant enterprise su progetto Supabase dedicato (isolamento fisico) se richiesto da un cliente.

---

## 14. Rischi noti e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Sviluppo su cloud senza Docker: errori di migrazione | Due progetti separati; migrazioni provate su dev e poi nella CI su un database effimero prima di arrivare a prod; `reset-dev.yml` per riallineare dev |
| Policy RLS errate = fuga di dati tra clienti | Test pgTAP obbligatori in CI, FK composte con `organization_id`, immutabilità delle colonne di tenant, revisione della matrice permessi prima di ogni release |
| Complessità delle policy (manutenibilità, prestazioni) | Mappa dei permessi calcolata una volta per query (`my_access`), funzioni pure di supporto, misura con `EXPLAIN` e dati realistici in fase 9 |
| Perdita dati in produzione | Migrazioni retrocompatibili, approvazione manuale del deploy, backup prima di ogni deploy + backup giornaliero esterno, piano Pro obbligatorio prima dei dati reali, prova di ripristino |
| Rilascio sbagliato in produzione | Ordine forzato DB → funzioni → frontend, strategia di rollback documentata, smoke test automatico |
| Progetto del piano gratuito messo in pausa | Passaggio a Pro come blocco esplicito prima dei dati reali |
| `service_role` esposta | Solo nelle Edge Functions e nei secret CI; controllo del bundle in fase 9; rotazione documentata |
| Agente con credenziali troppo ampie | CLI locale solo su dev; prod solo via Actions con approvazione; token CI dedicato; rischio residuo del token personale documentato |
| Account super-admin compromesso | TOTP obbligatorio (aal2), accesso ai dati solo con sessione di supporto limitata e registrata |
| Abuso degli inviti (email-bombing, quota SMTP) | Rate limit nelle Edge Functions, SMTP dedicato prima dei clienti pilota |
| Furto di token via redirect o XSS | URL di redirect specifici (no jolly `vercel.app`, no `localhost` in prod), CSP rigorosa, `no-danger`, niente HTML non sanificato |
| Differenze tra vecchio calcolo avanzamento e nuovo | Lettura dei servizi originali in fase 2 e test dedicati che documentano ogni scostamento |
| Dipendenza da un fornitore (Supabase/Vercel) e interruzioni | Monitor di uptime, backup esterni in formato standard (`pg_dump`), schema portabile su qualunque Postgres |
| Conformità GDPR e contratti con i clienti | Documentazione in fase 9, DPA e sub-responsabili, export e purge del tenant, revisione legale prima dei clienti pilota |
| Dipendenza da una sola persona (e dall'agente) | Documentazione operativa in `docs/`, decisioni tracciate in `docs/decisioni.md`, README eseguibile |
| Ambito troppo ampio per l'utilizzo di un solo utente | Priorità MoSCoW (sezione 1); gli elementi *Should/Could* si rimandano senza toccare lo schema |

---

## 15. Riepilogo fasi

| Fase | Contenuto | Passaggi dell'utente | Stima | Modello |
|---|---|---|---|---|
| 0 | Prerequisiti, progetti Supabase, login CLI, domande di conferma | Sì | 0,5 g | Sonnet |
| 1 | Repo, struttura, porting iniziale, CI di base, Dependabot/CodeQL | Poco | 0,5 g | Sonnet |
| 2 | Migrazioni (hardening, schema, RLS, audit, storico), viste, tipi | No (conferma per dev) | 3 g | Opus (5.3-5.7) + Sonnet |
| 3 | Seed, test pgTAP, CI con database effimero | No | 2 g | Opus (casi di sicurezza) + Sonnet |
| 4 | Fondamenta frontend, auth, MFA, i18n, header di sicurezza, **fetta verticale (milestone 1)** | No | 3 g | Sonnet |
| 5 | OKR, KR, azioni, allineamenti, E2E per ruolo | No | 4 g | Sonnet |
| 6 | Dashboard, report, export CSV | No | 3 g | Sonnet |
| 7 | Edge Functions (inviti, supporto, export/purge) e pagine admin | No | 4 g | Opus (funzioni) + Sonnet (UI) |
| 8 | CI/CD, backup, monitoraggio, Vercel, produzione, (import legacy) | Sì | 2 g | Opus (prod) + Sonnet |
| 9 | Hardening, prestazioni, GDPR, documentazione | No | 3 g | Opus (audit) + Sonnet |

---

## 16. Registro delle modifiche

### v1.2 (25 ottobre 2026)

**Assegnazione dei modelli**
- Nuova sezione 0.1 con criteri, procedura di cambio modello, regole di escalation e tabella di assegnazione Opus/Sonnet per task.
- Regola 13 in sezione 0; tag `[OPUS]` / `[SONNET]` / `[SONNET + review OPUS]` nei titoli delle fasi e dei punti; colonna "Modello" nel riepilogo fasi (sezione 15).
- Nessuna modifica a contenuti tecnici, decisioni, stime e criteri "Fatto quando".

### v1.1 (25 ottobre 2026)

**Ordine e processo**
- CI di base spostata in fase 1, job pgTAP in fase 3, `deploy-dev.yml` e `reset-dev.yml` introdotti; protezione del branch subito dopo il primo run della CI.
- Rilascio in prod in ordine forzato DB → funzioni → frontend (Vercel con deploy automatico di `main` disattivato); backup prima di ogni deploy; strategia di rollback.
- Riferimento corretto alla task list (sezione 15); regola sulle credenziali dell'agente (solo dev); fetta verticale anticipata in fase 4; stime, MoSCoW e criteri di successo.

**Sicurezza e multi-tenancy**
- Schema `private` per le funzioni di supporto; hardening di `anon` e rimozione di `pg_graphql`.
- Colonne di tenant e autore immutabili; `created_by`/`updated_by` impostati dal database; controllo ottimistico con `version`.
- FK composte anche verso `memberships` (owner, assegnatari, team); `ON DELETE` senza `SET NULL`; sedi, team e periodi si disattivano.
- Nessuna scrittura client su `memberships`/`membership_locations`; regola dell'ultimo Admin nel database.
- Super-admin: TOTP obbligatorio (aal2) e accesso ai dati solo con sessione di supporto registrata.
- Redirect URL specifici (niente `localhost` in prod, niente jolly `vercel.app`); `config push` per le impostazioni Auth cloud; header di sicurezza e CSP; Sentry; rate limit sugli inviti; secret scanning, Dependabot, CodeQL, Action fissate per hash.

**Modello dati e funzionalità**
- Nuove tabelle: `periods`, `membership_locations`, `okr_progress_history`, `key_result_updates`, `support_sessions`; `audit_logs` popolata da trigger già in V1; email in `profiles`; vista `v_org_members`.
- Semantica dei permessi per Team Lead e per i membri senza sede resa esplicita; periodi chiusi bloccano le modifiche.
- Calcolo avanzamento: lock di riga, trigger a livello di statement, meccanismo di blocco con `pg_trigger_depth()`, verifica del ruolo delle Azioni, RPC `kr_check_in`.
- Prestazioni delle policy con la mappa dei permessi calcolata una volta per query; indici trigram, GIN e parziali.

**Frontend e operatività**
- Organizzazione nell'URL, cache pulita al cambio organizzazione; export CSV completo e protetto da CSV injection; test E2E Playwright.
- Invito di utenti già registrati, reinvio inviti; export e purge di un tenant; sezione GDPR; importazione dei dati legacy (condizionata); backup esterno schedulato e prova di ripristino; monitoraggio di uptime ed errori; piano Pro come blocco prima dei dati reali.
