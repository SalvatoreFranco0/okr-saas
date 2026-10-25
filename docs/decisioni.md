# Registro delle decisioni

## Fase corrente
Fase 1 (bootstrap repo e CI): completata, salvo CodeQL (vedi Deviazioni) e protezione di `main` (STOP-UTENTE). Repo: https://github.com/SalvatoreFranco0/okr-saas. PR di prova #1 aperta (`ci` verde), da non unire finché non decide l'utente. Prossima: Fase 2 (schema database), in una nuova sessione con Plan mode.

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

- **Fase 1, init in cartella esistente**: `C:devokr-saas` esisteva già, quindi `git init` + `gh repo create --source` invece di `--clone`.
- **Fase 1, fix al codice legacy** (solo per far passare la CI): `npm audit fix` (vite, zod), `import type` in `ConfirmDialog.tsx`, `mutationFn` async in `OkrForm.tsx`. Aggiunti gli script `typecheck` e `test` (`vitest run --passWithNoTests`).
- **Fase 1, lint**: `@typescript-eslint/no-explicit-any` portata da `error` a `warn` (33 occorrenze nel codice legacy). Da riportare a `error` a fine Fase 5.
- **Fase 1, CodeQL**: il workflow `codeql.yml` esegue l'analisi ma fallisce all'upload perché sui repo privati Code scanning richiede GitHub Advanced Security (a pagamento). Non attivato: decisione dell'utente (attivare, rendere il repo pubblico, o rimuovere il workflow).

## Ancora da fare dall'utente
- Access Token Supabase dedicato alla CI (Account → Access Tokens), solo per i GitHub Secrets in Fase 8.
- Protezione del branch `main` (PR obbligatoria + check `ci`), secret scanning con push protection e Dependabot alerts (GitHub → Settings, vedi piano 11.2). Il check `ci` ha ora girato.
