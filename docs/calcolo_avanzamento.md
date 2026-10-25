# Calcolo dell'avanzamento: legacy e nuovo modello

Fonte: `backend/src/services/okr.service.ts` (`calculateProgress`) e `action.service.ts` del vecchio software, letti in sola lettura il 25 ottobre 2026.

## Le Azioni non influenzano l'avanzamento
`action.service.ts` contiene solo CRUD (lista, crea, aggiorna, elimina): nessuna funzione ricalcola il KR o l'OKR. L'avanzamento dipende soltanto dai Key Result (`initialMetric`, `targetMetric`, `currentMetric`, `weight`). Il nuovo modello mantiene questo comportamento: nessun trigger sulle Azioni tocca l'avanzamento.

## Formula adottata (invariata rispetto al legacy)
- KR: `(current − initial) / (target − initial) × 100`, limitato a 0–100 (vale anche per metriche decrescenti).
- OKR: media pesata `Σ(pct × weight) / Σ(weight)`; 0 se non ci sono KR o la somma dei pesi è 0.

## Differenze volute rispetto al legacy
| # | Legacy | Nuovo | Motivo |
|---|---|---|---|
| 1 | `target = initial` → il KR vale sempre 100 | 100 se `current >= target`, altrimenti 0 | Un KR non raggiunto non deve contare come completato (piano 5.5) |
| 2 | Arrotondamento a 2 decimali (`Float`) | 1 decimale (`numeric(5,1)`) | Schema del piano (5.4) |
| 3 | Ricalcolo solo in `updateOkr` e `deleteKeyResult`; non alla creazione dell'OKR/KR | Trigger di statement su insert, update e delete di `key_results` | Il valore salvato non può restare obsoleto |
| 4 | `updateOkr` cancella e ricrea tutti i KR (perdendo azioni collegate e storico) | I KR si modificano uno per uno | Servono `key_result_updates` e `okr_progress_history`; da tenere presente nel porting della Fase 5 |
