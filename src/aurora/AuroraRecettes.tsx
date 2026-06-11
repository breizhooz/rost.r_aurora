import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { getMe, searchRecipesPage, getNutritionPreferences } from '../api/endpoints';
import type { SearchRecipeResult, SearchResponse, UserOut } from '../types';
import { COURSE_TYPE_LABELS, courseTypeLabel } from '../utils/enumLabels';
import { useRefreshSignal } from '../utils/liveRefresh';
import AuroraRecipeModal from './AuroraRecipeModal';
import AuroraRecipeCreateModal from './AuroraRecipeCreateModal';
import AuroraScanModal from './AuroraScanModal';

const COURSE_TYPES = Object.keys(COURSE_TYPE_LABELS);
const PAGE_SIZE = 20;
const INTENSITIES: [string, number][] = [['Doux', 0.5], ['Modéré', 1.0], ['Intense', 1.5]];

interface Adjust { aggressiveness: number; varietyPct: number; overrideCalories?: number; overrideProteines?: number; }

function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

export default function AuroraRecettes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserOut | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [courseType, setCourseType] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [aggressiveness, setAggressiveness] = useState(1.0);
  const [varietyPct, setVarietyPct] = useState(0.10);
  const [overrideCalories, setOverrideCalories] = useState('');
  const [overrideProteines, setOverrideProteines] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const adjust = useMemo<Adjust>(() => ({
    aggressiveness,
    varietyPct,
    overrideCalories: overrideCalories ? Number(overrideCalories) : undefined,
    overrideProteines: overrideProteines ? Number(overrideProteines) : undefined,
  }), [aggressiveness, varietyPct, overrideCalories, overrideProteines]);

  useEffect(() => { getMe().then(setUser).catch(() => {}); }, []);

  // Initialise les curseurs live depuis les réglages par défaut persistés du profil.
  useEffect(() => {
    getNutritionPreferences().then((np) => {
      if (!np) return;
      setAggressiveness(np.rules_aggressiveness);
      setVarietyPct(np.rules_variety_pct);
      if (np.rules_override_calories != null) setOverrideCalories(String(np.rules_override_calories));
      if (np.rules_override_proteines != null) setOverrideProteines(String(np.rules_override_proteines));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlSlug = params.get('slug'); const urlQ = params.get('q');
    if (urlSlug) setSelectedSlug(urlSlug);
    if (urlQ !== null) { setQ(urlQ); setOffset(0); }
  }, [location.search]);

  const runSearch = useCallback(async (query: string, ct: string | null, off: number, adj: Adjust) => {
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await searchRecipesPage({
        q: query, courseType: ct ?? undefined, limit: PAGE_SIZE, offset: off,
        aggressiveness: adj.aggressiveness, varietyPct: adj.varietyPct,
        overrideCalories: adj.overrideCalories, overrideProteines: adj.overrideProteines,
      });
      if (!ctrl.signal.aborted) setResult(res);
    } catch { /* ignore */ } finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q, courseType, offset, adjust), 200);
    return () => clearTimeout(t);
  }, [q, courseType, offset, adjust, runSearch, refreshKey]);

  // Recharge la liste quand des recettes changent ailleurs (ex. import admin
  // terminé) ou au retour de focus — sans rechargement manuel de la page.
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  useRefreshSignal('recipes', bumpRefresh);

  const items = result?.results ?? [];
  const total = result?.total ?? 0;
  const currPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AuroraShell screen="recettes" initials={user ? initials(user.email) : undefined} title="Recettes"
      subtitle={result && !loading ? `${total} recette${total !== 1 ? 's' : ''}${q ? ` · « ${q} »` : ''}` : undefined}>
      <div className="rost-page">
        <div className="rost-filters" style={{ padding: 0, marginBottom: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="rost-pill-group">
            <button className="rost-pill" aria-pressed={courseType === null} onClick={() => { setCourseType(null); setOffset(0); }}>Toutes</button>
            {COURSE_TYPES.map((ct) => (
              <button key={ct} className="rost-pill" aria-pressed={courseType === ct} onClick={() => { setCourseType(ct); setOffset(0); }}>
                {COURSE_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>

          <div className="rost-addmenu">
            <button
              type="button"
              className="rost-add-btn rost-addmenu-toggle"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="rost-addmenu-burger" aria-hidden="true">☰</span>
              Ajouter une recette
            </button>
            {menuOpen && (
              <>
                <div className="rost-addmenu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="rost-addmenu-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setShowCreate(true); }}>
                    <span aria-hidden="true">✍️</span> Ajout manuel
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setShowScan(true); }}>
                    <span aria-hidden="true">📷</span> OCR
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {result?.nutrition_targets && (
          <div className="rost-adjust">
            <button type="button" className="rost-adjust-toggle" aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}>
              <span>⚙️ Ajuster mes cibles</span>
              <span aria-hidden="true">{panelOpen ? '▲' : '▼'}</span>
            </button>
            {panelOpen && (
              <div className="rost-adjust-body">
                <div className="rost-adjust-row">
                  <span className="rost-adjust-label">Intensité</span>
                  <div className="rost-seg">
                    {INTENSITIES.map(([lbl, val]) => (
                      <button key={val} type="button"
                        className={`rost-seg-btn ${aggressiveness === val ? 'is-active' : ''}`}
                        onClick={() => { setAggressiveness(val); setOffset(0); }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="rost-adjust-row">
                  <span className="rost-adjust-label">Variété · ±{Math.round(varietyPct * 100)}%</span>
                  <input type="range" min={5} max={30} step={1} className="rost-adjust-slider"
                    value={Math.round(varietyPct * 100)}
                    onChange={(e) => { setVarietyPct(Number(e.target.value) / 100); setOffset(0); }} />
                </div>
                <div className="rost-adjust-row">
                  <span className="rost-adjust-label">Calories cibles</span>
                  <input type="number" min={0} placeholder="auto" className="rost-adjust-input"
                    value={overrideCalories}
                    onChange={(e) => { setOverrideCalories(e.target.value); setOffset(0); }} />
                </div>
                <div className="rost-adjust-row">
                  <span className="rost-adjust-label">Protéines cibles (g)</span>
                  <input type="number" min={0} placeholder="auto" className="rost-adjust-input"
                    value={overrideProteines}
                    onChange={(e) => { setOverrideProteines(e.target.value); setOffset(0); }} />
                </div>
              </div>
            )}
          </div>
        )}

        {result?.nutrition_targets && (
          <div className="rost-targets-banner">
            <div className="rost-targets-head">
              <span className="rost-targets-title">🎯 Vos cibles du jour</span>
              <span className="rost-targets-sub">Recettes triées selon votre profil nutritionnel</span>
            </div>
            <div className="rost-targets-macros">
              <div className="rost-target"><span>{Math.round(result.nutrition_targets.calories)}</span><em>kcal</em></div>
              <div className="rost-target"><span>{Math.round(result.nutrition_targets.proteines)}</span><em>Protéines g</em></div>
              <div className="rost-target"><span>{Math.round(result.nutrition_targets.glucides)}</span><em>Glucides g</em></div>
              <div className="rost-target"><span>{Math.round(result.nutrition_targets.lipides)}</span><em>Lipides g</em></div>
            </div>
            {result.nutrition_targets.warnings.length > 0 && (
              <ul className="rost-targets-warnings">
                {result.nutrition_targets.warnings.map((w, i) => (
                  <li key={i}>⚠️ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <div className="rost-recettes-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rost-skel" style={{ height: 185 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rost-empty rost-empty-block">{q ? `Aucun résultat pour « ${q} »` : "Aucune recette pour l'instant."}</div>
        ) : (
          <div className="rost-recettes-grid">
            {items.map((r: SearchRecipeResult) => (
              <article className="rost-recette-card" key={r.id} onClick={() => setSelectedSlug(r.slug)}>
                <div className="rost-recette-img">
                  {r.image_url ? <img src={r.image_url} alt={r.title} loading="lazy" /> : <span className="rost-recette-noimg">🍽</span>}
                  {courseTypeLabel(r.course_type) && <span className="rost-recette-tag">{courseTypeLabel(r.course_type)}</span>}
                </div>
                <div className="rost-recette-body">
                  <h3 className="rost-recette-title">{r.title}</h3>
                  {r.source_recipe_id != null && <span className="rost-recette-coach" title="Recette ajoutée par votre gestionnaire">👩‍⚕️ Ajoutée par votre gestionnaire</span>}
                  {(r.calories != null || r.proteines != null) && (
                    <div className="rost-recette-macros">
                      {r.calories != null && <span><b>{Math.round(r.calories)}</b> kcal</span>}
                      {r.proteines != null && <span><b>{Math.round(r.proteines)}</b> g prot.</span>}
                      <span className="rost-recette-macros-unit">/ pers.</span>
                    </div>
                  )}
                  <div className="rost-recette-meta">
                    {r.prep_time_minutes != null && <span>⏱ {r.prep_time_minutes} min</span>}
                    {r.servings != null && <span>👤 {r.servings}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {totPages > 1 && (
          <div className="rost-pagination">
            <button className="rost-btn" disabled={offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>← Préc</button>
            <span className="rost-page-info">{currPage} / {totPages}</span>
            <button className="rost-btn" disabled={currPage >= totPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Suiv →</button>
          </div>
        )}
      </div>

      {selectedSlug && (
        <AuroraRecipeModal
          slug={selectedSlug}
          onDeleted={() => runSearch(q, courseType, offset, adjust)}
          onUpdated={() => runSearch(q, courseType, offset, adjust)}
          onClose={() => {
            setSelectedSlug(null);
            const params = new URLSearchParams(location.search); params.delete('slug');
            const qs = params.toString();
            navigate(qs ? `/recettes?${qs}` : '/recettes', { replace: true });
          }} />
      )}

      {showCreate && (
        <AuroraRecipeCreateModal
          onCreated={() => runSearch(q, courseType, offset, adjust)}
          onClose={() => setShowCreate(false)} />
      )}

      {showScan && (
        <AuroraScanModal
          onScanned={() => runSearch(q, courseType, offset, adjust)}
          onClose={() => setShowScan(false)} />
      )}

    </AuroraShell>
  );
}
