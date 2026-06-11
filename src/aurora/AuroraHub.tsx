import { useEffect, useState, useCallback } from 'react';
import AuroraShell from './AuroraShell';
import AuroraRecipeCreateModal from './AuroraRecipeCreateModal';
import AuroraScanModal from './AuroraScanModal';
import {
  getMe, getCrawlerSources, createCrawlerSource, deleteCrawlerSource, triggerCrawl, getCrawlerResults,
  crawlOneshot, getCrawlOneshotStatus, getNotifications, rejectCrawlResult, resetCrawlResult, hydrateResult, commitResult, listMyRecipes,
} from '../api/endpoints';
import type {
  UserOut, CrawlType, CrawlSourceResponse, CrawlResultResponse, RecipeHydrated, RecipeCommitRequest, HydratedIngredient, RecipeResponse, NotificationItem,
} from '../types';

function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}
type SourceType = 'web' | 'instagram';
type ModalStep = 'raw' | 'hydrating' | 'recipe';
function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000), d = Math.floor(h / 24);
  if (d > 0) return `il y a ${d}j`; if (h > 0) return `il y a ${h}h`; return "à l'instant";
}
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
function truncate(s: string | null, n = 200): string { if (!s) return ''; return s.length > n ? s.slice(0, n) + '…' : s; }
// Même règle que le backend : un lien /p/, /reel/ ou /tv/ Instagram = import « lien IG ».
const IG_POST_RE = /instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+/i;
function linkType(url: string): 'instagram' | 'web' { return IG_POST_RE.test(url) ? 'instagram' : 'web'; }

const COURSE_TYPE_OPTIONS = [
  { value: 'enums.course_type.starter', label: 'Entrée' }, { value: 'enums.course_type.main', label: 'Plat principal' },
  { value: 'enums.course_type.dessert', label: 'Dessert' }, { value: 'enums.course_type.sauce', label: 'Sauce' },
  { value: 'enums.course_type.drink', label: 'Boisson' }, { value: 'enums.course_type.snack', label: 'Snack / Apéro' },
  { value: 'enums.course_type.side_dish', label: 'Accompagnement' }, { value: 'enums.course_type.breakfast', label: 'Petit-déjeuner' },
  { value: 'enums.course_type.soup', label: 'Soupe' }, { value: 'enums.course_type.salad', label: 'Salade' },
];
function hydratedToCommit(h: RecipeHydrated): RecipeCommitRequest { return { title: h.title, description: h.description, instructions: h.instructions, servings: h.servings, prep_time_minutes: h.prep_time_minutes, cook_time_minutes: h.cook_time_minutes, ingredients: h.ingredients.map((i) => ({ ...i })), course_type: null, free_tags: [] }; }

function groupBySource(items: CrawlResultResponse[], type: 'web' | 'instagram', srcs: CrawlSourceResponse[]) {
  const map = new Map<string, CrawlResultResponse[]>();
  for (const item of items.filter((i) => i.type === type)) {
    let key: string;
    if (type === 'web') { try { key = new URL(item.url_origin).hostname.replace(/^www\./, ''); } catch { key = item.url_origin; } }
    else { const src = srcs.find((s) => s.id === item.source_id); key = src ? src.url.replace(/^@/, '') : 'oneshot'; }
    const arr = map.get(key) ?? []; arr.push(item); map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, its]) => ({
    key, label: type === 'instagram' ? `@${key}` : key,
    items: its.sort((a, b) => new Date(b.published_at ?? b.created_at).getTime() - new Date(a.published_at ?? a.created_at).getTime()),
  })).sort((a, b) => b.items.length - a.items.length);
}

function TypeBadge({ type }: { type: string }) {
  return <span className={`rost-typebadge t-${type}`}>{type === 'instagram' ? '📸 ' : type === 'web' ? '🌐 ' : type === 'ocr' ? '📷 ' : ''}{type}</span>;
}
function StatusBadge({ status }: { status: string }) {
  if (status === 'valid') return <span className="rost-statusbadge s-valid">✓ Validé</span>;
  if (status === 'rejected') return <span className="rost-statusbadge s-rejected">✕ Rejeté</span>;
  return <span className="rost-statusbadge s-waiting">⏳ Attente</span>;
}

