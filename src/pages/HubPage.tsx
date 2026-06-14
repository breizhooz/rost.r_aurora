import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { apiErrorMessage } from '../utils/apiError';
import {
  getCrawlerSources,
  createCrawlerSource,
  deleteCrawlerSource,
  triggerCrawl,
  getCrawlerResults,
  crawlOneshot,
  rejectCrawlResult,
  resetCrawlResult,
  hydrateResult,
  commitResult,
  createRecipeManual,
  uploadRecipeImage,
  listMyRecipes,
} from '../api/endpoints';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { CrawlType } from '../types';
import type {
  CrawlSourceResponse,
  CrawlResultResponse,
  RecipeHydrated,
  RecipeCommitRequest,
  HydratedIngredient,
  RecipeResponse,
} from '../types';
import AuroraImagePicker from '../aurora/AuroraImagePicker';
import styles from './HubPage.module.css';

function useEscapeKey(callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') callback(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callback]);
}

type SourceType = 'web' | 'instagram';
type ModalStep = 'raw' | 'hydrating' | 'recipe';

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `il y a ${d}j`;
  if (h > 0) return `il y a ${h}h`;
  return 'à l\'instant';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function truncate(s: string | null, n = 200): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const COURSE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'enums.course_type.starter',   label: 'Entrée' },
  { value: 'enums.course_type.main',      label: 'Plat principal' },
  { value: 'enums.course_type.dessert',   label: 'Dessert' },
  { value: 'enums.course_type.sauce',     label: 'Sauce' },
  { value: 'enums.course_type.drink',     label: 'Boisson' },
  { value: 'enums.course_type.snack',     label: 'Snack / Apéro' },
  { value: 'enums.course_type.side_dish', label: 'Accompagnement' },
  { value: 'enums.course_type.breakfast', label: 'Petit-déjeuner' },
  { value: 'enums.course_type.soup',      label: 'Soupe' },
  { value: 'enums.course_type.salad',     label: 'Salade' },
];

function emptyRecipe(): RecipeCommitRequest {
  return {
    title: '',
    description: null,
    instructions: '',
    servings: 4,
    prep_time_minutes: null,
    cook_time_minutes: null,
    ingredients: [],
    course_type: null,
    free_tags: [],
  };
}

function hydratedToCommit(h: RecipeHydrated): RecipeCommitRequest {
  return {
    title: h.title,
    description: h.description,
    instructions: h.instructions,
    servings: h.servings,
    prep_time_minutes: h.prep_time_minutes,
    cook_time_minutes: h.cook_time_minutes,
    ingredients: h.ingredients.map(i => ({ ...i })),
    course_type: null,
    free_tags: [],
  };
}

