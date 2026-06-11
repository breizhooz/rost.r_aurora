import AuroraShell from './AuroraShell';
import AuroraShakeRecipe from './AuroraShakeRecipe';
import { useAuroraData } from './useAuroraData';
import type { AuroraViewModel } from './useAuroraData';

function todaySubtitle(): string {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function pct(v: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((v / goal) * 100));
}

/** Entier groupé par milliers avec séparateur "·" estompé (fidèle au proto). */
function GroupedNum({ value }: { value: number }) {
  const groups = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',').split(',');
  return (
    <>
      {groups.map((g, i) => (
        <span key={i}>
          {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
          {g}
        </span>
      ))}
    </>
  );
}

function Hero({ vm }: { vm: AuroraViewModel }) {
  const { today, goal, hasGoal } = vm;
  const reste = Math.max(0, goal.kcal - today.kcal);
  const rows: [string, number, number, boolean][] = [
    ['Prot.', today.protein, goal.protein, true],
    ['Gluc.', today.carbs, goal.carbs, false],
    ['Lip.', today.fat, goal.fat, false],
  ];
  return (
    <article className="rost-hero">
      <header className="rost-hero-head">
        <div className="rost-hero-eyebrow">Calories · objectif jour</div>
        <div className="rost-hero-badge">
          {hasGoal ? `${pct(today.kcal, goal.kcal)}% atteint` : 'objectif non défini'}
        </div>
      </header>

      <div className="rost-hero-num"><GroupedNum value={today.kcal} /><small>kcal</small></div>
      <div className="rost-hero-caption">
        {hasGoal
          ? <>Reste {reste.toLocaleString('fr-FR')} kcal sur l'objectif <strong style={{ color: '#fff' }}>{goal.kcal.toLocaleString('fr-FR')}</strong></>
          : 'Complète ton profil pour définir un objectif'}
      </div>

      <div className="rost-macro-bar">
        {rows.map(([label, v, g, accent]) => (
          <div className="rost-macro-row" key={label}>
            <div className="rost-macro-label">{label}</div>
            <div className="rost-macro-track">
              <div className={`rost-macro-fill ${accent ? 'accent' : ''}`} style={{ width: `${pct(v, g)}%` }} />
            </div>
            <div className="rost-macro-val">{v}<em>/{g}g</em></div>
          </div>
        ))}
      </div>

      <WeekChart vm={vm} />
    </article>
  );
}

function WeekChart({ vm }: { vm: AuroraViewModel }) {
  const max = Math.max(1, ...vm.week.map((d) => d.kcal));
  return (
    <>
      <div className="rost-hero-week">
        {vm.week.map((d, i) => (
          <div
            key={i}
            className={`rost-hero-week-bar ${d.today ? 'today' : ''}`}
            style={{ height: `${Math.round((d.kcal / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="rost-hero-week-labels">
        {vm.week.map((d, i) => <div key={i}>{d.day}</div>)}
      </div>
    </>
  );
}

function TopRecipes({ vm }: { vm: AuroraViewModel }) {
  return (
    <article className="rost-card">
      <div className="rost-card-head">
        <span className="rost-card-title">Top recettes · protéines</span>
        <span className="rost-card-num"><span className="accent">{vm.topRecipes.length}</span></span>
      </div>
      {vm.topRecipes.length === 0 ? (
        <div className="rost-empty">Aucune recette disponible</div>
      ) : (
        <div className="rost-recipe-list">
          {vm.topRecipes.map((r, i) => (
            <div className="rost-recipe" key={i}>
              <div className="rost-recipe-rank">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="rost-recipe-title">{r.title}</div>
                <div className="rost-recipe-meta">{r.time != null ? `${r.time} min · ` : ''}{r.tag}</div>
              </div>
              <div className="rost-recipe-stat">{r.p}g<small>prot.</small></div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Meals({ vm }: { vm: AuroraViewModel }) {
  return (
    <article className="rost-meals">
      <div className="rost-card-head" style={{ marginBottom: 8 }}>
        <span className="rost-card-title">Repas du jour · {vm.meals.length} prévus</span>
        <button className="rost-add-btn">+ Ajouter</button>
      </div>
      {vm.meals.length === 0 ? (
        <div className="rost-empty">Aucun repas planifié aujourd'hui</div>
      ) : (
        vm.meals.map((m, i) => (
          <div className={`rost-meal-row ${m.done ? '' : 'is-pending'}`} key={i}>
            <div className="rost-meal-time">{m.when}</div>
            <div className="rost-meal-slot">{m.slot}</div>
            <div className="rost-meal-title">{m.title}</div>
            <div className="rost-meal-stat"><strong>{m.kcal}</strong> kcal <em>· {m.p}P {m.c}C {m.f}F</em></div>
          </div>
        ))
      )}
    </article>
  );
}

export default function AuroraDashboard() {
  const { vm } = useAuroraData();

  return (
    <AuroraShell
      screen="dashboard"
      initials={vm?.user.initials}
      subtitle={todaySubtitle()}
    >
      <div className="rost-filters">
        <h2>Macros · Aujourd'hui</h2>
        <div className="rost-pill-group">
          <button className="rost-pill" aria-pressed={false}>3 jours</button>
          <button className="rost-pill" aria-pressed>Semaine</button>
          <button className="rost-pill" aria-pressed={false}>Mois</button>
        </div>
      </div>

      {!vm ? (
        <div className="rost-grid">
          <div className="rost-skel" style={{ height: 420 }} />
          <div className="rost-skel" style={{ height: 420 }} />
        </div>
      ) : (
        <>
          <div className="rost-grid">
            <Hero vm={vm} />
            <TopRecipes vm={vm} />
          </div>
          <div className="rost-row-2">
            <Meals vm={vm} />
            <AuroraShakeRecipe />
          </div>
        </>
      )}
    </AuroraShell>
  );
}
