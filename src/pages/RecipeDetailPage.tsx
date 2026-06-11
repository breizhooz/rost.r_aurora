import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { getRecipeBySlug, updateRecipe, getMe } from '../api/endpoints';
import type { RecipeResponse } from '../types';
import { COURSE_TYPE_LABELS, DIFFICULTY_LABELS, CUISINE_ORIGIN_LABELS as CUISINE_LABELS } from '../utils/enumLabels';
import styles from './RecipeDetailPage.module.css';

const COURSE_TYPES = Object.keys(COURSE_TYPE_LABELS);
const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS);
const CUISINES = Object.keys(CUISINE_LABELS);

function formatTime(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

interface EditState {
  title: string;
  description: string;
  instructions: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  servings: string;
  difficulty: string;
  cuisine_origin: string;
  course_type: string;
  free_tags: string[];
  tagInput: string;
}

function toEditState(r: RecipeResponse): EditState {
  return {
    title: r.title,
    description: r.description ?? '',
    instructions: r.instructions,
    prep_time_minutes: r.prep_time_minutes?.toString() ?? '',
    cook_time_minutes: r.cook_time_minutes?.toString() ?? '',
    servings: r.servings.toString(),
    difficulty: r.difficulty,
    cuisine_origin: r.cuisine_origin,
    course_type: r.course_type,
    free_tags: [...r.free_tags],
    tagInput: '',
  };
}

export default function RecipeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const [r, me] = await Promise.all([
        getRecipeBySlug(slug),
        getMe().catch(() => null),
      ]);
      setRecipe(r);
      setCurrentUserId(me?.id ?? null);
    } catch {
      setError('Recette introuvable.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!recipe) return;
    setEditState(toEditState(recipe));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditState(null);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!recipe || !editState) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        title: editState.title,
        description: editState.description || null,
        instructions: editState.instructions,
        prep_time_minutes: editState.prep_time_minutes ? parseInt(editState.prep_time_minutes) : null,
        cook_time_minutes: editState.cook_time_minutes ? parseInt(editState.cook_time_minutes) : null,
        servings: parseInt(editState.servings) || 4,
        difficulty: editState.difficulty,
        cuisine_origin: editState.cuisine_origin,
        course_type: editState.course_type,
        free_tags: editState.free_tags,
      };
      const updated = await updateRecipe(recipe.id, payload);
      setRecipe(updated);
      setEditing(false);
      setEditState(null);
      if (updated.slug !== slug) {
        navigate(`/recettes/${updated.slug}`, { replace: true });
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setSaveError('Vous n\'êtes pas l\'auteur de cette recette.');
      else setSaveError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof EditState, value: string) {
    setEditState(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || editState?.free_tags.includes(tag)) return;
    setEditState(prev => prev ? { ...prev, free_tags: [...prev.free_tags, tag], tagInput: '' } : prev);
  }

  function removeTag(tag: string) {
    setEditState(prev => prev ? { ...prev, free_tags: prev.free_tags.filter(t => t !== tag) } : prev);
  }

  const isOwner = recipe && currentUserId && recipe.created_by_user_id === currentUserId;

  if (loading) {
    return (
      <Layout>
        <main className={styles.main}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonContent}>
            <div className={styles.skeletonLine} style={{ width: '60%' }} />
            <div className={styles.skeletonLine} style={{ width: '40%' }} />
            <div className={styles.skeletonBlock} />
          </div>
        </main>
      </Layout>
    );
  }

  if (error || !recipe) {
    return (
      <Layout>
        <main className={styles.main}>
          <div className={styles.errorState}>
            <p>{error ?? 'Recette introuvable.'}</p>
            <Link to="/old/recettes" className={styles.backLink}>← Retour aux recettes</Link>
          </div>
        </main>
      </Layout>
    );
  }

  const totalMins = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);

  return (
    <Layout>
      <main className={styles.main}>

        {/* ── Top bar ── */}
        <div className={styles.topBar}>
          <Link to="/old/recettes" className={styles.backLink}>← Recettes</Link>
          <div className={styles.topActions}>
            {!editing && isOwner && (
              <button className={styles.btnEdit} onClick={startEdit}>Modifier</button>
            )}
            {editing && (
              <>
                <button className={styles.btnCancel} onClick={cancelEdit} disabled={saving}>Annuler</button>
                <button className={styles.btnSave} onClick={saveEdit} disabled={saving}>
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </>
            )}
          </div>
        </div>

        {saveError && <div className={styles.saveError}>{saveError}</div>}

        {/* ── Hero image ── */}
        {recipe.image_url && (
          <div className={styles.hero}>
            <img src={recipe.image_url} alt={recipe.title} />
          </div>
        )}

        {/* ── Title ── */}
        <div className={styles.titleRow}>
          {editing ? (
            <input
              className={styles.inputTitle}
              value={editState!.title}
              onChange={e => field('title', e.target.value)}
            />
          ) : (
            <h1 className={styles.title}>{recipe.title}</h1>
          )}
        </div>

        {/* ── Badges (read mode) ── */}
        {!editing && (
          <div className={styles.badges}>
            {recipe.source_recipe_id != null && (
              <span className={`${styles.badge} ${styles.badgeCoach}`}>
                👩‍⚕️ Ajoutée par votre gestionnaire
              </span>
            )}
            {COURSE_TYPE_LABELS[recipe.course_type] && (
              <span className={`${styles.badge} ${styles.badgeCourse}`}>
                {COURSE_TYPE_LABELS[recipe.course_type]}
              </span>
            )}
            {DIFFICULTY_LABELS[recipe.difficulty] && (
              <span className={`${styles.badge} ${styles.badgeDiff}`}>
                {DIFFICULTY_LABELS[recipe.difficulty]}
              </span>
            )}
            {CUISINE_LABELS[recipe.cuisine_origin] && (
              <span className={`${styles.badge} ${styles.badgeCuisine}`}>
                {CUISINE_LABELS[recipe.cuisine_origin]}
              </span>
            )}
          </div>
        )}

        <div className={styles.body}>

          {/* ── Left column ── */}
          <div className={styles.content}>

            {/* Description */}
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Description</h3>
              {editing ? (
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={editState!.description}
                  onChange={e => field('description', e.target.value)}
                  placeholder="Description (optionnel)"
                />
              ) : (
                <p className={styles.text}>{recipe.description || <em className={styles.muted}>—</em>}</p>
              )}
            </section>

            {/* Ingredients (read-only always) */}
            {recipe.recipe_ingredients.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Ingrédients <span className={styles.servingHint}>pour {recipe.servings} personnes</span></h3>
                <ul className={styles.ingredientList}>
                  {recipe.recipe_ingredients.map(ri => (
                    <li key={ri.id} className={styles.ingredientItem}>
                      <span className={styles.qty}>{ri.quantity} {ri.unit}</span>
                      <span className={styles.ingName}>{ri.ingredient.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Instructions */}
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Instructions</h3>
              {editing ? (
                <textarea
                  className={styles.textarea}
                  rows={12}
                  value={editState!.instructions}
                  onChange={e => field('instructions', e.target.value)}
                />
              ) : (
                <pre className={styles.instructions}>{recipe.instructions}</pre>
              )}
            </section>

          </div>

          {/* ── Right sidebar ── */}
          <aside className={styles.sidebar}>

            <section className={styles.sideSection}>
              <h4 className={styles.sideSectionLabel}>Informations</h4>
              <dl className={styles.infoList}>
                <div className={styles.infoRow}>
                  <dt>Préparation</dt>
                  <dd>
                    {editing ? (
                      <input type="number" min="0" className={styles.inputSmall}
                        value={editState!.prep_time_minutes}
                        onChange={e => field('prep_time_minutes', e.target.value)}
                        placeholder="min"
                      />
                    ) : (
                      formatTime(recipe.prep_time_minutes) ?? '—'
                    )}
                  </dd>
                </div>
                <div className={styles.infoRow}>
                  <dt>Cuisson</dt>
                  <dd>
                    {editing ? (
                      <input type="number" min="0" className={styles.inputSmall}
                        value={editState!.cook_time_minutes}
                        onChange={e => field('cook_time_minutes', e.target.value)}
                        placeholder="min"
                      />
                    ) : (
                      formatTime(recipe.cook_time_minutes) ?? '—'
                    )}
                  </dd>
                </div>
                {totalMins > 0 && !editing && (
                  <div className={styles.infoRow}>
                    <dt>Total</dt>
                    <dd>{formatTime(totalMins)}</dd>
                  </div>
                )}
                <div className={styles.infoRow}>
                  <dt>Personnes</dt>
                  <dd>
                    {editing ? (
                      <input type="number" min="1" className={styles.inputSmall}
                        value={editState!.servings}
                        onChange={e => field('servings', e.target.value)}
                      />
                    ) : (
                      recipe.servings
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {editing && (
              <section className={styles.sideSection}>
                <h4 className={styles.sideSectionLabel}>Classification</h4>
                <dl className={styles.infoList}>
                  <div className={styles.infoRow}>
                    <dt>Type</dt>
                    <dd>
                      <select className={styles.select}
                        value={editState!.course_type}
                        onChange={e => field('course_type', e.target.value)}
                      >
                        {COURSE_TYPES.map(ct => (
                          <option key={ct} value={ct}>{COURSE_TYPE_LABELS[ct]}</option>
                        ))}
                      </select>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt>Difficulté</dt>
                    <dd>
                      <select className={styles.select}
                        value={editState!.difficulty}
                        onChange={e => field('difficulty', e.target.value)}
                      >
                        {DIFFICULTIES.map(d => (
                          <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
                        ))}
                      </select>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt>Cuisine</dt>
                    <dd>
                      <select className={styles.select}
                        value={editState!.cuisine_origin}
                        onChange={e => field('cuisine_origin', e.target.value)}
                      >
                        {CUISINES.map(c => (
                          <option key={c} value={c}>{CUISINE_LABELS[c]}</option>
                        ))}
                      </select>
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            <section className={styles.sideSection}>
              <h4 className={styles.sideSectionLabel}>Tags</h4>
              {editing ? (
                <div className={styles.tagEditor}>
                  <div className={styles.tagChips}>
                    {editState!.free_tags.map(t => (
                      <span key={t} className={styles.tagChip}>
                        {t}
                        <button onClick={() => removeTag(t)} className={styles.tagRemove}>×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    className={styles.inputTag}
                    placeholder="Ajouter un tag…"
                    value={editState!.tagInput}
                    onChange={e => field('tagInput', e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag(editState!.tagInput);
                      } else if (e.key === 'Backspace' && !editState!.tagInput && editState!.free_tags.length > 0) {
                        removeTag(editState!.free_tags[editState!.free_tags.length - 1]);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className={styles.tagChips}>
                  {recipe.free_tags.length > 0
                    ? recipe.free_tags.map(t => <span key={t} className={styles.tagChip}>{t}</span>)
                    : <span className={styles.muted}>—</span>
                  }
                </div>
              )}
            </section>

            {recipe.source_url && (
              <section className={styles.sideSection}>
                <h4 className={styles.sideSectionLabel}>Source</h4>
                <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                  Voir la source ↗
                </a>
              </section>
            )}

          </aside>
        </div>

      </main>
    </Layout>
  );
}
