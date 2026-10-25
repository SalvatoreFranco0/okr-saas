# Guida al Deployment SaaS per Principianti: Vercel, Supabase e Servizi Serverless / No-Code

Benvenuto in questa guida passo-passo! Questo manuale è stato pensato appositamente per chi vuole pubblicare la web app **SaaS di Gestione OKR** in produzione su Internet **gratuitamente o a bassissimo costo**, sfruttando piattaforme cloud modernissime senza doversi preoccupare di configurare server Linux, firewall o complessi sistemi DevOps.

---

## 💡 Panoramica dello Stack Cloud (Zero-Management)

Per rendere la nostra applicazione raggiungibile in tutto il mondo con un indirizzo web HTTPS sicuro, utilizzeremo due dei servizi più popolari ed efficienti sul mercato:

```mermaid
graph LR
    User[Utente Finale] -->|Accede all'URL https://tuo-dominio.vercel.app| Vercel[Vercel Cloud]
    Vercel -->|Servito da CDN Globale| Frontend[Frontend React]
    Frontend -->|Chiamate API REST| Backend[Backend Express / Serverless API]
    Backend -->|Connessione PostgreSQL SSL| Supabase[(Supabase DB Postgres)]
```

1. **Vercel** (Hosting Frontend & API Serverless):
   - Si collega direttamente al tuo account GitHub.
   - Ogni volta che fai una modifica al codice (`git push`), Vercel compila e pubblica l'aggiornamento automaticamente in pochi secondi.
   - Fornisce gratuitamente HTTPS (certificato SSL) e una CDN globale ad altissima velocità.

2. **Supabase** (Database PostgreSQL Managed & Autenticazione):
   - È un'alternativa open-source a Firebase basata su PostgreSQL.
   - Offre un database relazionale potente nel cloud gestibile da un'interfaccia grafica (No-Code).
   - Mette a disposizione strumenti per il Connection Pooling e la gestione utenti.

---

## 🛠️ Requisiti Preliminari