export default function AuroraHub() {
  const [user, setUser] = useState<UserOut | null>(null);
  const [sources, setSources] = useState<CrawlSourceResponse[]>([]);
  const [results, setResults] = useState<CrawlResultResponse[]>([]);
  const [loadingSrc, setLoadingSrc] = useState(true);
  const [loadingRes, setLoadingRes] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [resultTab, setResultTab] = useState<CrawlType | undefined>(undefined);
  const [instagramAccountFilter, setInstagramAccountFilter] = useState('');
  const [creationTab, setCreationTab] = useState<'lien' | 'photo' | 'manuel'>('lien');
  const [advancedType, setAdvancedType] = useState<'instagram' | 'web'>('instagram');
  const [manualSuccess, setManualSuccess] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [recupTab, setRecupTab] = useState<'validation' | 'historique' | 'recettes'>('validation');
  const [myRecipes, setMyRecipes] = useState<RecipeResponse[]>([]);
  const [myRecipesLoading, setMyRecipesLoading] = useState(false);
  const [myRecipesLoaded, setMyRecipesLoaded] = useState(false);
  const [historyItems, setHistoryItems] = useState<CrawlResultResponse[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyType, setHistoryType] = useState<'web' | 'instagram'>('instagram');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [historyLimits, setHistoryLimits] = useState<Record<string, number>>({});
  const [modalResult, setModalResult] = useState<CrawlResultResponse | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>('raw');
  const [modalFromHistory, setModalFromHistory] = useState(false);
  const [hydrateError, setHydrateError] = useState('');
  const [hydrated, setHydrated] = useState<RecipeHydrated | null>(null);
  const [recipe, setRecipe] = useState<RecipeCommitRequest | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [srcType, setSrcType] = useState<SourceType>('web');
  const [srcValue, setSrcValue] = useState(''); const [srcFreq, setSrcFreq] = useState(24);
  const [submittingSrc, setSubmittingSrc] = useState(false); const [srcError, setSrcError] = useState('');
  const [quickUrl, setQuickUrl] = useState(''); const [quickLoading, setQuickLoading] = useState(false); const [quickMsg, setQuickMsg] = useState('');
  const [notifs, setNotifs] = useState<NotificationItem[]>([]); const [dismissedNotifs, setDismissedNotifs] = useState<Set<string>>(new Set());

  const closeModal = useCallback(() => {
    setModalResult(null); setModalStep('raw'); setHydrated(null); setRecipe(null);
    setHydrateError(''); setCommitError(''); setTagInput(''); setModalFromHistory(false);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [closeModal]);

  const loadSources = useCallback(async () => { setLoadingSrc(true); try { setSources(await getCrawlerSources()); } catch { setSources([]); } setLoadingSrc(false); }, []);
  const loadResults = useCallback(async (currentSort: 'asc' | 'desc' = sort, tab: CrawlType | undefined = resultTab) => {
    setLoadingRes(true); try { const r = await getCrawlerResults('waiting', 1, 100, currentSort, tab); setResults(r.items); } catch { setResults([]); } setLoadingRes(false);
  }, [sort, resultTab]);
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { const [v, rj] = await Promise.all([getCrawlerResults('valid', 1, 200, 'desc'), getCrawlerResults('rejected', 1, 200, 'desc')]); setHistoryItems([...v.items, ...rj.items]); } catch { setHistoryItems([]); }
    setLoadingHistory(false);
  }, []);
  const loadNotifs = useCallback((userId: string) => {
    getNotifications(userId, 20).then(setNotifs).catch(() => setNotifs([]));
  }, []);
  useEffect(() => {
    getMe().then((u) => { setUser(u); loadNotifs(u.id); }).catch(() => {});
    loadSources(); loadResults(); loadHistory();
  }, [loadSources, loadResults, loadHistory, loadNotifs]);

  async function handleQuickCrawl(e: React.FormEvent) {
    e.preventDefault();
    const url = quickUrl.trim(); if (!url) return;
    const type = linkType(url);
    if (!canUniqLink(type)) {
      setQuickMsg(`Erreur : tu n'as pas le droit « Lien ${type === 'instagram' ? 'Instagram' : 'Web'} ». Demande-le à un administrateur.`);
      return;
    }
    setQuickLoading(true); setQuickMsg('');
    const label = type === 'instagram' ? 'du post Instagram' : 'du lien';
    try {
      const { task_id } = await crawlOneshot(url);
      setQuickUrl('');
      setQuickMsg(`Import ${label} en cours…`);
      // Polling du résultat de la tâche (~jusqu'à 30s) pour remonter un blocage
      // Instagram de façon claire, au lieu d'un message optimiste trompeur.
      let resolved = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        let st;
        try { st = await getCrawlOneshotStatus(task_id); } catch { continue; }
        if (!st.ready) continue;
        resolved = true;
        const res = st.result;
        if (res?.status === 'blocked') {
          setQuickMsg(`⚠️ ${res.message ?? 'Instagram a bloqué temporairement cet import. Réessaie plus tard.'}`);
        } else if (res?.status === 'error' || st.successful === false) {
          setQuickMsg(`⚠️ L'import a échoué pour une raison technique. Réessaie plus tard.`);
        } else {
          setQuickMsg(`Import ${label} terminé — résultat dans « Validation ».`);
          loadResults();
        }
        break;
      }
      if (!resolved) setQuickMsg(`Import ${label} lancé — vérifie « Validation » dans un moment.`);
    } catch (err: unknown) {
      setQuickMsg(`Erreur : ${err instanceof Error ? err.message : 'Erreur'}`);
    }
    setQuickLoading(false);
  }
  async function handleTrigger(id: string, full = false) {
    if (full && !confirm("Crawl complet : re-parcourir TOUT l'historique du compte (ignore la date du dernier crawl) ? Cela peut être long et solliciter Instagram.")) return;
    setTriggeringId(id);
    try { await triggerCrawl(id, full); setSources((p) => p.map((s) => s.id === id ? { ...s, last_crawl: new Date().toISOString() } : s)); } catch { /* ignore */ }
    setTriggeringId(null);
  }
  const reloadMyRecipes = useCallback(async () => {
    if (!user?.id) return;
    setMyRecipesLoading(true);
    try { setMyRecipes(await listMyRecipes(user.id)); } catch { /* ignore */ }
    finally { setMyRecipesLoading(false); setMyRecipesLoaded(true); }
  }, [user?.id]);
  useEffect(() => {
    if (recupTab === 'recettes' && user?.id && !myRecipesLoaded) reloadMyRecipes();
  }, [recupTab, user?.id, myRecipesLoaded, reloadMyRecipes]);
  async function handleDelete(id: string) { if (!confirm('Supprimer cette source ?')) return; try { await deleteCrawlerSource(id); setSources((p) => p.filter((s) => s.id !== id)); } catch { /* ignore */ } }
  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault(); if (!srcValue.trim()) return; setSrcError(''); setSubmittingSrc(true);
    try { const body = srcType === 'web' ? { type: 'web', url: srcValue.trim(), frequency_hours: srcFreq } : { type: 'instagram', account: srcValue.trim(), frequency_hours: srcFreq }; const src = await createCrawlerSource(body); setSources((p) => [src, ...p]); setSrcValue(''); setShowForm(false); }
    catch (err: unknown) { setSrcError(err instanceof Error ? err.message : 'Erreur'); } setSubmittingSrc(false);
  }
  async function handleReject(id: string) {
    setActioningId(id);
    try { const rejected = await rejectCrawlResult(id); setResults((p) => p.filter((r) => r.id !== id)); setHistoryItems((p) => [rejected, ...p.filter((r) => r.id !== id)]); closeModal(); } catch { /* ignore */ }
    setActioningId(null);
  }
  async function handleAnalyse(id: string, currentStatus?: string) {
    setModalStep('hydrating'); setHydrateError('');
    try {
      if (currentStatus === 'rejected') { const reset = await resetCrawlResult(id); setHistoryItems((p) => p.filter((r) => r.id !== id)); setResults((p) => [reset, ...p.filter((r) => r.id !== id)]); if (modalResult) setModalResult(reset); setModalFromHistory(false); }
      const h = await hydrateResult(id); setHydrated(h); setRecipe(hydratedToCommit(h)); setModalStep('recipe');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const isTimeout = msg.toLowerCase().includes('timeout') || msg.includes('ECONNABORTED') || msg.includes('Network Error');
      setHydrateError(isTimeout ? "L'analyse prend plus de temps que prévu. Veuillez réessayer dans un instant." : msg || "Erreur lors de l'analyse");
      setModalStep('raw');
    }
  }
  async function handleCommit() {
    if (!modalResult || !recipe) return; setCommitting(true); setCommitError('');
    try { await commitResult(modalResult.id, recipe); if (modalFromHistory) setHistoryItems((p) => p.filter((r) => r.id !== modalResult.id)); else setResults((p) => p.filter((r) => r.id !== modalResult.id)); closeModal(); }
    catch (err: unknown) { setCommitError(err instanceof Error ? err.message : "Erreur lors de l'insertion"); } setCommitting(false);
  }
  function setField<K extends keyof RecipeCommitRequest>(k: K, v: RecipeCommitRequest[K]) { setRecipe((p) => p ? { ...p, [k]: v } : p); }
  function updateIngredient(idx: number, f: keyof HydratedIngredient, v: string | number) { setRecipe((p) => p ? { ...p, ingredients: p.ingredients.map((ing, i) => i === idx ? { ...ing, [f]: v } : ing) } : p); }
  function addIngredient() { setRecipe((p) => p ? { ...p, ingredients: [...p.ingredients, { name: '', quantity: 1, unit: 'g' }] } : p); }
  function removeIngredient(idx: number) { setRecipe((p) => p ? { ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) } : p); }
  function addTag(raw: string) { const t = raw.trim().toLowerCase().replace(/\s+/g, '-'); if (!t) return; setRecipe((p) => !p || p.free_tags.includes(t) ? p : { ...p, free_tags: [...p.free_tags, t] }); setTagInput(''); }
  function removeTag(t: string) { setRecipe((p) => p ? { ...p, free_tags: p.free_tags.filter((x) => x !== t) } : p); }
  function openHistoryItem(item: CrawlResultResponse) { setModalResult(item); setModalStep('raw'); setHydrateError(''); setModalFromHistory(true); }
  async function handleReimport(item: CrawlResultResponse) {
    if (!confirm(`Ré-importer « ${item.title || 'cette recette'} » depuis le cache (sans re-télécharger Instagram) ? Elle repassera en « Validation ».`)) return;
    setActioningId(item.id);
    try {
      const reset = await resetCrawlResult(item.id);
      setHistoryItems((p) => p.filter((r) => r.id !== item.id));
      setResults((p) => [reset, ...p.filter((r) => r.id !== item.id)]);
      setRecupTab('validation');
    } catch { /* ignore */ }
    setActioningId(null);
  }
  function toggleGroup(key: string) { setExpandedGroup((p) => p === key ? null : key); }
  function showMoreInGroup(key: string) { setHistoryLimits((p) => ({ ...p, [key]: (p[key] ?? 10) + 20 })); }

  // ── RBAC : droits de crawl (admin = bypass) ──
  const isAdmin = !!user?.user_admin;
  const canCrawl = (source: 'instagram' | 'web'): boolean =>
    isAdmin || !!user?.user_right?.crawl?.[source];
  // Droit distinct « import par lien unique » (≠ crawl de compte entier).
  const canUniqLink = (source: 'instagram' | 'web'): boolean =>
    isAdmin || !!user?.user_right?.uniq_link?.[source];
  const allowedCrawlTypes = (['web', 'instagram'] as const).filter((t) => canCrawl(t));
  const canAnyCrawl = canCrawl('instagram') || canCrawl('web');
  const canAnyUniqLink = canUniqLink('instagram') || canUniqLink('web');
  // Replis si les droits (chargés après coup) interdisent le filtre/sous-onglet courant.
  useEffect(() => {
    if (creationTab === 'lien' && !canAnyUniqLink) setCreationTab('manuel');
    if (!canCrawl(advancedType)) {
      const first = (['instagram', 'web'] as const).find((t) => canCrawl(t));
      if (first) setAdvancedType(first);
    }
    if ((resultTab === 'web' || resultTab === 'instagram') && !canCrawl(resultTab)) {
      setResultTab(undefined);
      loadResults(sort, undefined);
    }
    if (!canCrawl(historyType)) {
      const first = (['instagram', 'web'] as const).find((t) => canCrawl(t));
      if (first) setHistoryType(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuroraShell screen="hub" initials={user ? initials(user.email) : undefined} title="Le Hub" subtitle="Sources de contenu & validation des recettes">
      <div className="rost-page rost-hub-page">
        {/* ── Création ── */}
        <article className="rost-card">
          <div className="rost-card-head">
            <span className="rost-card-title">Importer une recette</span>
          </div>

          <div className="rost-hub-tiles">
            {([
              ...(canAnyUniqLink ? [['lien', '🔗', 'Depuis un lien', 'blog ou post Insta']] as const : []),
              ['photo', '📷', 'Depuis une photo', 'OCR / scan'],
              ['manuel', '✏️', 'À la main', 'saisie manuelle'],
            ] as const).map(([tab, icon, label, sub]) => (
              <button key={tab} type="button" className={`rost-hub-tile ${creationTab === tab ? 'is-active' : ''}`} onClick={() => setCreationTab(tab)}>
                <span className="rost-hub-tile-icon">{icon}</span>
                <span className="rost-hub-tile-label">{label}</span>
                <span className="rost-hub-tile-sub">{sub}</span>
              </button>
            ))}
          </div>

          {notifs.filter((n) => !dismissedNotifs.has(n.slug)).length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifs.filter((n) => !dismissedNotifs.has(n.slug)).slice(0, 5).map((n) => {
                const warn = n.type === 'system' || n.type === 'macro_error';
                return (
                  <div key={n.slug} className={warn ? 'rost-error' : 'rost-profil-ok'} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <span><strong>{n.title}</strong> — {n.body} <span style={{ color: 'var(--dim)' }}>· {timeSince(n.created_at)}</span></span>
                    <button type="button" aria-label="Masquer la notification" onClick={() => setDismissedNotifs((s) => new Set(s).add(n.slug))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                  </div>
                );
              })}
            </div>
          )}

          {creationTab === 'lien' && canAnyUniqLink && (
            <div style={{ marginTop: 14 }}>
              <form onSubmit={handleQuickCrawl} className="rost-hub-crawl">
                <input className="rost-form-input" type="url" placeholder="https://unblog.com/…  ou  instagram.com/p/…" value={quickUrl} onChange={(e) => setQuickUrl(e.target.value)} required />
                <button className="rost-add-btn" type="submit" disabled={quickLoading}>{quickLoading ? 'En cours…' : '▶ Importer'}</button>
              </form>
              <p className="rost-rd-text" style={{ color: 'var(--dim)', marginTop: 8 }}>
                {canUniqLink('web') && <>✓ Site/blog de recettes&nbsp;&nbsp;</>}
                {canUniqLink('instagram') && <>✓ 1 post Instagram (<code>/p/</code> ou <code>/reel/</code>)&nbsp;&nbsp;</>}
                Léger et sûr : on récupère seulement ce lien.
              </p>
              {quickMsg && <p className={quickMsg.startsWith('Erreur') || quickMsg.startsWith('⚠️') ? 'rost-error' : 'rost-profil-ok'}>{quickMsg}</p>}
            </div>
          )}

          {creationTab === 'manuel' && (
            <div style={{ marginTop: 14 }}>
              {manualSuccess && <p className="rost-profil-ok">{manualSuccess}</p>}
              <p className="rost-rd-text" style={{ color: 'var(--dim)', marginBottom: 12 }}>Créez une recette de A à Z. Les macros seront calculées automatiquement après création.</p>
              <button type="button" className="rost-add-btn" onClick={() => { setManualSuccess(''); setShowManualModal(true); }}>+ Créer une recette manuelle</button>
            </div>
          )}

          {creationTab === 'photo' && (
            <div style={{ marginTop: 14 }}>
              <p className="rost-rd-text" style={{ color: 'var(--dim)', marginBottom: 12 }}>Importez une photo ou un scan d'une recette pour l'extraire automatiquement (OCR + IA).</p>
              <button type="button" className="rost-add-btn" onClick={() => setShowScanModal(true)}>📷 Scanner une recette</button>
            </div>
          )}

          {showManualModal && (
            <AuroraRecipeCreateModal
              onClose={() => setShowManualModal(false)}
              onCreated={() => setManualSuccess('Recette créée avec succès !')}
            />
          )}

          {showScanModal && (
            <AuroraScanModal
              onClose={() => setShowScanModal(false)}
              onScanned={() => { setRecupTab('validation'); loadResults(); }}
            />
          )}

          {canAnyCrawl && (
            <details className="rost-hub-advanced">
              <summary className="rost-hub-advanced-summary">⚙ Avancé · Surveiller un compte entier</summary>
              <div className="rost-hub-warning">
                ⚠ Le crawl d'un compte entier envoie beaucoup de requêtes à Instagram et peut faire bloquer la session (rate-limit). À utiliser avec parcimonie — pour un import ponctuel, préfère « Depuis un lien ».
              </div>
              <div className="rost-pill-group" style={{ marginBottom: 12 }}>
                {(['instagram', 'web'] as const).filter((t) => canCrawl(t)).map((tab) => (
                  <button key={tab} className="rost-pill" aria-pressed={advancedType === tab} onClick={() => { setAdvancedType(tab); setShowForm(false); setSrcValue(''); setSrcError(''); }}>
                    {tab === 'instagram' ? '📸 Instagram' : '🌐 Web'}
                  </button>
                ))}
              </div>
              {(() => {
                const filteredSources = sources.filter((s) => s.type === advancedType);
                const isInstagram = advancedType === 'instagram';
                return (
                  <div>
                    <div className="rost-card-head">
                      <span className="rost-card-title">{isInstagram ? 'Comptes surveillés' : 'URLs surveillées'}</span>
                      <button className="rost-btn" onClick={() => { setShowForm((v) => !v); setSrcType(advancedType); }}>{showForm ? '✕ Annuler' : '+ Ajouter'}</button>
                    </div>
                    {showForm && (
                      <form onSubmit={handleAddSource} className="rost-inline-form">
                        <input className="rost-form-input" type={isInstagram ? 'text' : 'url'} placeholder={isInstagram ? '@compte_instagram' : 'https://...'} value={srcValue} onChange={(e) => setSrcValue(e.target.value)} required />
                        <label className="rost-form-group"><span>Fréquence</span>
                          <select className="rost-form-select" value={srcFreq} onChange={(e) => setSrcFreq(+e.target.value)}>
                            <option value={6}>Toutes les 6h</option><option value={12}>Toutes les 12h</option><option value={24}>Quotidienne</option><option value={48}>Tous les 2 jours</option><option value={168}>Hebdomadaire</option>
                          </select>
                        </label>
                        {srcError && <p className="rost-error">{srcError}</p>}
                        <button className="rost-add-btn" type="submit" disabled={submittingSrc}>{submittingSrc ? 'Ajout…' : 'Ajouter'}</button>
                      </form>
                    )}
                    {loadingSrc ? <div className="rost-skel" style={{ height: 80 }} />
                      : filteredSources.length === 0 ? <p className="rost-empty">Aucune source {isInstagram ? 'Instagram' : 'web'} configurée</p>
                      : <div className="rost-src-list">{filteredSources.map((src) => (
                        <div className="rost-src-item" key={src.id}>
                          <span className="rost-src-icon">{isInstagram ? '📸' : '🌐'}</span>
                          <div className="rost-src-info">
                            <div className="rost-src-url">{src.url}</div>
                            <div className="rost-src-meta"><span className={`rost-dot ${src.actif ? 'on' : ''}`} />{src.actif ? 'Actif' : 'Inactif'} · {src.frequency_hours}h{src.last_crawl && ` · Dernier : ${timeSince(src.last_crawl)}`}</div>
                          </div>
                          <div className="rost-src-actions">
                            <button className="rost-icon-btn" title="Lancer maintenant (nouveaux posts)" onClick={() => handleTrigger(src.id)} disabled={triggeringId === src.id}>▶</button>
                            {isInstagram && <button className="rost-icon-btn" title="Crawl complet (tout l'historique)" onClick={() => handleTrigger(src.id, true)} disabled={triggeringId === src.id}>⟳</button>}
                            <button className="rost-icon-btn" title="Supprimer" onClick={() => handleDelete(src.id)}>✕</button>
                          </div>
                        </div>))}</div>}
                  </div>
                );
              })()}
            </details>
          )}
        </article>

        {/* ── Récupération ── */}
        <article className="rost-card">
          <div className="rost-card-head">
            <span className="rost-card-title">Récupération</span>
            <div className="rost-tabbar" style={{ margin: 0, border: 'none', padding: 0 }}>
              <button className={`rost-tab ${recupTab === 'validation' ? 'is-active' : ''}`} onClick={() => setRecupTab('validation')}>Validation {results.length > 0 && <b>{results.length}</b>}</button>
              <button className={`rost-tab ${recupTab === 'historique' ? 'is-active' : ''}`} onClick={() => setRecupTab('historique')}>Historique {historyItems.length > 0 && <b>{historyItems.length}</b>}</button>
              <button className={`rost-tab ${recupTab === 'recettes' ? 'is-active' : ''}`} onClick={() => setRecupTab('recettes')}>Recettes {myRecipesLoaded && myRecipes.length > 0 && <b>{myRecipes.length}</b>}</button>
            </div>
          </div>

          {recupTab === 'validation' && (
            <>
              <div className="rost-hub-toolbar">
                <div className="rost-pill-group">
                  <button className="rost-pill" aria-pressed={sort === 'desc'} onClick={() => { setSort('desc'); loadResults('desc'); }}>↓ Récent</button>
                  <button className="rost-pill" aria-pressed={sort === 'asc'} onClick={() => { setSort('asc'); loadResults('asc'); }}>↑ Ancien</button>
                </div>
                <div className="rost-toolbar-actions">
                  <button className="rost-btn" onClick={() => setShowScanModal(true)}>📷 OCR/Scan</button>
                  <button className="rost-btn" onClick={() => loadResults()} disabled={loadingRes}>↻ Actualiser</button>
                </div>
              </div>
              <div className="rost-pill-group" style={{ marginBottom: 12 }}>
                {([undefined, ...allowedCrawlTypes] as (CrawlType | undefined)[]).map((tab) => (
                  <button key={tab ?? 'all'} className="rost-pill" aria-pressed={resultTab === tab} onClick={() => { setResultTab(tab); setInstagramAccountFilter(''); loadResults(sort, tab); }}>
                    {tab === undefined ? 'Tous' : tab === 'web' ? '🌐 Web' : '📸 Instagram'}
                  </button>
                ))}
              </div>
              {loadingRes ? <div className="rost-skel" style={{ height: 120 }} />
                : results.length === 0 ? <p className="rost-empty rost-empty-block">La file d'attente est vide — tout a été traité.</p>
                : <div className="rost-res-list">{results.filter((r) => { if ((r.type === 'web' || r.type === 'instagram') && !canCrawl(r.type)) return false; if (!instagramAccountFilter || r.type !== 'instagram') return true; const src = sources.find((s) => s.id === r.source_id); return src?.url === instagramAccountFilter; }).map((r) => (
                  <div className="rost-res-item" key={r.id}>
                    <div className="rost-res-head">
                      <TypeBadge type={r.type} />
                      <span className="rost-res-title">{r.title || 'Sans titre'}</span>
                      {r.published_at && <span className="rost-res-date">{formatDate(r.published_at)}</span>}
                      <span className="rost-res-date">{timeSince(r.created_at)}</span>
                      <button className="rost-btn" onClick={() => { setModalResult(r); setModalStep('raw'); setHydrateError(''); setModalFromHistory(false); }}>👁 Visualiser</button>
                    </div>
                    <a className="rost-hub-item-url" href={r.url_origin} target="_blank" rel="noreferrer">{r.url_origin}</a>
                    {r.raw_content && <p className="rost-res-content">{truncate(r.raw_content)}</p>}
                    {r.images.length > 0 && <div className="rost-res-thumbs">{r.images.slice(0, 3).map((img, i) => <img key={i} src={img} alt="" className="rost-res-thumb" />)}</div>}
                  </div>))}</div>}
            </>
          )}

          {recupTab === 'historique' && (
            <>
              <div className="rost-hub-toolbar">
                <div className="rost-pill-group">
                  {(['instagram', 'web'] as const).filter((t) => canCrawl(t)).map((tab) => (
                    <button key={tab} className="rost-pill" aria-pressed={historyType === tab} onClick={() => { setHistoryType(tab); setExpandedGroup(null); }}>{tab === 'web' ? '🌐 Web' : '📸 Instagram'}</button>
                  ))}
                </div>
                <button className="rost-btn" onClick={loadHistory} disabled={loadingHistory}>↻ Actualiser</button>
              </div>
              {loadingHistory ? <div className="rost-skel" style={{ height: 120 }} />
                : (() => {
                  const groups = groupBySource(historyItems, historyType, sources);
                  if (groups.length === 0) return <p className="rost-empty rost-empty-block">Aucun historique pour ce type.</p>;
                  return <div className="rost-hist-groups">{groups.map((group) => {
                    const isExpanded = expandedGroup === group.key; const limit = historyLimits[group.key] ?? 10; const shown = group.items.slice(0, limit);
                    const validCount = group.items.filter((i) => i.status === 'valid').length; const rejectedCount = group.items.filter((i) => i.status === 'rejected').length;
                    return (
                      <div className="rost-hist-group" key={group.key}>
                        <button className="rost-hist-head" onClick={() => toggleGroup(group.key)}>
                          <span className="rost-hist-label">{group.label}</span>
                          <span className="rost-hist-stats">{validCount > 0 && <span className="s-valid">✓ {validCount}</span>}{rejectedCount > 0 && <span className="s-rejected">✕ {rejectedCount}</span>}</span>
                          <span className="rost-hist-total">{group.items.length}</span>
                          <span>{isExpanded ? '▲' : '▼'}</span>
                        </button>
                        {isExpanded && (
                          <div className="rost-hist-items">
                            {shown.map((item) => (
                              <div className="rost-hist-item" key={item.id}>
                                <StatusBadge status={item.status} />
                                <span className="rost-hist-item-title">{item.title || 'Sans titre'}</span>
                                <span className="rost-res-date">{item.published_at ? formatDate(item.published_at) : formatDate(item.created_at)}</span>
                                <button className="rost-btn" onClick={() => openHistoryItem(item)}>{item.status === 'rejected' ? '+ Analyser' : 'Voir'}</button>
                                {item.status === 'valid' && <button className="rost-btn" title="Ré-importer depuis le cache (sans Instagram)" onClick={() => handleReimport(item)} disabled={actioningId === item.id}>{actioningId === item.id ? '…' : '↩︎ Ré-importer'}</button>}
                              </div>
                            ))}
                            {group.items.length > limit && <button className="rost-link-btn" onClick={() => showMoreInGroup(group.key)}>Voir {Math.min(20, group.items.length - limit)} de plus sur {group.items.length}…</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}</div>;
                })()}
            </>
          )}

          {recupTab === 'recettes' && (
            <>
              <div className="rost-hub-toolbar">
                <span className="rost-rd-text" style={{ color: 'var(--dim)' }}>Toutes tes recettes, même celles déjà intégrées.</span>
                <button className="rost-btn" onClick={reloadMyRecipes} disabled={myRecipesLoading}>↻ Actualiser</button>
              </div>
              {myRecipesLoading ? <div className="rost-skel" style={{ height: 160 }} />
                : myRecipes.length === 0 ? <p className="rost-empty rost-empty-block">Aucune recette pour le moment.</p>
                : <div className="rost-recipe-grid">{myRecipes.map((r) => (
                  <div className="rost-recipe-card" key={r.id}>
                    {r.image_thumb_url || r.image_url
                      ? <img className="rost-recipe-thumb" src={r.image_thumb_url || r.image_url || ''} alt="" loading="lazy" />
                      : <div className="rost-recipe-thumb-empty">🍽️</div>}
                    <div className="rost-recipe-body">
                      <div className="rost-recipe-title">{r.title}</div>
                      <div className="rost-recipe-meta">{r.course_type || '—'}</div>
                    </div>
                  </div>))}</div>}
            </>
          )}
        </article>
      </div>

      {/* ── MODALE 1 : post brut ── */}
      {modalResult && modalStep !== 'recipe' && (
        <div className="rost-rd-overlay" onClick={closeModal}>
          <div className="rost-rd-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="rost-rd-head">
              <div className="rost-rd-head-actions"><TypeBadge type={modalResult.type} /><span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>{modalResult.title || 'Sans titre'}</span></div>
              <button className="rost-icon-btn" onClick={closeModal}>✕</button>
            </div>
            <div className="rost-rd-body">
              {modalResult.published_at && <p className="rost-res-date">Publié le {formatDate(modalResult.published_at)}</p>}
              <a className="rost-hub-item-url" href={modalResult.url_origin} target="_blank" rel="noreferrer">{modalResult.url_origin}</a>
              {modalResult.images.length > 0 && <div className="rost-res-thumbs" style={{ marginTop: 12 }}>{modalResult.images.map((img, i) => <img key={i} src={img} alt="" className="rost-res-thumb" style={{ width: 100, height: 100 }} />)}</div>}
              {modalStep === 'hydrating' ? (
                <div className="rost-hydrating"><span className="rost-search-spin" style={{ position: 'static', width: 28, height: 28 }} /><p>Analyse en cours avec Groq…</p><p className="rost-res-date">Extraction du titre, des ingrédients et des instructions</p></div>
              ) : (
                <>
                  {hydrateError && <p className="rost-error">{hydrateError}</p>}
                  {modalResult.raw_content && <p className="rost-rd-text" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{modalResult.raw_content}</p>}
                </>
              )}
            </div>
            <div className="rost-rd-head" style={{ borderTop: '1px solid var(--rule)', borderBottom: 'none', justifyContent: 'flex-end', gap: 8 }}>
              {modalResult.status !== 'valid' && modalResult.status !== 'rejected' && (
                <button className="rost-btn rost-btn-ghost" onClick={() => handleReject(modalResult.id)} disabled={actioningId === modalResult.id || modalStep === 'hydrating'}>{actioningId === modalResult.id ? '…' : '✕ Rejeter'}</button>
              )}
              {modalResult.status !== 'valid' && (
                <button className="rost-add-btn" onClick={() => handleAnalyse(modalResult.id, modalResult.status)} disabled={modalStep === 'hydrating'}>{modalStep === 'hydrating' ? 'Analyse…' : '✦ Analyser avec l\'IA'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE 2 : recette hydratée ── */}
      {modalResult && modalStep === 'recipe' && recipe && hydrated && (
        <div className="rost-rd-overlay" onClick={closeModal}>
          <div className="rost-rd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rost-rd-head">
              <div className="rost-rd-head-actions">
                <span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>Recette détectée</span>
                {hydrated.from_cache ? <span className="rost-chip">⚡ cache</span> : <span className="rost-chip rost-chip-ghost">✦ {hydrated.groq_tokens_used} tokens</span>}
              </div>
              <button className="rost-icon-btn" onClick={closeModal}>✕</button>
            </div>
            <div className="rost-rd-body">
              {hydrated.recipe_confidence < 0.9 && <div className="rost-confidence-warn">⚠️ L'IA n'est pas sûre que ce contenu soit une recette ({Math.round(hydrated.recipe_confidence * 100)}% de confiance). Vérifiez le contenu — vous pouvez l'insérer quand même.</div>}
              <div className="rost-form">
                <label className="rost-form-group"><span>Titre</span><input className="rost-form-input" value={recipe.title} onChange={(e) => setField('title', e.target.value)} placeholder="Titre de la recette" /></label>
                <label className="rost-form-group"><span>Description</span><textarea className="rost-textarea" rows={2} value={recipe.description ?? ''} onChange={(e) => setField('description', e.target.value || null)} placeholder="Courte description…" /></label>
                <label className="rost-form-group"><span>Instructions</span><textarea className="rost-textarea" rows={5} value={recipe.instructions} onChange={(e) => setField('instructions', e.target.value)} placeholder="Étapes…" /></label>
                <div className="rost-form-grid">
                  <label className="rost-form-group"><span>Portions</span><input className="rost-form-input" type="number" min={1} value={recipe.servings} onChange={(e) => setField('servings', parseInt(e.target.value) || 1)} /></label>
                  <label className="rost-form-group"><span>Prép. (min)</span><input className="rost-form-input" type="number" min={0} value={recipe.prep_time_minutes ?? ''} onChange={(e) => setField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)} placeholder="—" /></label>
                  <label className="rost-form-group"><span>Cuisson (min)</span><input className="rost-form-input" type="number" min={0} value={recipe.cook_time_minutes ?? ''} onChange={(e) => setField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)} placeholder="—" /></label>
                </div>
                <label className="rost-form-group"><span>Type de recette</span><select className="rost-form-select" value={recipe.course_type ?? ''} onChange={(e) => setField('course_type', e.target.value || null)}><option value="">— Non défini —</option>{COURSE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <div className="rost-form-group">
                  <span>Tags</span>
                  <div className="rost-chips" style={{ marginBottom: 8 }}>{recipe.free_tags.map((t) => <span key={t} className="rost-chip">{t}<button type="button" className="rost-tag-x" onClick={() => removeTag(t)}>×</button></span>)}</div>
                  <input className="rost-form-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } if (e.key === 'Backspace' && !tagInput && recipe.free_tags.length) removeTag(recipe.free_tags[recipe.free_tags.length - 1]); }} onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} placeholder="Ajouter un tag…" />
                </div>
                <div className="rost-form-group">
                  <div className="rost-card-head" style={{ marginBottom: 6 }}><span>Ingrédients ({recipe.ingredients.length})</span><button type="button" className="rost-btn" onClick={addIngredient}>+ Ajouter</button></div>
                  {recipe.ingredients.length === 0 ? <p className="rost-empty">Aucun ingrédient détecté</p>
                    : recipe.ingredients.map((ing, idx) => (
                      <div className="rost-ing-row" key={idx}>
                        <input className="rost-form-input" placeholder="Ingrédient" value={ing.name} onChange={(e) => updateIngredient(idx, 'name', e.target.value)} />
                        <input className="rost-form-input rost-ing-qty" type="number" min={0} step="0.1" placeholder="Qté" value={ing.quantity} onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                        <input className="rost-form-input rost-ing-unit" placeholder="unité" value={ing.unit} onChange={(e) => updateIngredient(idx, 'unit', e.target.value)} />
                        <button type="button" className="rost-item-del" onClick={() => removeIngredient(idx)}>✕</button>
                      </div>
                    ))}
                </div>
                {commitError && <p className="rost-error">{commitError}</p>}
              </div>
            </div>
            <div className="rost-rd-head" style={{ borderTop: '1px solid var(--rule)', borderBottom: 'none', justifyContent: 'flex-end', gap: 8 }}>
              <button className="rost-btn rost-btn-ghost" onClick={() => { setModalStep('raw'); setCommitError(''); }} disabled={committing}>← Post</button>
              {!modalFromHistory && <button className="rost-btn rost-btn-ghost" onClick={() => handleReject(modalResult.id)} disabled={committing || actioningId === modalResult.id}>✕ Rejeter</button>}
              <button className="rost-add-btn" onClick={handleCommit} disabled={committing || !recipe.title.trim()}>{committing ? 'Insertion…' : (hydrated.recipe_confidence < 0.9 ? '✓ Insérer quand même' : '✓ Insérer la recette')}</button>
            </div>
          </div>
        </div>
      )}
    </AuroraShell>
  );
}
