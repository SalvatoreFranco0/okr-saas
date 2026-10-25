# Prompt per Claude Code - Web App Gestione OKR Aziendali

## 🎯 Obiettivo Generale
Sviluppare una web application CRUD completa per la gestione degli Objectives and Key Results (OKR) aziendali, con un sistema di autorizzazione basato su ruoli (RBAC) che consente a diversi utenti di interagire con il sistema secondo le loro competenze e responsabilità.

---

## 📋 Specifiche Funzionali

### 1. **Sistema di Autenticazione e Autorizzazione**
Implementare un sistema di autenticazione robusto con 4 ruoli utente ben definiti:

#### **Ruolo 1: Amministratore di Sistema**
- Accesso completo al sistema
- Gestione completa degli utenti (creazione, modifica, disattivazione)
- Assegnazione dei ruoli agli utenti
- Visualizzazione e modifica di TUTTI gli OKR aziendali
- Accesso ai report e statistiche di sistema
- Gestione delle impostazioni globali dell'app
- Audit log di tutte le azioni critiche
- Permessi: C.R.U.D. (completo su tutto)

#### **Ruolo 2: Manager OKR (Gestione Completa)**
- Creazione, visualizzazione, modifica e eliminazione di TUTTI gli OKR aziendali
- Assegnazione di OKR a team e individui
- Visualizzazione dei progressi verso gli obiettivi
- Generazione di report su stati degli OKR
- Feedback e commenti su OKR
- Permessi: C.R.U.D. (su tutti gli OKR)

#### **Ruolo 3: Viewer (Visualizzazione)**
- Visualizzazione di sola lettura di TUTTI gli OKR
- Visualizzazione dello stato di avanzamento
- Visualizzazione di report e statistiche
- Nessun permesso di modifica o creazione
- Permessi: R (Read-only)

#### **Ruolo 4: Team Lead/Contributor (Gestione Selettiva)**
- Creazione, modifica e eliminazione dei PROPRI OKR assegnati
- Creazione di OKR per il proprio team
- Visualizzazione di OKR correlati
- Aggiornamento dello stato di avanzamento per OKR assegnati
- Visualizzazione di OKR di altri team (sola lettura)
- Permessi: C.R.U.D. (selettivi - solo su OKR assegnati e del team)

---

### 2. **Struttura Dati - Modello degli OKR**

```
OKR {
  id: UUID
  titolo: String (obbligatorio)
  descrizione: String (opzionale)
  obiettivo: String (obbligatorio)
  keyResults: Array[KeyResult]
  proprietario: User (chi ha creato l'OKR)
  team: Team (team responsabile)
  periodo: String (es: "Q1 2026", "2026")
  dataInizio: Date
  dataFine: Date
  stato: Enum ["In Pianificazione", "Attivo", "In Pausa", "Completato", "Non Raggiunto"]
  progressoPercentuale: Number (0-100)
  priorita: Enum ["Bassa", "Media", "Alta", "Critica"]
  allineamento: OKR[] (OKR correlati a livello superiore)
  tag: String[] (per categorizzazione)
  note: String (note aggiuntive)
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: User
  updatedBy: User
}

KeyResult {
  id: UUID
  titolo: String (obbligatorio)
  descrizione: String
  metricaIniziale: Number
  metricaTarget: Number
  metricaAttuale: Number
  unita: String (es: "%", "€", "utenti", "ticket")
  peso: Number (0-100, per ponderazione)
  stato: Enum ["Non Iniziato", "In Progresso", "On Track", "At Risk", "Completato"]
  dataUltimoAggiornamento: Timestamp
}
```

---

### 3. **Operazioni CRUD Dettagliate**

#### **CREATE (Creazione)**
- Creazione di nuovi OKR con validazione completa
- Assegnazione a team/utenti
- Definizione di Key Results
- Impostazione di priorità e periodi
- Caricamento di allegati/documenti (opzionale)

