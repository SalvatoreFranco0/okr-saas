import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight } from 'lucide-react';

// Contenuti in locales/*.json (manual.*): solo testo semplice, mai HTML.
const SECTIONS = ['intro', 'admin', 'manager', 'teamlead', 'viewer', 'security'] as const;
type Section = (typeof SECTIONS)[number];

interface Block {
  title: string;
  items: string[];
}

export function UserManual() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Section>('intro');
  const blocks = t(`manual.${active}.blocks`, { returnObjects: true }) as Block[];

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
      <aside className="md:w-52 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 p-3 md:sticky md:top-4">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <BookOpen className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-semibold text-gray-700">{t('manual.title')}</span>
          </div>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActive(s)}
                aria-current={active === s}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  active === s ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t(`manual.${s}.title`)}
                {active === s && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">{t(`manual.${active}.title`)}</h1>
          <p className="text-sm text-gray-600">{t(`manual.${active}.lead`)}</p>
          {Array.isArray(blocks) &&
            blocks.map((b) => (
              <section key={b.title}>
                <h2 className="text-base font-semibold text-gray-800 mb-2">{b.title}</h2>
                <ul className="text-sm text-gray-600 space-y-1.5 pl-1">
                  {b.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-primary-500 flex-shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </main>
    </div>
  );
}
