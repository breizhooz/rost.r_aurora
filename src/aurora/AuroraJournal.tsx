import { useMemo, useState } from 'react';
import AuroraShell from './AuroraShell';
import AuroraRecipeModal from './AuroraRecipeModal';
import AuroraRecipeCreateModal from './AuroraRecipeCreateModal';
import AuroraScanModal from './AuroraScanModal';
import { useAuroraData } from './useAuroraData';
import type { AuroraViewModel } from './useAuroraData';

function pct(v: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((v / goal) * 100));
}

type Period = '3d' | 'week' | 'month';
const PERIOD_DAYS: Record<Period, number> = { '3d': 3, week: 7, month: 31 };
const PERIOD_LABEL: Record<Period, string> = { '3d': '3 jours', week: 'Semaine', month: 'Mois' };

function Tiles({ vm }: { vm: AuroraViewModel }) {
  const { today, goal } = vm;
  const tiles: { l: string; v: number; g: number; u: string; accent: boolean }[] = [
    { l: 'Calories', v: today.kcal, g: goal.kcal, u: 'kcal', accent: true },
    { l: 'Protéines', v: today.protein, g: goal.protein, u: 'g', accent: false },
    { l: 'Glucides', v: today.carbs, g: goal.carbs, u: 'g', accent: false },
    { l: 'Lipides', v: today.fat, g: goal.fat, u: 'g', accent: false },
  ];
  return (
    <div className="rost-journal-tiles">
      {tiles.map((t) => (
        <div className={`rost-tile ${t.accent ? 'is-accent' : ''}`} key={t.l}>
          <div className="rost-tile-label">{t.l}</div>
          <div className="rost-tile-val">{t.v}<small>{t.u}</small></div>
          <div className="rost-tile-goal">Objectif {t.g} {t.u} · {pct(t.v, t.g)}%</div>
          <div className="rost-tile-track"><div className="rost-tile-fill" style={{ width: `${pct(t.v, t.g)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function AuroraJournal() {
  const { vm } = useAuroraData();
  const [period, setPeriod] = useState<Period>('3d');
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [showChoice, setShowChoice] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showScan, setShowScan] = useState(false);

  const entries = useMemo(() => {
    if (!vm) return [];
    const days = PERIOD_DAYS[period];
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 86400000;
    return vm.journal.filter((e) => {
      const ed = new Date(e.ts); ed.setHours(0, 0, 0, 0);
      const diff = Math.round((startOfToday.getTime() - ed.getTime()) / dayMs);
      return diff >= 0 && diff < days;
    });
  }, [vm, period]);

  return (
    <AuroraShell screen="journal" initials={vm?.user.initials} subtitle="Journal · repas planifiés">
      <div className="rost-filters">
        <h2>Journal · {PERIOD_LABEL[period].toLowerCase()}</h2>
        <div className="rost-pill-group">
          {(['3d', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} className="rost-pill" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {!vm ? (
        <div className="rost-journal">
          <div className="rost-skel" style={{ height: 140 }} />
          <div className="rost-skel" style={{ height: 320 }} />
        </div>
      ) : (
        <div className="rost-journal">
          <Tiles vm={vm} />

          <div className="rost-section-head">
            <h2>Repas planifiés</h2>
            <button className="rost-add-btn" onClick={() => setShowChoice(true)}>+ Ajouter une recette</button>
          </div>

          <article className="rost-log">
            {entries.length === 0 ? (
              <div className="rost-empty">Aucun repas planifié sur cette période — génère un menu pour le voir ici</div>
            ) : (
              entries.map((j, i) => (
                <div
                  className={`rost-log-row${j.slug ? ' is-clickable' : ''}`}
                  key={i}
                  role={j.slug ? 'button' : undefined}
                  tabIndex={j.slug ? 0 : undefined}
                  onClick={j.slug ? () => setDetailSlug(j.slug) : undefined}
                  onKeyDown={j.slug ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailSlug(j.slug); } } : undefined}
                >
                  <div className="rost-log-when">{j.when}</div>
                  <div className="rost-log-slot">{j.slot}</div>
                  <div>
                    <div className="rost-log-title">{j.title}</div>
                    <div className="rost-log-note">{j.src}{j.note ? ` · ${j.note}` : ''}</div>
                  </div>
                  <div className="rost-log-stat"><b>{j.kcal}</b> kcal <em>{j.p}P · {j.c}C · {j.f}F</em></div>
                </div>
              ))
            )}
          </article>
        </div>
      )}

      {detailSlug && (
        <AuroraRecipeModal slug={detailSlug} onClose={() => setDetailSlug(null)} />
      )}

      {showChoice && (
        <div className="rost-rd-overlay" onClick={() => setShowChoice(false)}>
          <div className="rost-rd-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="rost-rd-head">
              <div className="rost-rd-head-actions"><span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>Ajouter une recette</span></div>
              <button className="rost-icon-btn" type="button" onClick={() => setShowChoice(false)} aria-label="Fermer">✕</button>
            </div>
            <div className="rost-rd-body">
              <div className="rost-choice-grid">
                <button type="button" className="rost-choice-btn" onClick={() => { setShowChoice(false); setShowCreate(true); }}>
                  <span className="rost-choice-ico">✍️</span>
                  <span className="rost-choice-label">Manuelle</span>
                  <span className="rost-choice-sub">Saisir la recette à la main</span>
                </button>
                <button type="button" className="rost-choice-btn" onClick={() => { setShowChoice(false); setShowScan(true); }}>
                  <span className="rost-choice-ico">📷</span>
                  <span className="rost-choice-label">OCR/Scan</span>
                  <span className="rost-choice-sub">Importer depuis une photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <AuroraRecipeCreateModal onClose={() => setShowCreate(false)} />
      )}

      {showScan && <AuroraScanModal onClose={() => setShowScan(false)} />}
    </AuroraShell>
  );
}
