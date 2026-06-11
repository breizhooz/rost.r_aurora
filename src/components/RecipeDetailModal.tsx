import { useEffect, useState, useCallback, useRef } from 'react';
import { getRecipeBySlug, updateRecipe, uploadRecipeImage, getMe } from '../api/endpoints';
import type { RecipeResponse } from '../types';
import styles from './RecipeDetailModal.module.css';

const COURSE_TYPE_LABELS: Record<string, string> = {
  'enums.course_type.starter':   'Entrée',
  'enums.course_type.main':      'Plat principal',
  'enums.course_type.dessert':   'Dessert',
  'enums.course_type.sauce':     'Sauce',
  'enums.course_type.drink':     'Boisson',
  'enums.course_type.snack':     'Snack',
  'enums.course_type.side_dish': 'Accompagnement',
  'enums.course_type.breakfast': 'Petit-déj',
  'enums.course_type.soup':      'Soupe',
  'enums.course_type.salad':     'Salade',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  'enums.difficulty.easy':   'Facile',
  'enums.difficulty.medium': 'Moyen',
  'enums.difficulty.hard':   'Difficile',
};

const CUISINE_LABELS: Record<string, string> = {
  'enums.origin_recipe.cuisine_origine.french':        'Française',
  'enums.origin_recipe.cuisine_origine.italian':       'Italienne',
  'enums.origin_recipe.cuisine_origine.spanish':       'Espagnole',
  'enums.origin_recipe.cuisine_origine.greek':         'Grecque',
  'enums.origin_recipe.cuisine_origine.german':        'Allemande',
  'enums.origin_recipe.cuisine_origine.europe':        'Européenne',
  'enums.origin_recipe.cuisine_origine.chinese':       'Chinoise',
  'enums.origin_recipe.cuisine_origine.japanese':      'Japonaise',
  'enums.origin_recipe.cuisine_origine.thai':          'Thaïlandaise',
  'enums.origin_recipe.cuisine_origine.indian':        'Indienne',
  'enums.origin_recipe.cuisine_origine.korean':        'Coréenne',
  'enums.origin_recipe.cuisine_origine.vietnamese':    'Vietnamienne',
  'enums.origin_recipe.cuisine_origine.asia':          'Asiatique',
  'enums.origin_recipe.cuisine_origine.moroccan':      'Marocaine',
  'enums.origin_recipe.cuisine_origine.ethiopian':     'Éthiopienne',
  'enums.origin_recipe.cuisine_origine.senegalese':    'Sénégalaise',
  'enums.origin_recipe.cuisine_origine.africa':        'Africaine',
  'enums.origin_recipe.cuisine_origine.mexican':       'Mexicaine',
  'enums.origin_recipe.cuisine_origine.american':      'Américaine',
  'enums.origin_recipe.cuisine_origine.brazilian':     'Brésilienne',
  'enums.origin_recipe.cuisine_origine.peruvian':      'Péruvienne',
  'enums.origin_recipe.cuisine_origine.south_america': 'Sud-américaine',
  'enums.origin_recipe.cuisine_origine.lebanese':      'Libanaise',
  'enums.origin_recipe.cuisine_origine.turkish':       'Turque',
  'enums.origin_recipe.cuisine_origine.iranian':       'Iranienne',
  'enums.origin_recipe.cuisine_origine.middle_east':   'Moyen-Orient',
  'enums.origin_recipe.cuisine_origine.australian':    'Australienne',
  'enums.origin_recipe.cuisine_origine.polynesian':    'Polynésienne',
  'enums.origin_recipe.cuisine_origine.oceania':       'Océanie',
};

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

interface Props {
  slug: string;
  onClose: () => void;
  /** Nombre de personnes du créneau de menu d'où vient l'ouverture (optionnel). */
  slotPersons?: number;
  /** Callback de sauvegarde du nb de personnes du créneau ; impacte la liste de courses. */
  onSlotPersonsChange?: (n: number) => Promise<void> | void;
}

