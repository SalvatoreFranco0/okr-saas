# Registro delle decisioni

## Fase corrente
Fase 0 (prerequisiti): quasi completa. Aperto solo `okr-saas-prod` (vedi sotto). Prossima: Fase 1 (bootstrap repo e CI di base), da avviare in una nuova sessione con Plan mode.

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

## Ancora da fare dall'utente
- Access Token Supabase dedicato alla CI (Account → Access Tokens), solo per i GitHub Secrets in Fase 8.
