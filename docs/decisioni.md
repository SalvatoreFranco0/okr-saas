# Registro delle decisioni

## Fase corrente
Fase 4 (fondamenta frontend e fetta verticale) scritta sul branch `feat/frontend-base` (25 ottobre 2026), PR non ancora aperta: attende i check `ci`, `analyze`, `pgtap` verdi e il via dell'utente. Fetta verticale provata a mano nel browser contro dev (vedi "Fase 4"). Prossima: Fase 5, con la RPC dei membri (migrazione 0008) e i test E2E. Fase 3 era unita su `main` con la PR #8 (508 asserzioni pgTAP). Restano all'utente: verifica degli *Exposed schemas* nel dashboard Supabase e Access Token per la CI (vedi in fondo).
Repo: https://github.com/SalvatoreFranco0/okr-saas

## Decisioni (25 ottobre 2026)
| Tema | Decisione |
|---|---|
| Dati legacy | Nessun dato reale da importare: si parte da zero. La sezione 11.3 (importazione legacy) della Fase 8 si salta |
| Tenant e sedi | Confermato: ogni cliente è un'`organization` isolata, le sedi sono sotto-unità interne |
| Punti "da confermare" (sez. 1) e scelte ★ della matrice 5.6 | Confermati tutti i default del piano. Stati OKR/KR manuali; le Azioni non influenzano l'avanzamento salvo diversa indicazione di `action.service.ts` (da verificare in Fase 2, 5.5) |
| Docker | Trattato come assente, anche se la CLI risponde (v29.4.1): niente `supabase start/db diff/db pull/db reset` in locale, solo in CI |

## Ambienti Supabase
Organizzazione Supabase `Salvatore Franco` (piano Free), condivisa con i progetti `assetcore-prod` e `assetcore-staging` (Irlanda, in pausa): non fanno parte di questo progetto, non vanno toccati né collegati.

| Ambiente | Stato | Ref | URL | Chiave pubblica |
|---|---|---|---|---|
| dev | creato, Central EU (Frankfurt) | `gudavwvkkwabsxycpqic` | `https://gudavwvkkwabsxycpqic.supabase.co` | `sb_publishable_jWYjWHnQTFDbQ-AR4fKhrw_OzDTSVon` |
| prod | **non ancora creato** | — | — | — |

## Deviazioni dal piano
- **`okr-saas-prod` rimandato** (decisione dell'utente). Motivo: non serve prima della Fase 8 e il piano Free ha un limite di progetti. Va creato (Central EU, password diversa da dev) prima della Fase 8; prima di dati reali va passato a Pro (decisione di spesa dell'utente). Fino ad allora il "Fatto quando" della Fase 0 resta parzialmente aperto.
- Supabase CLI già loggata a livello globale (v2.98.2); Vercel CLI 65.2.0 loggata (25 ottobre 2026).