export default function RecipeDetailModal({ slug, onClose, slotPersons, onSlotPersonsChange }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const [slotPersonsLocal, setSlotPersonsLocal] = useState(slotPersons ?? 1);
  const [savingPersons, setSavingPersons] = useState(false);
  useEffect(() => { if (slotPersons != null) setSlotPersonsLocal(slotPersons); }, [slotPersons]);

  async function changePersons(n: number) {
    if (n < 1 || !onSlotPersonsChange) return;
    setSlotPersonsLocal(n);
    setSavingPersons(true);
    try {
      await onSlotPersonsChange(n);
    } finally {
      setSavingPersons(false);
    }
  }

  const inMenu = slotPersons != null;

  // Les quantités de la recette sont pour `servings` personnes ;
  // dans un menu, on les met à l'échelle du nb de personnes du créneau.
  function scaledQty(q: number): string {
    const servings = recipe?.servings || 1;
    const factor = inMenu ? slotPersonsLocal / servings : 1;
    const v = q * factor;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const load = useCallback(async () => {
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
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setSaveError("Vous n'êtes pas l'auteur de cette recette.");
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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !recipe) return;
    setUploadingImage(true);
    setImageError(null);
    try {
      const updated = await uploadRecipeImage(recipe.id, file);
      setRecipe(updated);
    } catch {
      setImageError("Erreur lors du téléchargement de l'image.");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">

        {/* ── Modal header ── */}
        <div className={styles.modalHeader}>
          <div className={styles.headerActions}>
            {!editing && isOwner && (
              <button className={styles.btnEdit} onClick={startEdit}>Modifier</button>
            )}
            {editing && (
              <>
                {saveError && <span className={styles.saveError}>{saveError}</span>}
                <button className={styles.btnCancel} onClick={cancelEdit} disabled={saving}>Annuler</button>
                <button className={styles.btnSave} onClick={saveEdit} disabled={saving}>
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {/* ── Modal body ── */}
        <div className={styles.modalBody}>

          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.skeletonHero} />
              <div className={styles.skeletonLine} style={{ width: '55%' }} />
              <div className={styles.skeletonLine} style={{ width: '35%' }} />
              <div className={styles.skeletonBlock} />
            </div>
          )}

          {!loading && error && (
            <div className={styles.errorState}>{error}</div>
          )}

          {!loading && recipe && (
            <>
              {/* Hero */}
              <div className={recipe.image_url ? styles.hero : styles.heroEmpty}>
                {recipe.image_url
                  ? <img src={recipe.image_url} alt={recipe.title} />
                  : isOwner && !editing && (
                    <span className={styles.heroPlaceholder}>Aucune image</span>
                  )
                }
                {isOwner && (
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleImageUpload}
                    />
                    <button
                      className={styles.btnChangeImage}
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                      title="Changer l'image"
                    >
                      {uploadingImage ? '…' : '📷'}
                    </button>
                  </>
                )}
              </div>
              {imageError && <p className={styles.imageError}>{imageError}</p>}

              {/* Title */}
              <div className={styles.titleRow}>
                {editing ? (
                  <input
                    className={styles.inputTitle}
                    value={editState!.title}
                    onChange={e => field('title', e.target.value)}
                  />
                ) : (
                  <h2 className={styles.title}>{recipe.title}</h2>
                )}
              </div>

              {/* Per-slot persons (only when opened from a menu) */}
              {onSlotPersonsChange && (
                <div className={styles.slotPersonsBar}>
                  <span className={styles.slotPersonsLabel}>Pour ce repas</span>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      onClick={() => changePersons(slotPersonsLocal - 1)}
                      disabled={savingPersons || slotPersonsLocal <= 1}
                      aria-label="Moins"
                    >−</button>
                    <span className={styles.stepperValue}>{slotPersonsLocal}</span>
                    <button
                      type="button"
                      onClick={() => changePersons(slotPersonsLocal + 1)}
                      disabled={savingPersons}
                      aria-label="Plus"
                    >+</button>
                  </div>
                  <span className={styles.slotPersonsHint}>
                    {savingPersons ? 'mise à jour…' : 'personne(s) — impacte la liste de courses'}
                  </span>
                </div>
              )}

              {/* Badges */}
              {!editing && (
                <div className={styles.badges}>
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

              {/* Two columns */}
              <div className={styles.columns}>

                {/* Left: description + ingredients + instructions */}
                <div className={styles.main}>

                  {(recipe.description || editing) && (
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
                        <p className={styles.text}>{recipe.description}</p>
                      )}
                    </section>
                  )}

                  <section className={styles.section}>
                    <h3 className={styles.sectionLabel}>
                      Ingrédients
                      {inMenu ? (
                        <span className={styles.servingHint}>— {slotPersonsLocal} pers.</span>
                      ) : recipe.servings ? (
                        <span className={styles.servingHint}>— {recipe.servings} pers.</span>
                      ) : null}
                    </h3>
                    {recipe.recipe_ingredients.length > 0 ? (
                      <ul className={styles.ingredientList}>
                        {recipe.recipe_ingredients.map(ri => (
                          <li key={ri.id} className={styles.ingredientItem}>
                            <span className={styles.qty}>{scaledQty(ri.quantity)} {ri.unit}</span>
                            <span>{ri.ingredient.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.emptyState}>Aucun ingrédient renseigné</p>
                    )}
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionLabel}>Instructions</h3>
                    {editing ? (
                      <textarea
                        className={styles.textarea}
                        rows={14}
                        value={editState!.instructions}
                        onChange={e => field('instructions', e.target.value)}
                      />
                    ) : (
                      <pre className={styles.instructions}>{recipe.instructions}</pre>
                    )}
                  </section>

                </div>

                {/* Right: meta sidebar */}
                <aside className={styles.sidebar}>

                  <section className={styles.sideSection}>
                    <h4 className={styles.sideSectionLabel}>Infos</h4>
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

                  {recipe.calories_per_serving != null && (
                    <section className={styles.sideSection}>
                      <h4 className={styles.sideSectionLabel}>Nutrition / pers.</h4>
                      <dl className={styles.infoList}>
                        <div className={styles.infoRow}>
                          <dt>Calories</dt>
                          <dd>{Math.round(recipe.calories_per_serving)} kcal</dd>
                        </div>
                        {recipe.proteins_per_serving != null && (
                          <div className={styles.infoRow}>
                            <dt>Protéines</dt>
                            <dd>{recipe.proteins_per_serving.toFixed(1)} g</dd>
                          </div>
                        )}
                        {recipe.carbs_per_serving != null && (
                          <div className={styles.infoRow}>
                            <dt>Glucides</dt>
                            <dd>{recipe.carbs_per_serving.toFixed(1)} g</dd>
                          </div>
                        )}
                        {recipe.fats_per_serving != null && (
                          <div className={styles.infoRow}>
                            <dt>Lipides</dt>
                            <dd>{recipe.fats_per_serving.toFixed(1)} g</dd>
                          </div>
                        )}
                      </dl>
                    </section>
                  )}

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
