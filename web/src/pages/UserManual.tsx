import { useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';

type Section = 'intro' | 'admin' | 'manager' | 'teamlead' | 'viewer';

const sections: { key: Section; label: string; role?: string }[] = [
  { key: 'intro', label: 'Introduzione' },
  { key: 'admin', label: 'Amministratore', role: 'ADMIN' },
  { key: 'manager', label: 'Manager OKR', role: 'MANAGER_OKR' },
  { key: 'teamlead', label: 'Team Lead', role: 'TEAM_LEAD' },
  { key: 'viewer', label: 'Viewer', role: 'VIEWER' },
];

export function UserManual() {
  const [activeSection, setActiveSection] = useState<Section>('intro');

  return (
    <div className="flex gap-6 max-w-5xl mx-auto">
      {/* Sidebar navigation */}
      <aside className="w-52 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 p-3 sticky top-4">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <BookOpen className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-semibold text-gray-700">Manuale Utente</span>
          </div>
          <nav className="space-y-0.5">
            {sections.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeSection === s.key
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s.label}
                {activeSection === s.key && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {activeSection === 'intro' && <IntroSection />}
        {activeSection === 'admin' && <AdminSection />}
        {activeSection === 'manager' && <ManagerSection />}
        {activeSection === 'teamlead' && <TeamLeadSection />}
        {activeSection === 'viewer' && <ViewerSection />}
      </main>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      {children}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 mb-2">{title}</h2>
      <div className="text-sm text-gray-600 space-y-1.5 pl-1">{children}</div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <p className="flex gap-2"><span className="text-primary-500 flex-shrink-0">•</span><span>{children}</span></p>;
}

function IntroSection() {
  return (
    <SectionCard title="Introduzione all'OKR Manager">
      <p className="text-sm text-gray-600">
        OKR Manager è un'applicazione web per la gestione degli Obiettivi e dei Risultati Chiave (OKR) aziendali.
        Permette di definire obiettivi strategici, monitorare i progressi attraverso Key Results misurabili e
        coordinare il lavoro dei team.
      </p>

      <SubSection title="Concetti base">
        <Li><strong>OKR (Objective &amp; Key Results):</strong> un obiettivo qualitativo accompagnato da risultati chiave quantificabili che ne misurano il raggiungimento.</Li>
        <Li><strong>Key Result (KR):</strong> un indicatore misurabile collegato a un OKR. Ha una metrica iniziale, un target e un valore corrente. Il progresso di tutti i KR determina la percentuale di completamento dell'OKR.</Li>
        <Li><strong>Azione:</strong> un task operativo collegato a un Key Result. Ha una checkbox per indicare se è completato. Le azioni sono puramente informative e non influenzano il calcolo del progresso.</Li>
        <Li><strong>Team:</strong> un gruppo di utenti. Gli OKR possono essere assegnati a un team.</Li>
      </SubSection>

      <SubSection title="Ruoli disponibili">
        <Li><strong>Amministratore (ADMIN):</strong> accesso completo a tutte le funzionalità.</Li>
        <Li><strong>Manager OKR:</strong> può creare, modificare ed eliminare OKR. Non gestisce gli utenti.</Li>
        <Li><strong>Team Lead:</strong> può creare e modificare OKR propri e del proprio team.</Li>
        <Li><strong>Viewer:</strong> può solo visualizzare OKR e dashboard. Nessuna modifica.</Li>
      </SubSection>

      <SubSection title="Navigazione">
        <Li>Usa la barra laterale sinistra per spostarti tra le sezioni principali.</Li>
        <Li>La Dashboard mostra una panoramica statistica degli OKR attivi.</Li>
        <Li>La sezione OKR contiene la lista paginata di tutti gli OKR con filtri e ricerca.</Li>
      </SubSection>
    </SectionCard>
  );
}

function AdminSection() {
  return (
    <SectionCard title="Manuale — Amministratore">
      <p className="text-sm text-gray-500 italic">Ruolo: ADMIN — Accesso completo a tutte le funzionalità dell'applicazione.</p>

      <SubSection title="Gestione OKR">
        <Li>Accedi alla sezione <strong>OKR</strong> per vedere tutti gli OKR del sistema.</Li>
        <Li>Clicca <strong>Nuovo OKR</strong> per creare un OKR. Compila titolo, obiettivo, owner, team, periodo, date, stato, priorità e Key Results.</Li>
        <Li>Ogni KR richiede: titolo, metrica iniziale, metrica target, unità di misura e peso (%). I pesi determinano l'impatto di ciascun KR sul progresso totale.</Li>
        <Li>Clicca sull'icona matita per modificare un OKR, sull'icona cestino per eliminarlo (soft delete).</Li>
        <Li>Nella pagina di dettaglio OKR puoi aggiungere azioni a ogni KR: clicca <strong>Aggiungi</strong> accanto alla sezione Azioni del KR.</Li>
        <Li>Puoi spuntare le azioni completate cliccando sulla checkbox.</Li>
        <Li>Nella lista OKR clicca la freccia a sinistra di un OKR per espandere i suoi KR; clicca la freccia accanto a un KR per vedere le sue azioni.</Li>
      </SubSection>

      <SubSection title="Gestione Utenti">
        <Li>Accedi a <strong>Utenti</strong> nella barra laterale (visibile solo ad ADMIN).</Li>
        <Li>Clicca <strong>Nuovo Utente</strong> per creare un utente: inserisci nome, cognome, email, password iniziale e ruolo.</Li>
        <Li>Cambia il ruolo di un utente direttamente dal menu a tendina nella riga dell'utente.</Li>
        <Li>Attiva o disattiva un utente cliccando sul toggle nella colonna Stato.</Li>
        <Li>Assegna o rimuovi team cliccando su <strong>+ Team</strong> nella colonna Team.</Li>
        <Li>Reimposta la password di un utente cliccando sull'icona chiave.</Li>
        <Li>Elimina definitivamente un utente cliccando sull'icona cestino (azione irreversibile).</Li>
      </SubSection>

      <SubSection title="Pagina Database">
        <Li>Accedi a <strong>Database</strong> nella barra laterale (visibile solo ad ADMIN).</Li>
        <Li>Seleziona la tabella da visualizzare con le tab: <strong>OKR</strong>, <strong>Key Results</strong>, <strong>Azioni</strong>.</Li>
        <Li>Clicca sull'icona matita a destra di una riga per attivarla in modalità modifica.</Li>
        <Li>Modifica i campi editabili, poi clicca il segno di spunta per salvare o la X per annullare.</Li>
        <Li>Usa le frecce di paginazione in basso per scorrere tutti i record.</Li>
      </SubSection>

      <SubSection title="Dashboard">
        <Li>La Dashboard mostra: numero totale OKR, progresso medio, OKR attivi e completati, conteggio team e utenti attivi.</Li>
        <Li>I grafici mostrano la distribuzione degli OKR per stato e per priorità.</Li>
        <Li>La sezione <strong>OKR Recenti</strong> elenca gli ultimi 5 OKR aggiornati con accesso rapido al dettaglio.</Li>
      </SubSection>
    </SectionCard>
  );
}

function ManagerSection() {
  return (
    <SectionCard title="Manuale — Manager OKR">
      <p className="text-sm text-gray-500 italic">Ruolo: MANAGER_OKR — Può creare, modificare ed eliminare OKR. Non gestisce utenti o team.</p>

      <SubSection title="Creazione e modifica OKR">
        <Li>Vai alla sezione <strong>OKR</strong> e clicca <strong>Nuovo OKR</strong>.</Li>
        <Li>Compila tutti i campi obbligatori: titolo, obiettivo, periodo, date di inizio e fine.</Li>
        <Li>Aggiungi almeno un Key Result con metrica iniziale, target e peso. La somma dei pesi determina come viene distribuito il progresso.</Li>
        <Li>Per modificare un OKR esistente clicca l'icona matita nella lista OKR o nel dettaglio.</Li>
        <Li>Per eliminare un OKR clicca l'icona cestino. L'OKR viene marcato come eliminato (soft delete) e non è più visibile nella lista.</Li>
      </SubSection>

      <SubSection title="Gestione azioni sui KR">
        <Li>Apri la pagina di dettaglio di un OKR cliccando sul titolo nella lista.</Li>
        <Li>In ogni Key Result trovi la sezione <strong>Azioni</strong>. Clicca <strong>Aggiungi</strong> per creare una nuova azione.</Li>
        <Li>Inserisci un titolo (obbligatorio) e, opzionalmente, una descrizione e una data di scadenza.</Li>
        <Li>Spunta la checkbox di un'azione per marcarla come completata. Il testo apparirà barrato.</Li>
        <Li>Per eliminare un'azione porta il cursore sulla riga e clicca la X che appare a destra.</Li>
      </SubSection>

      <SubSection title="Monitoraggio">
        <Li>Usa la Dashboard per avere una visione d'insieme dell'avanzamento degli OKR.</Li>
        <Li>Nella lista OKR usa i filtri (stato, priorità, team) per trovare rapidamente gli OKR di interesse.</Li>
        <Li>Clicca la freccia accanto a un OKR nella lista per espandere i suoi KR e vedere le azioni senza aprire il dettaglio.</Li>
      </SubSection>
    </SectionCard>
  );
}

function TeamLeadSection() {
  return (
    <SectionCard title="Manuale — Team Lead">
      <p className="text-sm text-gray-500 italic">Ruolo: TEAM_LEAD — Può creare e modificare OKR propri e del proprio team. Non può eliminare OKR.</p>

      <SubSection title="OKR visibili">
        <Li>Puoi vedere tutti gli OKR del sistema nella lista OKR.</Li>
        <Li>Puoi creare nuovi OKR e modificare quelli di cui sei owner o che appartengono al tuo team.</Li>
        <Li>Non puoi eliminare OKR: contatta un Amministratore o Manager OKR.</Li>
      </SubSection>

      <SubSection title="Creazione OKR">
        <Li>Clicca <strong>Nuovo OKR</strong> nella lista OKR.</Li>
        <Li>Nell'OKR puoi definire Key Results per misurare il raggiungimento dell'obiettivo.</Li>
        <Li>Aggiorna regolarmente la <strong>metrica corrente</strong> dei KR per mantenere il progresso aggiornato: vai in modifica OKR e aggiorna il campo <em>Valore corrente</em> di ogni KR.</Li>
      </SubSection>

      <SubSection title="Gestione azioni">
        <Li>Nella pagina di dettaglio OKR puoi aggiungere azioni ai Key Results del tuo team.</Li>
        <Li>Spunta le azioni completate per tener traccia dell'avanzamento operativo.</Li>
        <Li>Puoi espandere la lista OKR → KR → Azioni direttamente dalla pagina OKR senza aprire il dettaglio.</Li>
      </SubSection>
    </SectionCard>
  );
}

function ViewerSection() {
  return (
    <SectionCard title="Manuale — Viewer">
      <p className="text-sm text-gray-500 italic">Ruolo: VIEWER — Accesso in sola lettura. Non può creare, modificare o eliminare alcun dato.</p>

      <SubSection title="Cosa puoi vedere">
        <Li>La <strong>Dashboard</strong> con le statistiche aggregate degli OKR aziendali.</Li>
        <Li>La <strong>lista OKR</strong> con tutti gli OKR attivi, i filtri e la ricerca.</Li>
        <Li>Il <strong>dettaglio</strong> di ogni OKR con i Key Results, le azioni e i commenti.</Li>
        <Li>Le azioni di ogni KR sono visibili (con indicazione se completate), ma non puoi spuntarle.</Li>
      </SubSection>

      <SubSection title="Lista OKR espandibile">
        <Li>Clicca la freccia a sinistra di un OKR nella lista per espandere i suoi Key Results.</Li>
        <Li>Clicca la freccia accanto a un KR per vedere le azioni associate.</Li>
        <Li>Questa vista è solo informativa: non puoi modificare nulla dalla lista.</Li>
      </SubSection>

      <SubSection title="Cosa non puoi fare">
        <Li>Creare, modificare o eliminare OKR.</Li>
        <Li>Aggiungere, modificare o spuntare azioni.</Li>
        <Li>Accedere alla gestione utenti o alla pagina Database.</Li>
        <Li>Aggiungere commenti agli OKR.</Li>
      </SubSection>

      <SubSection title="Come chiedere accesso aggiuntivo">
        <Li>Se hai bisogno di un ruolo con più permessi, contatta l'Amministratore del sistema.</Li>
        <Li>L'Amministratore può modificare il tuo ruolo dalla pagina Gestione Utenti.</Li>
      </SubSection>
    </SectionCard>
  );
}