#### **READ (Lettura)**
- Visualizzazione dettagliata di OKR singoli
- Elenco filtrato di OKR (per team, periodo, stato, priorità)
- Ricerca full-text per titolo e descrizione
- Visualizzazione della gerarchia/allineamento OKR
- Visualizzazione dello storico delle modifiche
- Visualizzazione dei commenti e feedback

#### **UPDATE (Modifica)**
- Modifica titolo, descrizione, obiettivi
- Aggiornamento dello stato
- Modifica dello stato di avanzamento (metrics)
- Modifica della priorità
- Aggiornamento delle date
- Aggiunta/rimozione di allineamenti
- Aggiunta di tag
- Registrazione di chi ha fatto la modifica e quando

#### **DELETE (Eliminazione)**
- Eliminazione logica di OKR (soft delete)
- Archivio degli OKR eliminati
- Solo utenti autorizzati possono elimare (Manager OKR, Admin)
- Conferma prima dell'eliminazione
- Log di audit per ogni eliminazione

---

### 4. **Interfaccia Utente (UX/UI)**

#### **Dashboard principale**
- Widget di overview (OKR in corso, completati, at-risk)
- Grafico di avanzamento generale
- Ultimi OKR aggiornati
- OKR con priorità critica evidenziati
- Statistiche di team (per Admin e Manager OKR)

#### **Vista Elenco OKR**
- Tabella con colonne: Titolo, Team, Stato, Progresso, Priorità, Data Fine
- Filtri sidebar: Team, Periodo, Stato, Priorità
- Ordinamento per colonna
- Ricerca in tempo reale
- Azioni rapide (visualizza, modifica, elimina - a seconda dei permessi)

#### **Dettaglio OKR**
- Visualizzazione completa di un singolo OKR
- Sezione Key Results con progress bar
- Sezione allineamenti
- Sezione commenti e feedback
- Sezione storico modifiche
- Pulsanti azione (modifica, elimina, commenta - a seconda dei permessi)

#### **Form Creazione/Modifica OKR**
- Input validato per tutti i campi obbligatori
- Drag-and-drop per aggiungere Key Results
- Autocompletamento per team e proprietario
- Selezione avanzata per allineamenti
- Anteprima in tempo reale
- Salvataggio automatico di bozze

#### **Gestione Utenti (solo Admin)**
- Tabella utenti con ruoli
- Modifica ruolo per utente
- Disattivazione/attivazione utenti
- Assegnazione team

---

### 5. **Funzionalità Avanzate**

#### **Reporting e Analitiche**
- Report OKR per periodo
- Visualizzazione tasso di completamento
- Analisi allineamento OKR (come i micro-OKR supportano i macro-OKR)
- Export dati in CSV/Excel
- Grafici di trend nel tempo

#### **Commenti e Collaborazione**
- Sistema di commenti su OKR
- Menzioni di utenti con @username
- Thread di discussione
- Notifiche per commenti rilevanti

#### **Storico e Audit**
- Timeline di modifiche per ogni OKR
- Chi ha modificato cosa e quando
- Rollback a versione precedente (opzionale)
- Audit log completo per Admin

#### **Notifiche**
- Notifiche in-app per cambiamenti di stato
- Email digest settimanale
- Alert per OKR at-risk o in ritardo
- Reminder per OKR in scadenza

---

## 🛠️ Stack Tecnologico Consigliato

### **Backend**
- **Framework**: Node.js + Express.js (o simile)
- **Database**: PostgreSQL (relazionale, ideale per RBAC)
- **ORM**: Sequelize o Prisma
- **Autenticazione**: JWT + refresh tokens
- **Validazione**: Joi o Zod

### **Frontend**
- **Framework**: React.js
- **UI Library**: Tailwind CSS o Material-UI
- **State Management**: Redux/Zustand
- **Routing**: React Router
- **Form Handling**: React Hook Form
- **Data Fetching**: Axios o Fetch API con React Query

