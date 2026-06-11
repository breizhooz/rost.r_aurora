import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import RecipeDetailModal from '../components/RecipeDetailModal';
import { searchRecipesPage, deleteRecipe } from '../api/endpoints';
import type { SearchRecipeResult, SearchResponse } from '../types';
import { COURSE_TYPE_LABELS, DIFFICULTY_LABELS } from '../utils/enumLabels';
import styles from './RecettesPage.module.css';

const COURSE_TYPES = Object.keys(COURSE_TYPE_LABELS);
const PAGE_SIZE = 20;

function formatTime(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function RecipeCard({
  recipe,
  onClick,
  onDelete,
}: {
  recipe: SearchRecipeResult;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const courseLabel = recipe.course_type ? COURSE_TYPE_LABELS[recipe.course_type] ?? null : null;
  const diffLabel   = recipe.difficulty  ? DIFFICULTY_LABELS[recipe.difficulty]   ?? null : null;
  const totalMins   = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);
  const total       = formatTime(totalMins || null);

  return (
    <div className={styles.card} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className={styles.cardImage}>
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.title} loading="lazy" />
        ) : (
          <div className={styles.cardImagePlaceholder}>
            <span>🍽</span>
          </div>
        )}
        {courseLabel && <span className={styles.courseTag}>{courseLabel}</span>}
        <button
          className={styles.deleteBtn}
          title="Supprimer la recette"
          onClick={onDelete}
        >✕</button>
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>{recipe.title}</h2>
        {recipe.description && (
          <p className={styles.cardDesc}>
            {recipe.description.length > 100 ? recipe.description.slice(0, 100) + '…' : recipe.description}
          </p>
        )}
        <div className={styles.cardMeta}>
          {total  && <span className={styles.metaItem}>⏱ {total}</span>}
          {recipe.servings && <span className={styles.metaItem}>👤 {recipe.servings}</span>}
          {diffLabel && <span className={`${styles.metaItem} ${styles.metaDiff}`}>{diffLabel}</span>}
        </div>
        {(recipe.free_tags?.length ?? 0) > 0 && (
          <div className={styles.cardTags}>
            {recipe.free_tags.slice(0, 3).map(tag => (
              <span key={tag} className={styles.freeTag}>{tag}</span>
            ))}
          </div>
        )}
        {(recipe.ingredient_names?.length ?? 0) > 0 && (
          <div className={styles.ingredientHint}>
            {recipe.ingredient_names.slice(0, 4).join(', ')}
            {recipe.ingredient_names.length > 4 && '…'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecettesPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [result,     setResult]     = useState<SearchResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [q,          setQ]          = useState('');
  const [courseType, setCourseType] = useState<string | null>(null);
  const [offset,     setOffset]     = useState(0);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Lit les paramètres URL (slug pour ouvrir la modal, q pour pré-remplir la recherche)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlSlug = params.get('slug');
    const urlQ    = params.get('q');
    if (urlSlug) setSelectedSlug(urlSlug);
    if (urlQ !== null) { setQ(urlQ); setOffset(0); }
  }, [location.search]);

  const runSearch = useCallback(async (query: string, ct: string | null, off: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await searchRecipesPage({ q: query, courseType: ct ?? undefined, limit: PAGE_SIZE, offset: off });
      if (!ctrl.signal.aborted) setResult(res);
    } catch {
      // aborted or error — leave previous result
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(q, courseType, offset), 200);
    return () => clearTimeout(timer);
  }, [q, courseType, offset, runSearch]);

  function selectCourseType(ct: string | null) {
    setCourseType(ct);
    setOffset(0);
  }

  function goToPage(newOffset: number) {
    setOffset(newOffset);
  }

  async function handleDelete(e: React.MouseEvent, recipe: SearchRecipeResult) {
    e.stopPropagation();
    if (!window.confirm(`Supprimer « ${recipe.title} » ?`)) return;
    setDeletingId(recipe.id);
    try {
      await deleteRecipe(recipe.id);
      // Reload current page; if it becomes empty, go to previous page
      const newOffset = result && result.results.length === 1 && offset > 0
        ? offset - PAGE_SIZE
        : offset;
      setOffset(newOffset);
      await runSearch(q, courseType, newOffset);
    } catch {
      alert('Impossible de supprimer cette recette.');
    } finally {
      setDeletingId(null);
    }
  }

  const items    = result?.results ?? [];
  const total    = result?.total ?? 0;
  const currPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1>Recettes</h1>
            {result && !loading && (
              <p>{total} recette{total !== 1 ? 's' : ''}{q ? ` pour « ${q} »` : ''}</p>
            )}
          </div>
        </div>

        <div className={styles.filters}>
          <button
            className={`${styles.chip} ${courseType === null ? styles.chipActive : ''}`}
            onClick={() => selectCourseType(null)}
          >
            Toutes
          </button>
          {COURSE_TYPES.map(ct => (
            <button
              key={ct}
              className={`${styles.chip} ${courseType === ct ? styles.chipActive : ''}`}
              onClick={() => selectCourseType(ct)}
            >
              {COURSE_TYPE_LABELS[ct]}
            </button>
          ))}
        </div>

        {loading && (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={styles.empty}>
            <span>🍽</span>
            <p>{q ? `Aucun résultat pour « ${q} »` : 'Aucune recette pour l\'instant.'}</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className={styles.grid}>
            {items.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => deletingId === null && setSelectedSlug(recipe.slug)}
                onDelete={e => handleDelete(e, recipe)}
              />
            ))}
          </div>
        )}

        {totPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={offset === 0} onClick={() => goToPage(offset - PAGE_SIZE)}>
              ← Préc
            </button>
            <span className={styles.pageInfo}>{currPage} / {totPages}</span>
            <button className={styles.pageBtn} disabled={currPage >= totPages} onClick={() => goToPage(offset + PAGE_SIZE)}>
              Suiv →
            </button>
          </div>
        )}
      </main>

      {selectedSlug && (
        <RecipeDetailModal
          slug={selectedSlug}
          onClose={() => {
            setSelectedSlug(null);
            const params = new URLSearchParams(location.search);
            params.delete('slug');
            const qs = params.toString();
            navigate(qs ? `/recettes?${qs}` : '/recettes', { replace: true });
          }}
        />
      )}
    </Layout>
  );
}