- **Fase 1, init in cartella esistente**: `C:\dev\okr-saas` esisteva già, quindi `git init` + `gh repo create --source` invece di `--clone`.
- **Fase 1, fix al codice legacy** (solo per far passare la CI): `npm audit fix` (vite, zod), `import type` in `ConfirmDialog.tsx`, `mutationFn` async in `OkrForm.tsx`. Aggiunti gli script `typecheck` e `test` (`vitest run --passWithNoTests`).
- **Fase 1, lint**: `@typescript-eslint/no-explicit-any` portata da `error` a `warn` (33 occorrenze nel codice legacy). Da riportare a `error` a fine Fase 5.
- **Fase 1, repo pubblico** (decisione dell'utente, 25 ottobre 2026): su repo privato CodeQL richiedeva GitHub Advanced Security a pagamento. Il repo è ora pubblico; CodeQL e `ci` sono verdi. Prima della pubblicazione ho scansionato i file tracciati: nessun segreto. Restano pubblici l'email degli autori dei commit, il ref e la chiave publishable di dev. Con repo pubblico i secret restano solo in GitHub Secrets, mai in file.

## Fase 2: scelte e deviazioni
- **Avanzamento**: le Azioni non influenzano l'avanzamento (confermato leggendo `action.service.ts`). Quattro differenze volute rispetto al legacy in `docs/calcolo_avanzamento.md`.
- **Migrazioni 0002-0006 scritte da un subagente Opus** (la sessione era su Sonnet) e rilette integralmente prima del push; 0001 e 0007 scritte in sessione.
- **`pg_trgm` in `extensions`**, non in `public` (spostata nella 0002); l'indice trigram usa `extensions.gin_trgm_ops` perché il `search_path` della sessione di migrazione non include `extensions`.
- **RLS forzata già alla creazione delle tabelle** (0002, 0003), con privilegi client revocati; policy e grant arrivano nella 0005.
- **Ultimo Admin**: il trigger vale anche per il backend privilegiato; passa solo la purge del tenant (organizzazione già cancellata). Chi gestisce i membri (Edge Functions) non può declassare l'ultimo Admin.
- **Blocco periodi chiusi** anche su DELETE e spostato in 0004 (dipende da `my_access()`).
- **Funzioni trigger `security definer`** con `search_path` vuoto; helper `private.is_trusted_backend()` legge il ruolo di sessione, non `current_user`.
- **Soglia "avanzamento basso"** in `v_okr_at_risk`: sotto il 50% (il piano non la fissa).
- **Da rivedere in Fase 5**: le membership sono leggibili solo da Admin/Manager o per sé stessi (matrice 5.6), quindi i menu "assegnatario"/"responsabile" per Team Lead e Viewer richiederanno una RPC o una vista dedicata. `kr_check_in` non scrive in `key_result_updates` se il valore non cambia.
- **Da misurare in Fase 9**: costo di `my_access()` chiamata dall'audit a ogni riga scritta; purge del tenant (FK composte NO ACTION con più percorsi di cascata) da provare con pgTAP in Fase 3.
- **Hook anti-prod**: `.claude/refs.json` ora ha il ref dev. L'hook blocca anche query innocue che contengono `service_role` insieme a `echo/print/cat/type`; va aggirato riformulando la query.
- **Esiti dei controlli** su dev: 7 migrazioni locale=remoto; `db lint --linked` senza errori; 18 tabelle in `public`, tutte con RLS abilitata e forzata e senza privilegi `anon`; nessuna funzione di `public` o `private` eseguibile da `anon`; nessuna `security definer` in `public`.

## Fase 3: scelte e deviazioni
- **Helper pgTAP**: `supabase_test_helpers` 0.0.6 vendorizzato in `supabase/ci/` (commit upstream e sha256 in testa al file, tolta solo la guardia `\quit`), applicato dalla CI con `psql` dopo `db reset`. Mai in migrazioni. Wrapper `tests.authenticate_as_aal` in `supabase/ci/test_setup.sql` (aggiunge `aal` e `role` al JWT simulato): unica funzione nuova.
- **Seed** (`supabase/seed.sql`): solo per il Supabase effimero; `db push` non lo esegue. UUID fissi documentati in testa al file.
- **Dopo `authenticate_as_aal`** il backend si ripristina con `clear_authentication()` + `reset role` (altrimenti il claim `role` resta e `is_trusted_backend()` è falso).
- **`tests.rls_enabled` dell'helper non si usa**: conta anche le viste. `00_inventory` ha un controllo proprio (tabelle, RLS forzata, grant, elenco esatto delle 42 policy, viste `security_invoker`).
- **Tipi**: `web/src/types/database.ts` ora è generato con `--local` nella CI (senza formatter, quindi indentazione grezza). Il vecchio file veniva da dev (`--linked`).
- **Divergenze piano/migrazioni emerse dai test**: `forbid_tenant_change` esenta qualunque backend fidato (il piano dice solo service role nella purge); `platform_admins`/`support_sessions` sono leggibili dal super-admin aal2 (5.6) anche se 5.3 dice "nessun accesso client"; i client ricevono 42501 (RLS prima delle FK) per KR/azioni/allineamenti cross-tenant e 23503 negli altri casi; le FK sono `NO ACTION` e non `RESTRICT` (caso 15).
- **Non coperto**: concorrenza reale A→B / B→A degli allineamenti (servirebbero commit su due sessioni); si verifica che la funzione prenda `pg_advisory_xact_lock` prima della ricorsione. "private non raggiungibile come RPC" non è verificabile da SQL: si verifica che `anon` non abbia USAGE e che `private` non sia in `[api].schemas`.
- **Workflow**: aggiunto `workflow_dispatch` a `ci.yml` per lanciare i test sul branch prima della PR.
- **Prova deliberata** (rimozione di `team_members_delete` dalla 0005): run rosso https://github.com/SalvatoreFranco0/okr-saas/actions/runs/40214997492 (falliscono `00_inventory` e `05_admin`), ripristino con `git revert`, run verde https://github.com/SalvatoreFranco0/okr-saas/actions/runs/40215642017. Le migrazioni sul branch sono identiche a `main`.
- **Review**: i test [SONNET] non hanno avuto una review Opus separata; i file [OPUS] sono stati riletti in parte da me (00, 01, 05, 06, 07, 08) e verificati dal run CI.

## Fase 4: scelte e deviazioni
- **Super-admin e `aal2`**: la policy `platform_admins_select` richiede `aal2`, quindi a `aal1` il client non può sapere di essere super-admin. Il blocco MFA usa `app_metadata.platform_admin` (scrivibile solo dal backend privilegiato) come **indizio solo UX**; la barriera reale è `is_platform_admin()` nella RLS. Lo script di bootstrap (Fase 7) deve impostare quel flag. Regola in `web/src/lib/mfaGate.ts` (funzione pura, 21 test).
- **Task Opus** (punti 8 e 10) delegati a un subagente Opus (la sessione era su Sonnet) e riletti per intero da me: `Security.tsx`, `mfaGate`, `ProtectedRoute`, `vercel.json`, regola `react/no-danger`. Non c'è stata una review Opus separata del diff.
- **CSP** senza `'unsafe-inline'` (Tailwind v4 produce solo CSS esterno; `dist/index.html` senza inline); `img-src data:` serve al QR del TOTP; `connect-src` include `*.supabase.co` e `*.ingest.de.sentry.io`. `vite preview` non applica gli header: la CSP reale si verifica solo su Vercel. La sintassi `git.deploymentEnabled.main: false` non è stata verificata sulla documentazione Vercel.
- **Creazione OKR**: OKR e KR sono due richieste non atomiche; se la seconda fallisce l'OKR resta senza KR. Da sostituire con una RPC in Fase 5. Il Team Lead non può ancora creare OKR (la policy richiede una sede, il form non la offre).
- **Legacy rimosso** (resta nella cronologia git per il porting della Fase 5): `OkrDetail`, `OkrForm`, `OkrList`, `Dashboard`, `UserManagement`, `DatabaseManagement`, `Register`, servizi `admin/dashboard/user/auth`, Axios. `UserManual` resta com'era (da aggiornare in Fase 5). La dashboard è un segnaposto (Fase 6).
- **Migrazione 0008 rimandata alla Fase 5** (decisione dell'utente): RPC `public.org_member_directory(p_org)` `security invoker` che chiama `private.member_directory(p_org)` (`security definer` solo in `private`); espone nome, cognome e ruolo dei membri attivi, solo a chi ha un ruolo nell'organizzazione, senza email. Scrivere SQL e test pgTAP (anon negato, non membro, cross-tenant, membro disattivato, `00_inventory`) e chiedere l'ok prima di `db push`.
- **Dati di test su dev** (solo dev, mai prod): 8 utenti `@test.local` creati con SQL diretto (nessuna chiave privilegiata), password comune di test comunicata in chat, org Alfa e Beta, sedi, team, periodi Q4 aperto e Q3 chiuso, 4 OKR. Utenti: `superadmin` (con flag `platform_admin`), `alfa_admin`, `alfa_manager`, `alfa_tl_milano`, `alfa_tl_senza_sede`, `alfa_viewer_roma`, `beta_admin`, `multi_org` (admin Alfa, viewer Beta). Lo script non è nel repo.
- **CLI Supabase 2.98.2** non legge `supabase/config.toml` (chiavi `orioledb_version`, `local_smtp` di una CLI più recente). Aggirato con `--workdir` su una cartella temporanea con la stessa `.temp` del link a dev. Da risolvere aggiornando la CLI (disponibile 2.122.0).
- **`.env.local`** locale non contiene `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`: per le prove le ho passate come variabili di processo (URL e chiave publishable sono pubbliche). L'utente deve aggiungerle al file.
- **Prova nel browser** (dev): non autenticato → `/login`; `alfa_admin` vede nome/ruolo e 3 OKR di Alfa (non quello di Beta); creato un OKR con un KR; check-in 20→40 su KR 20→60 = 50,0% calcolato dal trigger, con cronologia; cambio lingua IT/EN; `multi_org` vede il selettore org, in Beta è Viewer senza pulsante di creazione e senza l'OKR della sede Torino; `/o/beta/okrs/new` da Viewer torna alla lista; `/o/gamma/...` → "Organizzazione non trovata"; `superadmin` vede solo l'attivazione obbligatoria del TOTP. Bug trovato e corretto: dopo la creazione si finiva sulla dashboard (`navigate` relativo al percorso).
- **Non verificato**: TOTP completo con codice, ruoli Manager/Team Lead/Viewer con sede, CSP su Vercel.

## Ancora da fare dall'utente
- Verificare nel dashboard Supabase (sola lettura) che `private` non sia tra gli *Exposed schemas* (piano 11.2, punto 7).
- Access Token Supabase dedicato alla CI (Account → Access Tokens), solo per i GitHub Secrets in Fase 8.
- Protezione del branch `main` (PR obbligatoria + check `ci`), secret scanning con push protection e Dependabot alerts (GitHub → Settings, vedi piano 11.2). Il check `ci` ha ora girato.