### **Deployment**
- **Server**: Node.js (Railway, Vercel, Heroku)
- **Database**: Managed PostgreSQL (Supabase, Railway, PlanetScale)
- **Frontend**: Vercel, Netlify, GitHub Pages

---

## 🔒 Requisiti di Sicurezza

1. **Autenticazione**: JWT con expirazione
2. **Autorizzazione**: RBAC robusto, controllato lato server
3. **Validazione**: Input validation su tutti i campi
4. **HTTPS**: Obbligatorio in produzione
5. **CORS**: Configurato correttamente
6. **Rate Limiting**: Protezione da brute force
7. **SQL Injection**: Protezione tramite ORM/prepared statements
8. **XSS Protection**: Sanitizzazione di input/output
9. **Audit Trail**: Log di tutte le azioni critiche

---

## 📱 Requisiti di Responsività

- Design mobile-first
- Responsive per desktop, tablet, smartphone
- Navigazione touch-friendly su mobile
- Menu hamburger per mobile
- Tabelle scrollabili su piccoli schermi

---

## ✅ Criteri di Accettazione

1. **Autenticazione**: Utenti devono poter accedere con email/password
2. **RBAC**: Ogni ruolo vede/modifica solo quello che gli è consentito
3. **CRUD Completo**: Tutte le operazioni funzionano correttamente per ogni ruolo autorizzato
4. **Validazione**: Form valida correttamente i dati in input
5. **Performance**: Caricamento pagina < 3 secondi
6. **Usabilità**: Interfaccia intuitiva anche senza documentazione
7. **Data Integrity**: Nessun dato corrotto o perso per errori di utente
8. **Testing**: Unit test per logica critica (>70% coverage)

---

## 🚀 Priorità di Implementazione

### **Fase 1 (MVP)**
- Autenticazione base
- CRUD OKR per Admin
- Visualizzazione per Viewer
- Dashboard semplice

### **Fase 2**
- Implementare tutti i ruoli
- Key Results management
- Filtri e ricerca avanzata
- Commenti

### **Fase 3**
- Report e analitiche
- Storico e audit
- Notifiche
- Export dati

### **Fase 4**
- Optimizzazioni performance
- Caching
- Progressive Web App (PWA)
- Mobile app (se necessario)

---

## 📚 Struttura File Consigliata

```
okr-management-app/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── rbac.js
│   │   ├── routes/
│   │   │   ├── okr.js
│   │   │   ├── users.js
│   │   │   └── auth.js
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── services/
│   │   └── app.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── services/
│   │   ├── styles/
│   │   └── App.jsx
│   └── package.json
└── database/
    └── migrations/
```

---

## 🎨 Esempio UI/UX Specifico

**Colori suggeriti**
- Primary: #2563eb (blu)
- Success: #16a34a (verde)
- Warning: #ea580c (arancione)
- Danger: #dc2626 (rosso)
- Neutral: #6b7280 (grigio)

**Tipografia**
- Header: Font sans-serif bold
- Body: Font sans-serif regular

---

## 📝 Note Importanti

- **Database**: Usare soft delete per OKR (importante per audit trail)
- **Permessi**: Controllare SEMPRE lato server, non fidarsi del frontend
- **Versioning**: Implementare versionamento API (es: /api/v1/)
- **Documentazione**: Aggiungere Swagger/OpenAPI per API REST
- **Testing**: Scrivere test per logica di autorizzazione

---

## 🎯 Deliverable Attesi

1. ✅ Applicazione full-stack funzionante
2. ✅ Database con schema e migrations
3. ✅ API REST documentata
4. ✅ Frontend responsivo e user-friendly
5. ✅ Sistema di autenticazione e autorizzazione
6. ✅ Test suite (almeno per logica critica)
7. ✅ Documentazione di setup e deployment
8. ✅ README con istruzioni di utilizzo

---

**Versione**: 1.0
**Data**: Marzo 2026
**Autore**: Team OKR Management