function groupBySource(
  items: CrawlResultResponse[],
  type: 'web' | 'instagram',
  srcs: CrawlSourceResponse[],
): { key: string; label: string; items: CrawlResultResponse[] }[] {
  const map = new Map<string, CrawlResultResponse[]>();
  for (const item of items.filter(i => i.type === type)) {
    let key: string;
    if (type === 'web') {
      try { key = new URL(item.url_origin).hostname.replace(/^www\./, ''); }
      catch { key = item.url_origin; }
    } else {
      const src = srcs.find(s => s.id === item.source_id);
      key = src ? src.url.replace(/^@/, '') : 'oneshot';
    }
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([key, its]) => ({
      key,
      label: type === 'instagram' ? `@${key}` : key,
      items: its.sort((a, b) => {
        const da = a.published_at ?? a.created_at;
        const db = b.published_at ?? b.created_at;
        return new Date(db).getTime() - new Date(da).getTime();
      }),
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

export default function HubPage() {
  const [sources,       setSources]       = useState<CrawlSourceResponse[]>([]);
  const [results,       setResults]       = useState<CrawlResultResponse[]>([]);
  const [loadingSrc,    setLoadingSrc]    = useState(true);
  const [loadingRes,    setLoadingRes]    = useState(true);
  const [triggeringId,  setTriggeringId]  = useState<string | null>(null);
  const [actioningId,   setActioningId]   = useState<string | null>(null);
  const [sort,          setSort]          = useState<'asc' | 'desc'>('desc');
  const [resultTab,     setResultTab]     = useState<CrawlType | undefined>(undefined);
  const [instagramAccountFilter, setInstagramAccountFilter] = useState<string>('');

  // Création tab
  const [creationTab, setCreationTab] = useState<'lien' | 'photo' | 'manuel'>('lien');
  const [advancedType, setAdvancedType] = useState<'instagram' | 'web'>('instagram');

  // Manuel form
  const [manualRecipe,     setManualRecipe]     = useState<RecipeCommitRequest>(emptyRecipe());
  const [manualTagInput,   setManualTagInput]   = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError,      setManualError]      = useState('');
  const [manualSuccess,    setManualSuccess]    = useState('');
  const [manualImageFile,  setManualImageFile]  = useState<File | null>(null);
  const [manualImagePreview, setManualImagePreview] = useState<string | null>(null);
  const [manualCreated,    setManualCreated]    = useState<RecipeResponse | null>(null);

  // Récupération tab
  const [recupTab, setRecupTab] = useState<'validation' | 'historique' | 'recettes'>('validation');
  const { user } = useCurrentUser();
  const [myRecipes, setMyRecipes] = useState<RecipeResponse[]>([]);
  const [myRecipesLoading, setMyRecipesLoading] = useState(false);
  const [myRecipesLoaded, setMyRecipesLoaded] = useState(false);

  // History
  const [historyItems,    setHistoryItems]    = useState<CrawlResultResponse[]>([]);
  const [loadingHistory,  setLoadingHistory]  = useState(true);
  const [historyType,     setHistoryType]     = useState<'web' | 'instagram'>('instagram');
  const [expandedGroup,   setExpandedGroup]   = useState<string | null>(null);
  const [historyLimits,   setHistoryLimits]   = useState<Record<string, number>>({});

  // Modal state
  const [modalResult,     setModalResult]     = useState<CrawlResultResponse | null>(null);
  const [modalStep,       setModalStep]       = useState<ModalStep>('raw');
  const [modalFromHistory,setModalFromHistory]= useState(false);
  const [hydrateError,    setHydrateError]    = useState('');
  const [hydrated,        setHydrated]        = useState<RecipeHydrated | null>(null);
  const [recipe,          setRecipe]          = useState<RecipeCommitRequest | null>(null);
  const [committing,      setCommitting]      = useState(false);
  const [commitError,     setCommitError]     = useState('');
  const [tagInput,        setTagInput]        = useState('');

  const closeModal = useCallback(() => {
    setModalResult(null);
    setModalStep('raw');
    setHydrated(null);
    setRecipe(null);
    setHydrateError('');
    setCommitError('');
    setTagInput('');
    setModalFromHistory(false);
  }, []);

  useEscapeKey(closeModal);

  // New source form
  const [showForm,      setShowForm]      = useState(false);
  const [srcType,       setSrcType]       = useState<SourceType>('web');
  const [srcValue,      setSrcValue]      = useState('');
  const [srcFreq,       setSrcFreq]       = useState(24);
  const [submittingSrc, setSubmittingSrc] = useState(false);
  const [srcError,      setSrcError]      = useState('');

  // Quick crawl
  const [quickUrl,      setQuickUrl]      = useState('');
  const [quickLoading,  setQuickLoading]  = useState(false);
  const [quickMsg,      setQuickMsg]      = useState('');

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualRecipe.title.trim()) return;
    setManualSubmitting(true);
    setManualError('');
    setManualSuccess('');
    try {
      const created = await createRecipeManual({
        title: manualRecipe.title,
        description: manualRecipe.description,
        instructions: manualRecipe.instructions,
        servings: manualRecipe.servings,
        prep_time_minutes: manualRecipe.prep_time_minutes,
        cook_time_minutes: manualRecipe.cook_time_minutes,
        course_type: manualRecipe.course_type,
        free_tags: manualRecipe.free_tags,
        ingredients: manualRecipe.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      let finalRecipe = created;
      if (manualImageFile) {
        try { finalRecipe = await uploadRecipeImage(created.id, manualImageFile); } catch { /* non-bloquant */ }
      }
      setManualSuccess('Recette créée avec succès !');
      setManualCreated(finalRecipe);
      setManualRecipe(emptyRecipe());
      setManualTagInput('');
      setManualImageFile(null);
      setManualImagePreview(null);
    } catch (err: unknown) {
      setManualError(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur lors de la création'));
    }
    setManualSubmitting(false);
  }

  function handleManualImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setManualImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setManualImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setManualImagePreview(null);
    }
  }

  function setManualField<K extends keyof RecipeCommitRequest>(key: K, value: RecipeCommitRequest[K]) {
    setManualRecipe(prev => ({ ...prev, [key]: value }));
  }

  function addManualIngredient() {
    setManualRecipe(prev => ({ ...prev, ingredients: [...prev.ingredients, { name: '', quantity: 1, unit: 'g' }] }));
  }

  function updateManualIngredient(idx: number, field: keyof HydratedIngredient, value: string | number) {
    setManualRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing),
    }));
  }

  function removeManualIngredient(idx: number) {
    setManualRecipe(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }));
  }

  function addManualTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) return;
    setManualRecipe(prev => {
      if (prev.free_tags.includes(tag)) return prev;
      return { ...prev, free_tags: [...prev.free_tags, tag] };
    });
    setManualTagInput('');
  }

  function removeManualTag(tag: string) {
    setManualRecipe(prev => ({ ...prev, free_tags: prev.free_tags.filter(t => t !== tag) }));
  }

  const loadSources = useCallback(async () => {
    setLoadingSrc(true);
    try { setSources(await getCrawlerSources()); } catch { setSources([]); }
    setLoadingSrc(false);
  }, []);

  const loadResults = useCallback(async (currentSort: 'asc' | 'desc' = sort, tab: CrawlType | undefined = resultTab) => {
    setLoadingRes(true);
    try {
      const r = await getCrawlerResults('waiting', 1, 100, currentSort, tab);
      setResults(r.items);
    } catch { setResults([]); }
    setLoadingRes(false);
  }, [sort, resultTab]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [valid, rejected] = await Promise.all([
        getCrawlerResults('valid',    1, 200, 'desc'),
        getCrawlerResults('rejected', 1, 200, 'desc'),
      ]);
      setHistoryItems([...valid.items, ...rejected.items]);
    } catch { setHistoryItems([]); }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadSources();
    loadResults();
    loadHistory();
  }, [loadSources, loadResults, loadHistory]);

  async function handleQuickCrawl(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setQuickLoading(true);
    setQuickMsg('');
    try {
      await crawlOneshot(quickUrl.trim());
      setQuickMsg('Crawl lancé — résultat disponible dans la file d\'attente sous 30s.');
      setQuickUrl('');
    } catch (err: unknown) {
      setQuickMsg(`Erreur : ${apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')}`);
    }
    setQuickLoading(false);
  }

  const reloadMyRecipes = useCallback(async () => {
    if (!user?.id) return;
    setMyRecipesLoading(true);
    try { setMyRecipes(await listMyRecipes(user.id)); }
    catch { /* ignore */ }
    finally { setMyRecipesLoading(false); setMyRecipesLoaded(true); }
  }, [user?.id]);

  // Charge mes recettes (toutes, y compris intégrées) à la 1re ouverture de l'onglet.
  useEffect(() => {
    if (recupTab === 'recettes' && user?.id && !myRecipesLoaded) reloadMyRecipes();
  }, [recupTab, user?.id, myRecipesLoaded, reloadMyRecipes]);

  async function handleTrigger(id: string, full = false) {
    if (full && !confirm("Crawl complet : re-parcourir TOUT l'historique du compte (ignore la date du dernier crawl) ? Cela peut être long et solliciter Instagram.")) return;
    setTriggeringId(id);
    try {
      await triggerCrawl(id, full);
      setSources(prev => prev.map(s => s.id === id ? { ...s, last_crawl: new Date().toISOString() } : s));
    } catch { /* ignore */ }
    setTriggeringId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette source ?')) return;
    try {
      await deleteCrawlerSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
    } catch { /* ignore */ }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    if (!srcValue.trim()) return;
    setSrcError('');
    setSubmittingSrc(true);
    try {
      const body = srcType === 'web'
        ? { type: 'web',       url:     srcValue.trim(), frequency_hours: srcFreq }
        : { type: 'instagram', account: srcValue.trim(), frequency_hours: srcFreq };
      const src = await createCrawlerSource(body);
      setSources(prev => [src, ...prev]);
      setSrcValue('');
      setShowForm(false);
    } catch (err: unknown) {
      setSrcError(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur'));
    }
    setSubmittingSrc(false);
  }

  async function handleReject(id: string) {
    setActioningId(id);
    try {
      const rejected = await rejectCrawlResult(id);
      setResults(prev => prev.filter(r => r.id !== id));
      setHistoryItems(prev => [rejected, ...prev.filter(r => r.id !== id)]);
      closeModal();
    } catch { /* ignore */ }
    setActioningId(null);
  }

  async function handleAnalyse(id: string, currentStatus?: string) {
    setModalStep('hydrating');
    setHydrateError('');
    try {
      if (currentStatus === 'rejected') {
        const reset = await resetCrawlResult(id);
        setHistoryItems(prev => prev.filter(r => r.id !== id));
        setResults(prev => [reset, ...prev.filter(r => r.id !== id)]);
        if (modalResult) setModalResult(reset);
        setModalFromHistory(false);
      }
      const h = await hydrateResult(id);
      setHydrated(h);
      setRecipe(hydratedToCommit(h));
      setModalStep('recipe');
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, err instanceof Error ? err.message : '');
      const isTimeout = msg.toLowerCase().includes('timeout') || msg.includes('ECONNABORTED') || msg.includes('Network Error');
      setHydrateError(
        isTimeout
          ? "L'analyse prend plus de temps que prévu. Veuillez réessayer dans un instant."
          : msg || "Erreur lors de l'analyse"
      );
      setModalStep('raw');
    }
  }

  async function handleCommit() {
    if (!modalResult || !recipe) return;
    setCommitting(true);
    setCommitError('');
    try {
      await commitResult(modalResult.id, recipe);
      if (modalFromHistory) {
        setHistoryItems(prev => prev.filter(r => r.id !== modalResult.id));
      } else {
        setResults(prev => prev.filter(r => r.id !== modalResult.id));
      }
      closeModal();
    } catch (err: unknown) {
      setCommitError(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur lors de l\'insertion'));
    }
    setCommitting(false);
  }

  // ── Recipe form helpers ──────────────────────────────────────────────────────

  function setField<K extends keyof RecipeCommitRequest>(key: K, value: RecipeCommitRequest[K]) {
    setRecipe(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function updateIngredient(idx: number, field: keyof HydratedIngredient, value: string | number) {
    setRecipe(prev => {
      if (!prev) return prev;
      const ingredients = prev.ingredients.map((ing, i) =>
        i === idx ? { ...ing, [field]: value } : ing
      );
      return { ...prev, ingredients };
    });
  }

  function addIngredient() {
    setRecipe(prev => prev ? {
      ...prev,
      ingredients: [...prev.ingredients, { name: '', quantity: 1, unit: 'g' }],
    } : prev);
  }

  function removeIngredient(idx: number) {
    setRecipe(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx),
    } : prev);
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) return;
    setRecipe(prev => {
      if (!prev || prev.free_tags.includes(tag)) return prev;
      return { ...prev, free_tags: [...prev.free_tags, tag] };
    });
    setTagInput('');
  }

  function removeTag(tag: string) {
    setRecipe(prev => prev ? { ...prev, free_tags: prev.free_tags.filter(t => t !== tag) } : prev);
  }

  // ── History helpers ──────────────────────────────────────────────────────────

  function openHistoryItem(item: CrawlResultResponse) {
    setModalResult(item);
    setModalStep('raw');
    setHydrateError('');
    setModalFromHistory(true);
  }

  function toggleGroup(key: string) {
    setExpandedGroup(prev => prev === key ? null : key);
  }

  function showMoreInGroup(key: string) {
    setHistoryLimits(prev => ({ ...prev, [key]: (prev[key] ?? 10) + 20 }));
  }

  return (
    <Layout>
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1>Le Hub</h1>
          <p>Gestion des sources de contenu et validation des recettes crawlées</p>
        </div>

        <div className={styles.grid}>

          {/* ── Création ── */}
          <div className={`${styles.card} ${styles.cardFull}`}>
            <div className={styles.recupHeader}>
              <span className={styles.recupTitle}>Importer une recette</span>
            </div>

            <div className={styles.importTiles}>
              {([
                ['lien', '🔗', 'Depuis un lien', 'blog ou post Insta'],
                ['photo', '📷', 'Depuis une photo', 'OCR'],
                ['manuel', '✏️', 'À la main', 'saisie manuelle'],
              ] as const).map(([tab, icon, label, sub]) => (
                <button key={tab} type="button"
                  className={`${styles.importTile} ${creationTab === tab ? styles.importTileActive : ''}`}
                  onClick={() => setCreationTab(tab)}>
                  <span className={styles.importTileIcon}>{icon}</span>
                  <span className={styles.importTileLabel}>{label}</span>
                  <span className={styles.importTileSub}>{sub}</span>
                </button>
              ))}
            </div>

            {/* Lien — oneshot : page web OU post Instagram (routage auto côté serveur) */}
            {creationTab === 'lien' && (
              <div>
                <form onSubmit={handleQuickCrawl} className={styles.quickForm}>
                  <input className={styles.input} type="url"
                    placeholder="https://unblog.com/…  ou  instagram.com/p/…"
                    value={quickUrl} onChange={e => setQuickUrl(e.target.value)} required />
                  <button className={styles.btnPrimary} type="submit" disabled={quickLoading}>
                    {quickLoading ? <span className={styles.spinner} /> : <PlaySvg />}
                    {quickLoading ? 'En cours…' : 'Importer'}
                  </button>
                </form>
                <p className={styles.lienHelper}>
                  ✓ Site/blog de recettes&nbsp;&nbsp;✓ 1 post Instagram (<code>/p/</code> ou <code>/reel/</code>).
                  Léger et sûr : on récupère seulement ce lien.
                </p>
                {quickMsg && (
                  <p className={`${styles.msg} ${quickMsg.startsWith('Erreur') ? styles.msgErr : styles.msgOk}`}>
                    {quickMsg}
                  </p>
                )}
              </div>
            )}

            {/* Photo (OCR) — emplacement prévu */}
            {creationTab === 'photo' && (
              <div className={styles.photoSoon}>
                📷 Import par photo (OCR) — bientôt disponible ici.
              </div>
            )}

            {/* Manuel */}
            {creationTab === 'manuel' && (
              <form onSubmit={handleManualSubmit} className={styles.manualLayout}>
                {/* ── Colonne principale ── */}
                <div className={styles.manualMain}>
                  {manualSuccess && (
                    <p className={`${styles.msg} ${styles.msgOk}`}>{manualSuccess}</p>
                  )}
                  {manualCreated && (
                    <div className="aurora-root" style={{ margin: '4px 0 14px' }}>
                      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
                        Choisis une image pour « {manualCreated.title} » (optionnel) :
                      </p>
                      <AuroraImagePicker recipe={manualCreated} onChange={setManualCreated} />
                      <button type="button" className="rost-btn rost-btn-ghost" style={{ marginTop: 8 }} onClick={() => setManualCreated(null)}>
                        ✓ Terminer
                      </button>
                    </div>
                  )}

                  <div className={styles.recipeField}>
                    <label className={styles.recipeLabel}>Titre <span style={{ color: 'var(--accent)' }}>*</span></label>
                    <input className={styles.recipeInput} value={manualRecipe.title}
                      onChange={e => setManualField('title', e.target.value)} placeholder="Titre de la recette" required />
                  </div>

                  <div className={styles.recipeField}>
                    <label className={styles.recipeLabel}>Description <span className={styles.optional}>optionnel</span></label>
                    <textarea className={styles.recipeTextarea} rows={2}
                      value={manualRecipe.description ?? ''}
                      onChange={e => setManualField('description', e.target.value || null)}
                      placeholder="Courte description…" />
                  </div>

                  <div className={styles.recipeField}>
                    <label className={styles.recipeLabel}>Instructions</label>
                    <textarea className={styles.recipeTextarea} rows={7}
                      value={manualRecipe.instructions}
                      onChange={e => setManualField('instructions', e.target.value)}
                      placeholder="Étapes de préparation…" />
                  </div>

                  <div className={styles.recipeField}>
                    <div className={styles.ingredientsHeader}>
                      <label className={styles.recipeLabel} style={{ marginBottom: 0 }}>
                        Ingrédients <span className={styles.ingredientCount}>{manualRecipe.ingredients.length}</span>
                      </label>
                      <button type="button" className={styles.addIngredientBtn} onClick={addManualIngredient}>+ Ajouter</button>
                    </div>
                    <p className={styles.hint} style={{ marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                      Les macros seront calculées automatiquement après création.
                    </p>
                    <div className={styles.ingredientList}>
                      {manualRecipe.ingredients.length === 0 ? (
                        <p className={styles.empty} style={{ padding: '0.5rem 0', fontSize: '0.78rem' }}>Aucun ingrédient</p>
                      ) : (
                        manualRecipe.ingredients.map((ing, idx) => (
                          <div className={styles.ingredientRow} key={idx}>
                            <input className={styles.ingName} placeholder="Ingrédient"
                              value={ing.name} onChange={e => updateManualIngredient(idx, 'name', e.target.value)} />
                            <input className={styles.ingQty} type="number" min={0} step="0.1" placeholder="Qté"
                              value={ing.quantity} onChange={e => updateManualIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                            <input className={styles.ingUnit} placeholder="unité"
                              value={ing.unit} onChange={e => updateManualIngredient(idx, 'unit', e.target.value)} />
                            <button type="button" className={styles.removeIngBtn} onClick={() => removeManualIngredient(idx)}>
                              <TrashSvg />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {manualError && <p className={`${styles.msg} ${styles.msgErr}`}>{manualError}</p>}

                  <div style={{ marginTop: '0.75rem' }}>
                    <button className={styles.btnCommit} type="submit"
                      disabled={manualSubmitting || !manualRecipe.title.trim()}>
                      {manualSubmitting ? <><span className={styles.spinner} /> Création…</> : '✓ Créer la recette'}
                    </button>
                  </div>
                </div>

                {/* ── Sidebar ── */}
                <aside className={styles.manualSidebar}>

                  {/* Image */}
                  <div className={styles.sideSection}>
                    <div className={styles.sideSectionLabel}>Photo</div>
                    <label className={styles.imageUpload}>
                      {manualImagePreview ? (
                        <img src={manualImagePreview} alt="preview" className={styles.imagePreview} />
                      ) : (
                        <div className={styles.imagePlaceholder}>
                          <span className={styles.imagePlaceholderIcon}>📷</span>
                          <span className={styles.imagePlaceholderText}>Ajouter une photo</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className={styles.imageInput}
                        onChange={handleManualImageChange} />
                    </label>
                    {manualImageFile && (
                      <button type="button" className={styles.removeImageBtn}
                        onClick={() => { setManualImageFile(null); setManualImagePreview(null); }}>
                        ✕ Supprimer
                      </button>
                    )}
                  </div>

                  {/* Timings */}
                  <div className={styles.sideSection}>
                    <div className={styles.sideSectionLabel}>Informations</div>
                    <div className={styles.infoList}>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Portions</span>
                        <input className={styles.inputSmall} type="number" min={1}
                          value={manualRecipe.servings}
                          onChange={e => setManualField('servings', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Prép. (min)</span>
                        <input className={styles.inputSmall} type="number" min={0}
                          value={manualRecipe.prep_time_minutes ?? ''}
                          onChange={e => setManualField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="—" />
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Cuisson (min)</span>
                        <input className={styles.inputSmall} type="number" min={0}
                          value={manualRecipe.cook_time_minutes ?? ''}
                          onChange={e => setManualField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="—" />
                      </div>
                    </div>
                  </div>

                  {/* Classification */}
                  <div className={styles.sideSection}>
                    <div className={styles.sideSectionLabel}>Classification</div>
                    <select className={styles.select}
                      value={manualRecipe.course_type ?? ''}
                      onChange={e => setManualField('course_type', e.target.value || null)}>
                      <option value="">— Non défini —</option>
                      {COURSE_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tags */}
                  <div className={styles.sideSection}>
                    <div className={styles.sideSectionLabel}>Tags</div>
                    <div className={styles.tagChips}>
                      {manualRecipe.free_tags.map(tag => (
                        <span key={tag} className={styles.tagChip}>
                          {tag}<button type="button" className={styles.tagChipRemove} onClick={() => removeManualTag(tag)}>×</button>
                        </span>
                      ))}
                    </div>
                    <input className={styles.recipeInput} value={manualTagInput}
                      onChange={e => setManualTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addManualTag(manualTagInput); }
                        if (e.key === 'Backspace' && !manualTagInput && manualRecipe.free_tags.length > 0)
                          removeManualTag(manualRecipe.free_tags[manualRecipe.free_tags.length - 1]);
                      }}
                      onBlur={() => { if (manualTagInput.trim()) addManualTag(manualTagInput); }}
                      placeholder="Ajouter un tag…" />
                  </div>

                </aside>
              </form>
            )}

          </div>

          {/* ── Avancé · Surveiller un compte entier ── */}
          <details className={`${styles.card} ${styles.cardFull}`}>
            <summary className={styles.advancedSummary}>⚙ Avancé · Surveiller un compte entier</summary>
            <div className={styles.warningBanner}>
              ⚠ Le crawl d'un compte entier envoie beaucoup de requêtes à Instagram et peut
              faire bloquer la session (rate-limit). À utiliser avec parcimonie — pour
              importer ponctuellement, préfère « Depuis un lien ».
            </div>
            <div className={styles.recupTabs}>
              {(['instagram', 'web'] as const).map(tab => (
                <button key={tab} type="button"
                  className={`${styles.recupTab} ${advancedType === tab ? styles.recupTabActive : ''}`}
                  onClick={() => { setAdvancedType(tab); setShowForm(false); setSrcValue(''); setSrcError(''); }}>
                  {tab === 'instagram' ? <><InstagramSvg /> Instagram</> : <><GlobeSvg /> Web</>}
                </button>
              ))}
            </div>
            {(() => {
              const filteredSources = sources.filter(s => s.type === advancedType);
              const isInstagram = advancedType === 'instagram';
              return (
                <>
                  <div className={styles.sectionLabel} style={{ marginTop: '1.25rem' }}>
                    {isInstagram ? 'Comptes surveillés' : 'URLs surveillées'}
                    <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setSrcType(advancedType); }}>
                      {showForm ? '✕ Annuler' : '+ Ajouter'}
                    </button>
                  </div>

                  {showForm && (
                    <form onSubmit={handleAddSource} className={styles.sourceForm}>
                      <input className={styles.input}
                        type={isInstagram ? 'text' : 'url'}
                        placeholder={isInstagram ? '@compte_instagram' : 'https://...'}
                        value={srcValue} onChange={e => setSrcValue(e.target.value)} required />
                      <div className={styles.formRow}>
                        <label className={styles.formLabel}>Fréquence</label>
                        <select className={styles.select} value={srcFreq} onChange={e => setSrcFreq(+e.target.value)}>
                          <option value={6}>Toutes les 6h</option>
                          <option value={12}>Toutes les 12h</option>
                          <option value={24}>Quotidienne</option>
                          <option value={48}>Tous les 2 jours</option>
                          <option value={168}>Hebdomadaire</option>
                        </select>
                      </div>
                      {srcError && <p className={`${styles.msg} ${styles.msgErr}`}>{srcError}</p>}
                      <button className={styles.btnPrimary} type="submit" disabled={submittingSrc}>
                        {submittingSrc ? 'Ajout…' : 'Ajouter'}
                      </button>
                    </form>
                  )}

                  {loadingSrc ? (
                    <div className={styles.sourceList}>
                      {[1, 2].map(i => <Skeleton key={i} height="60px" style={{ borderRadius: 8 }} />)}
                    </div>
                  ) : filteredSources.length === 0 ? (
                    <p className={styles.empty}>Aucune source {isInstagram ? 'Instagram' : 'web'} configurée</p>
                  ) : (
                    <div className={styles.sourceList}>
                      {filteredSources.map(src => (
                        <div className={styles.sourceItem} key={src.id}>
                          <div className={styles.sourceIcon}>{isInstagram ? '📸' : '🌐'}</div>
                          <div className={styles.sourceInfo}>
                            <div className={styles.sourceUrl}>{src.url}</div>
                            <div className={styles.sourceMeta}>
                              <span className={src.actif ? styles.activeDot : styles.inactiveDot} />
                              {src.actif ? 'Actif' : 'Inactif'} · {src.frequency_hours}h
                              {src.last_crawl && ` · Dernier : ${timeSince(src.last_crawl)}`}
                            </div>
                          </div>
                          <div className={styles.sourceActions}>
                            <button className={styles.iconBtn} title="Lancer maintenant (nouveaux posts)"
                              onClick={() => handleTrigger(src.id)} disabled={triggeringId === src.id}>
                              {triggeringId === src.id ? <span className={styles.spinner} /> : <PlaySvg />}
                            </button>
                            {isInstagram && (
                              <button className={styles.iconBtn} title="Crawl complet (tout l'historique)"
                                onClick={() => handleTrigger(src.id, true)} disabled={triggeringId === src.id}>
                                ⟳
                              </button>
                            )}
                            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Supprimer"
                              onClick={() => handleDelete(src.id)}>
                              <TrashSvg />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </details>

          {/* ── Récupération (Validation + Historique) ── */}
          <div className={`${styles.card} ${styles.cardFull}`}>
            <div className={styles.recupHeader}>
              <span className={styles.recupTitle}>Récupération</span>
              <div className={styles.recupTabs}>
                <button
                  className={`${styles.recupTab} ${recupTab === 'validation' ? styles.recupTabActive : ''}`}
                  onClick={() => setRecupTab('validation')}
                >
                  Validation
                  {results.length > 0 && <span className={styles.recupBadge}>{results.length}</span>}
                </button>
                <button
                  className={`${styles.recupTab} ${recupTab === 'historique' ? styles.recupTabActive : ''}`}
                  onClick={() => setRecupTab('historique')}
                >
                  Historique
                  {historyItems.length > 0 && <span className={styles.recupBadge}>{historyItems.length}</span>}
                </button>
                <button
                  className={`${styles.recupTab} ${recupTab === 'recettes' ? styles.recupTabActive : ''}`}
                  onClick={() => setRecupTab('recettes')}
                >
                  Recettes
                  {myRecipesLoaded && myRecipes.length > 0 && <span className={styles.recupBadge}>{myRecipes.length}</span>}
                </button>
              </div>
            </div>

            {/* ── Validation ── */}
            {recupTab === 'validation' && (
              <>
                <div className={styles.sectionLabel} style={{ marginTop: '1rem' }}>
                  <div className={styles.sortToggle}>
                    <button className={`${styles.sortBtn} ${sort === 'desc' ? styles.sortBtnActive : ''}`}
                      onClick={() => { setSort('desc'); loadResults('desc'); }}>
                      <SortDescSvg /> Récent
                    </button>
                    <button className={`${styles.sortBtn} ${sort === 'asc' ? styles.sortBtnActive : ''}`}
                      onClick={() => { setSort('asc'); loadResults('asc'); }}>
                      <SortAscSvg /> Ancien
                    </button>
                  </div>
                  <button className={styles.refreshBtn} onClick={() => loadResults()} disabled={loadingRes}>
                    <RefreshSvg /> Actualiser
                  </button>
                </div>

                <div className={styles.typeTabs}>
                  {([undefined, 'web', 'instagram'] as (CrawlType | undefined)[]).map(tab => (
                    <button
                      key={tab ?? 'all'}
                      className={`${styles.typeTab} ${resultTab === tab ? styles.typeTabActive : ''}`}
                      onClick={() => { setResultTab(tab); setInstagramAccountFilter(''); loadResults(sort, tab); }}
                    >
                      {tab === undefined && 'Tous'}
                      {tab === 'web' && <><GlobeSvg /> Web</>}
                      {tab === 'instagram' && <><InstagramSvg /> Instagram</>}
                    </button>
                  ))}
                </div>

                {resultTab === 'instagram' && (() => {
                  const accounts = Array.from(new Set(
                    results
                      .filter(r => r.type === 'instagram')
                      .map(r => {
                        const src = sources.find(s => s.id === r.source_id);
                        return src ? src.url : null;
                      })
                      .filter((a): a is string => a !== null)
                  ));
                  if (accounts.length <= 1) return null;
                  return (
                    <select
                      className={styles.accountSelect}
                      value={instagramAccountFilter}
                      onChange={e => setInstagramAccountFilter(e.target.value)}
                    >
                      <option value="">Tous les comptes</option>
                      {accounts.map(acc => (
                        <option key={acc} value={acc}>{acc}</option>
                      ))}
                    </select>
                  );
                })()}

                {loadingRes ? (
                  <div className={styles.resultList}>
                    {[1, 2].map(i => <Skeleton key={i} height="120px" style={{ borderRadius: 10, marginBottom: '0.75rem' }} />)}
                  </div>
                ) : results.length === 0 ? (
                  <p className={styles.empty}>La file d'attente est vide — tous les résultats ont été traités.</p>
                ) : (
                  <div className={styles.resultList}>
                    {results
                      .filter(r => {
                        if (!instagramAccountFilter || r.type !== 'instagram') return true;
                        const src = sources.find(s => s.id === r.source_id);
                        return src?.url === instagramAccountFilter;
                      })
                      .map(r => (
                      <div className={styles.resultItem} key={r.id}>
                        <div className={styles.resultHeader}>
                          <TypeBadge type={r.type} />
                          <span className={styles.resultTitle}>{r.title || 'Sans titre'}</span>
                          {r.published_at && (
                            <span className={styles.resultDate} title="Date du post">{formatDate(r.published_at)}</span>
                          )}
                          <span className={styles.resultDate} title="Crawlé">{timeSince(r.created_at)}</span>
                          <button className={styles.reviewBtn}
                            onClick={() => { setModalResult(r); setModalStep('raw'); setHydrateError(''); setModalFromHistory(false); }}>
                            <ReviewSvg /> Visualiser
                          </button>
                        </div>
                        <a className={styles.resultUrl} href={r.url_origin} target="_blank" rel="noopener noreferrer">
                          {r.url_origin}
                        </a>
                        {r.raw_content && (
                          <p className={styles.resultContent}>{truncate(r.raw_content)}</p>
                        )}
                        {r.images.length > 0 && (
                          <div className={styles.resultImages}>
                            {r.images.slice(0, 3).map((img, i) => (
                              <img key={i} src={img} alt="" className={styles.resultThumb} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Historique ── */}
            {recupTab === 'historique' && (
              <>
                <div className={styles.sectionLabel} style={{ marginTop: '1rem' }}>
                  <button className={styles.refreshBtn} onClick={loadHistory} disabled={loadingHistory}>
                    <RefreshSvg /> Actualiser
                  </button>
                </div>

                <div className={styles.typeTabs}>
                  {(['instagram', 'web'] as const).map(tab => (
                    <button
                      key={tab}
                      className={`${styles.typeTab} ${historyType === tab ? styles.typeTabActive : ''}`}
                      onClick={() => { setHistoryType(tab); setExpandedGroup(null); }}
                    >
                      {tab === 'web' ? <><GlobeSvg /> Web</> : <><InstagramSvg /> Instagram</>}
                    </button>
                  ))}
                </div>

                {loadingHistory ? (
                  <div className={styles.resultList}>
                    {[1, 2, 3].map(i => <Skeleton key={i} height="48px" style={{ borderRadius: 8, marginBottom: '0.4rem' }} />)}
                  </div>
                ) : (() => {
                  const groups = groupBySource(historyItems, historyType, sources);
                  if (groups.length === 0) {
                    return <p className={styles.empty}>Aucun historique pour ce type.</p>;
                  }
                  return (
                    <div className={styles.historyGroups}>
                      {groups.map(group => {
                        const isExpanded = expandedGroup === group.key;
                        const limit = historyLimits[group.key] ?? 10;
                        const shown = group.items.slice(0, limit);
                        const validCount    = group.items.filter(i => i.status === 'valid').length;
                        const rejectedCount = group.items.filter(i => i.status === 'rejected').length;
                        return (
                          <div key={group.key} className={styles.historyGroup}>
                            <button className={styles.historyGroupHeader} onClick={() => toggleGroup(group.key)}>
                              <span className={styles.historyGroupLabel}>{group.label}</span>
                              <span className={styles.historyGroupStats}>
                                {validCount > 0 && <span className={styles.statValid}>✓ {validCount}</span>}
                                {rejectedCount > 0 && <span className={styles.statRejected}>✕ {rejectedCount}</span>}
                              </span>
                              <span className={styles.historyGroupTotal}>{group.items.length}</span>
                              <span className={styles.historyChevron}>{isExpanded ? '▲' : '▼'}</span>
                            </button>
                            {isExpanded && (
                              <div className={styles.historyGroupItems}>
                                {shown.map(item => (
                                  <div key={item.id} className={styles.historyItem}>
                                    <StatusBadge status={item.status} />
                                    <span className={styles.historyItemTitle}>{item.title || 'Sans titre'}</span>
                                    <span className={styles.historyItemDate}>
                                      {item.published_at ? formatDate(item.published_at) : formatDate(item.created_at)}
                                    </span>
                                    <button className={styles.historyViewBtn} onClick={() => openHistoryItem(item)}>
                                      {item.status === 'rejected' ? '+ Analyser' : 'Voir'}
                                    </button>
                                  </div>
                                ))}
                                {group.items.length > limit && (
                                  <button className={styles.showMoreBtn} onClick={() => showMoreInGroup(group.key)}>
                                    Voir {Math.min(20, group.items.length - limit)} de plus sur {group.items.length}…
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}

            {/* ── Recettes (toutes, y compris intégrées) ── */}
            {recupTab === 'recettes' && (
              <>
                <div className={styles.sectionLabel} style={{ marginTop: '1rem' }}>
                  <span className={styles.hint}>Toutes tes recettes, même celles déjà intégrées.</span>
                  <button className={styles.refreshBtn} onClick={reloadMyRecipes} disabled={myRecipesLoading}>
                    <RefreshSvg /> Actualiser
                  </button>
                </div>
                {myRecipesLoading ? (
                  <div className={styles.recipeGrid}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height="150px" style={{ borderRadius: 10 }} />)}
                  </div>
                ) : myRecipes.length === 0 ? (
                  <p className={styles.empty}>Aucune recette pour le moment.</p>
                ) : (
                  <div className={styles.recipeGrid}>
                    {myRecipes.map(r => (
                      <div key={r.id} className={styles.recipeCard}>
                        {r.image_thumb_url || r.image_url ? (
                          <img className={styles.recipeThumb} src={r.image_thumb_url || r.image_url || ''} alt="" loading="lazy" />
                        ) : (
                          <div className={styles.recipeThumbEmpty}>🍽️</div>
                        )}
                        <div className={styles.recipeCardBody}>
                          <div className={styles.recipeCardTitle}>{r.title}</div>
                          <div className={styles.recipeCardMeta}>{r.course_type || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </main>

      {/* ── MODALE 1 : Post brut ── */}
      {modalResult && modalStep !== 'recipe' && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <TypeBadge type={modalResult.type} />
              <span className={styles.modalTitle}>{modalResult.title || 'Sans titre'}</span>
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            {modalResult.published_at && (
              <p className={styles.modalDate}>Publié le {formatDate(modalResult.published_at)}</p>
            )}
            <a className={styles.resultUrl} href={modalResult.url_origin} target="_blank" rel="noopener noreferrer"
              style={{ padding: '0.3rem 1.25rem 0', display: 'block' }}>
              {modalResult.url_origin}
            </a>

            {modalResult.images.length > 0 && (
              <div className={styles.modalImages}>
                {modalResult.images.map((img, i) => (
                  <img key={i} src={img} alt="" className={styles.modalThumb} />
                ))}
              </div>
            )}

            <div className={styles.modalBody}>
              {modalStep === 'hydrating' ? (
                <div className={styles.hydratingOverlay}>
                  <span className={styles.spinnerLg} />
                  <p className={styles.hydratingText}>Analyse en cours avec Groq…</p>
                  <p className={styles.hydratingHint}>Extraction du titre, des ingrédients et des instructions</p>
                </div>
              ) : (
                <>
                  {hydrateError && (
                    <p className={`${styles.msg} ${styles.msgErr}`} style={{ marginBottom: '0.75rem' }}>
                      {hydrateError}
                    </p>
                  )}
                  {modalResult.raw_content && (
                    <p className={styles.modalContent}>{modalResult.raw_content}</p>
                  )}
                </>
              )}
            </div>

            <div className={styles.modalFooter}>
              {modalResult.status !== 'valid' && modalResult.status !== 'rejected' && (
                <button className={styles.btnReject}
                  onClick={() => handleReject(modalResult.id)}
                  disabled={actioningId === modalResult.id || modalStep === 'hydrating'}>
                  {actioningId === modalResult.id ? '…' : '✕ Rejeter'}
                </button>
              )}
              {modalResult.status !== 'valid' && (
                <button className={styles.btnAnalyse}
                  onClick={() => handleAnalyse(modalResult.id, modalResult.status)}
                  disabled={modalStep === 'hydrating'}>
                  {modalStep === 'hydrating'
                    ? <><span className={styles.spinner} /> Analyse…</>
                    : <><SparklesSvg /> Analyser avec l'IA</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE 2 : Recette hydratée ── */}
      {modalResult && modalStep === 'recipe' && recipe && hydrated && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`${styles.modal} ${styles.modalRecipe}`} onClick={e => e.stopPropagation()}>

            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Recette détectée</span>
              {hydrated.from_cache ? (
                <span className={styles.cacheBadge}>⚡ cache</span>
              ) : (
                <span className={styles.tokenBadge}>
                  <SparklesSvg /> {hydrated.groq_tokens_used} tokens
                </span>
              )}
              <button className={styles.modalClose} onClick={closeModal}>✕</button>
            </div>

            {hydrated.recipe_confidence < 0.9 && (
              <div className={styles.confidenceWarning}>
                ⚠️ L'IA n'est pas sûre que ce contenu est une recette
                ({Math.round(hydrated.recipe_confidence * 100)}% de confiance).
                Vérifiez les informations — vous pouvez l'insérer quand même.
              </div>
            )}

            <div className={styles.recipeFormBody}>

              {/* Titre */}
              <div className={styles.recipeField}>
                <label className={styles.recipeLabel}>Titre</label>
                <input className={styles.recipeInput}
                  value={recipe.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="Titre de la recette"
                />
              </div>

              {/* Description */}
              <div className={styles.recipeField}>
                <label className={styles.recipeLabel}>Description <span className={styles.optional}>optionnel</span></label>
                <textarea className={styles.recipeTextarea} rows={2}
                  value={recipe.description ?? ''}
                  onChange={e => setField('description', e.target.value || null)}
                  placeholder="Courte description…"
                />
              </div>

              {/* Instructions */}
              <div className={styles.recipeField}>
                <label className={styles.recipeLabel}>Instructions</label>
                <textarea className={styles.recipeTextarea} rows={5}
                  value={recipe.instructions}
                  onChange={e => setField('instructions', e.target.value)}
                  placeholder="Étapes de préparation…"
                />
              </div>

              {/* Timings */}
              <div className={styles.recipeTimings}>
                <div className={styles.recipeField}>
                  <label className={styles.recipeLabel}>Portions</label>
                  <input className={styles.recipeInputSm} type="number" min={1}
                    value={recipe.servings}
                    onChange={e => setField('servings', parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className={styles.recipeField}>
                  <label className={styles.recipeLabel}>Prép. (min)</label>
                  <input className={styles.recipeInputSm} type="number" min={0}
                    value={recipe.prep_time_minutes ?? ''}
                    onChange={e => setField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="—"
                  />
                </div>
                <div className={styles.recipeField}>
                  <label className={styles.recipeLabel}>Cuisson (min)</label>
                  <input className={styles.recipeInputSm} type="number" min={0}
                    value={recipe.cook_time_minutes ?? ''}
                    onChange={e => setField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Type de recette */}
              <div className={styles.recipeField}>
                <label className={styles.recipeLabel}>Type de recette</label>
                <select className={styles.select}
                  value={recipe.course_type ?? ''}
                  onChange={e => setField('course_type', e.target.value || null)}
                >
                  <option value="">— Non défini —</option>
                  {COURSE_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Tags libres */}
              <div className={styles.recipeField}>
                <label className={styles.recipeLabel}>Tags <span className={styles.optional}>optionnel</span></label>
                <div className={styles.tagChips}>
                  {recipe.free_tags.map(tag => (
                    <span key={tag} className={styles.tagChip}>
                      {tag}
                      <button type="button" className={styles.tagChipRemove} onClick={() => removeTag(tag)}>×</button>
                    </span>
                  ))}
                </div>
                <input
                  className={styles.recipeInput}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                    if (e.key === 'Backspace' && !tagInput && recipe.free_tags.length > 0) {
                      removeTag(recipe.free_tags[recipe.free_tags.length - 1]);
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                  placeholder="Ajouter un tag… (Entrée ou virgule)"
                />
              </div>

              {/* Ingrédients */}
              <div className={styles.recipeField}>
                <div className={styles.ingredientsHeader}>
                  <label className={styles.recipeLabel} style={{ marginBottom: 0 }}>
                    Ingrédients
                    <span className={styles.ingredientCount}>{recipe.ingredients.length}</span>
                  </label>
                  <button className={styles.addIngredientBtn} type="button" onClick={addIngredient}>
                    + Ajouter
                  </button>
                </div>
                <div className={styles.ingredientList}>
                  {recipe.ingredients.length === 0 ? (
                    <p className={styles.empty} style={{ padding: '0.75rem 0' }}>
                      Aucun ingrédient détecté
                    </p>
                  ) : (
                    recipe.ingredients.map((ing, idx) => (
                      <div className={styles.ingredientRow} key={idx}>
                        <input className={styles.ingName} placeholder="Ingrédient"
                          value={ing.name}
                          onChange={e => updateIngredient(idx, 'name', e.target.value)}
                        />
                        <input className={styles.ingQty} type="number" min={0} step="0.1" placeholder="Qté"
                          value={ing.quantity}
                          onChange={e => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                        <input className={styles.ingUnit} placeholder="unité"
                          value={ing.unit}
                          onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                        />
                        <button className={styles.removeIngBtn} type="button"
                          onClick={() => removeIngredient(idx)} title="Supprimer">
                          <TrashSvg />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {commitError && (
                <p className={`${styles.msg} ${styles.msgErr}`}>{commitError}</p>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnBack}
                onClick={() => { setModalStep('raw'); setCommitError(''); }}
                disabled={committing}>
                ← Post
              </button>
              {!modalFromHistory && (
                <button className={styles.btnReject}
                  onClick={() => handleReject(modalResult.id)}
                  disabled={committing || actioningId === modalResult.id}>
                  ✕ Rejeter
                </button>
              )}
              <button className={styles.btnCommit}
                onClick={handleCommit}
                disabled={committing || !recipe.title.trim()}>
                {committing ? <><span className={styles.spinner} /> Insertion…</> : (hydrated.recipe_confidence < 0.9 ? '✓ Insérer quand même' : '✓ Insérer la recette')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── SVG icons ────────────────────────────────────────────────────────────────

function PlaySvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function TrashSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function SparklesSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
    </svg>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`${styles.typeBadge} ${styles[`type_${type}`]}`}>
      {type === 'instagram' && <InstagramSvg />}
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'valid')    return <span className={`${styles.statusBadge} ${styles.statusValid}`}>✓ Validé</span>;
  if (status === 'rejected') return <span className={`${styles.statusBadge} ${styles.statusRejected}`}>✕ Rejeté</span>;
  return <span className={`${styles.statusBadge} ${styles.statusWaiting}`}>⏳ Attente</span>;
}

function GlobeSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function InstagramSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SortDescSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function SortAscSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ReviewSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RefreshSvg() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}