Prima di iniziare, assicurati di avere:
- Un account su **[GitHub](https://github.com/)** dove caricare il codice del progetto.
- Un account gratuito su **[Vercel](https://vercel.com/)** (puoi registrarti direttamente con GitHub).
- Un account gratuito su **[Supabase](https://supabase.com/)** (puoi registrarti con GitHub).

---

## 📍 FASE 1: Creazione e Configurazione del Database su Supabase

### Passaggio 1.1: Creare un Nuovo Progetto Supabase
1. Accedi alla dashboard di Supabase e clicca su **"New Project"**.
2. Scegli un nome per il progetto (es. `okr-saas-db`).
3. Inserisci una **Database Password** robusta (memorizzala o annotala in un luogo sicuro).
4. Seleziona la regione più vicina ai tuoi utenti (es. *West Europe - Frankfurt*).
5. Clicca su **"Create new project"** e attendi circa 1-2 minuti che il database venga inizializzato.

### Passaggio 1.2: Recuperare le Stringhe di Connessione (Connection Strings)
Nella dashboard del tuo progetto Supabase:
1. Vai su **Project Settings** (icona ingranaggio in basso a sinistra) ➔ **Database**.
2. Cerca la sezione **Connection String** e seleziona la scheda **URI**.
3. Noterai due opzioni fondamentali per le applicazioni Serverless:
   - **Transaction Pooler (Porta 6543)**: Utilizzata da Prisma per le query dell'app in produzione (evita di esaurire le connessioni).
   - **Direct Connection (Porta 5432)**: Utilizzata da Prisma per eseguire le migrazioni (`migrate deploy`).

Esempio di `DATABASE_URL` (Pooled):
`postgres://postgres.xxxx:[TUA_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

Esempio di `DIRECT_URL` (Diretta):
`postgres://postgres.xxxx:[TUA_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`

### Passaggio 1.3: Eseguire le Migrazioni del Schema Prisma su Supabase
Dal tuo computer (terminale del progetto nella cartella `backend`):
1. Aggiorna il file `.env` con la nuova stringa di Supabase.
2. Esegui il comando per creare tutte le tabelle sul database Supabase:
   ```bash
   npx prisma db push
   ```
3. (Opzionale) Inserisci i dati iniziali di test (utenti di default e team):
   ```bash
   npm run seed
   ```
4. Torna su Supabase e clicca sul menu **Table Editor**: vedrai le tabelle `users`, `okrs`, `teams`, `key_results`, `audit_logs` pronte e create!

---

## 🚀 FASE 2: Deployment del Backend su Vercel (o Render / Railway)

Esistono due modi principali per pubblicare il backend Express in ambiente Cloud Serverless:

### Opzione A: Serverless Functions su Vercel (Consigliata per Monorepo)
Per ospitare sia Frontend che Backend sullo stesso dominio Vercel, creiamo un punto di ingresso Serverless `api/index.ts` nella radice del progetto backend.

### Opzione B: Service Web gratuito su Render / Railway
Se preferisci mantenere Express attivo come server tradizionale in esecuzione 24/7:
1. Accedi a **[Render.com](https://render.com/)** e crea un **"Web Service"**.
2. Collega il tuo repository GitHub e seleziona la cartella `backend`.
3. Imposta:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/server.js`
4. Nella sezione **Environment Variables**, inserisci:
   - `DATABASE_URL`: la connessione Supabase.
   - `JWT_SECRET`: una stringa segreta casuale (es. `super-secret-key-okr-2026`).
   - `NODE_ENV`: `production`.
5. Clicca su **Deploy Service**: otterrai un URL pubblico come `https://okr-backend.onrender.com`.

---

## 🎨 FASE 3: Deployment del Frontend React su Vercel

### Passaggio 3.1: Importare il Repository su Vercel
1. Vai sulla dashboard di Vercel e clicca su **"Add New..." ➔ "Project"**.
2. Seleziona il tuo repository GitHub contenente il progetto OKR.
3. Configura le impostazioni di Build del progetto:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Clicca su Edit e seleziona la cartella `frontend`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### Passaggio 3.2: Configurare le Variabili d'Ambiente su Vercel
Prima di cliccare su Deploy, espandi la sezione **Environment Variables** e aggiungi:

| Nome Variabile | Valore | Descrizione |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://okr-backend.onrender.com/api` | L'URL del tuo backend attivo da collegare. |

### Passaggio 3.3: Launch!
Clicca su **"Deploy"**. Entro 30-45 secondi Vercel completerà la build e ti restituirà un link con certificato SSL valido (es. `https://okr-management-app.vercel.app`).

---

## 🔒 FASE 4: Gestione Autenticazione e Alternativa No-Code (Supabase Auth / Clerk)

Attualmente il software utilizza un sistema di autenticazione interno basato su JWT. Tuttavia, per un principiante che vuole evitare di gestire password, reset mail e token di sicurezza lato server, esistono **servizi No-Code di Auth pronti all'uso**:

### 1. Utilizzare Supabase Auth (Integrato)
Supabase offre un modulo di autenticazione completo che si integra nativamente con il database Postgres:
- **Funzionalità incluse**: Registrazione email/password, Login con Google / GitHub / Microsoft, Magic Link via mail senza password.
- **Componente No-Code UI**: Puoi installare il widget `@supabase/auth-ui-react` per avere una schermata di Login e Register completa pronta in 5 righe di codice:
  ```tsx
  import { Auth } from '@supabase/auth-ui-react';
  import { ThemeSupa } from '@supabase/auth-ui-shared';
  import { supabase } from './supabaseClient';

  export function LoginPage() {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow">
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={['google', 'github']} />
      </div>
    );
  }
  ```

### 2. Utilizzare Clerk.com (No-Code Auth Leader)
**Clerk** è la soluzione più moderna per l'autenticazione in app SaaS:
- Ti fornisce componenti React già pronti come `<SignIn />`, `<SignUp />`, `<UserButton />`.
- Gestisce automaticamente la pagina del profilo utente, il cambio password, l'autenticazione a due fattori (2FA) e i ruoli utenti senza scrivere codice backend per l'auth!

---

## 🌐 FASE 5: Collegare un Dominio Personalizzato (.com / .it)

Per trasformare l'applicazione in un vero prodotto SaaS commerciale:
1. Acquista un dominio su Namecheap, GoDaddy o Cloudflare (es. `www.miaazienda-okr.com`).
2. Su Vercel, vai in **Project Settings ➔ Domains**.
3. Inserisci il nome del tuo dominio.
4. Vercel ti mostrerà i record DNS (CNAME e A record) da copiare nel pannello del tuo registrar.
5. In pochi minuti il tuo software sarà attivo sul tuo dominio personalizzato con HTTPS attivo!

---

## 📋 Checklist di Verifica Pre-Lancio (Production Readiness)

- [ ] **Variabili d'ambiente verificate**: Nessuna password o secret nel codice sorgente su GitHub.
- [ ] **CORS Abilitato**: Il backend accetta richieste provenienti dall'URL pubblico di Vercel.
- [ ] **Database Backup**: Attivati i backup automatici su Supabase Dashboard.
- [ ] **Utente Admin iniziale**: Creato l'account Amministratore principale con password sicura.
- [ ] **Test dei Ruoli**: Verificato che un utente `VIEWER` non possa accedere alle rotte di modifica/creazione OKR.

---

## 🥳 Conclusione

Complimenti! Sfruttando l'accoppiata **Vercel + Supabase**, hai deployato un'applicazione web SaaS Full-Stack con performance di livello enterprise, elevatissima sicurezza e costo fisso **$0/mese** per la fase iniziale di test e lancio!
