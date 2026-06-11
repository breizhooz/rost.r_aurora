import { useEffect, useState, useCallback, useRef } from 'react';
import { getRecipeBySlug, updateRecipe, uploadRecipeImage, deleteRecipe, getMe, pushRecipes } from '../api/endpoints';
import { useAccount } from '../context/AccountContext';
import type { RecipeResponse } from '../types';
import AuroraImagePicker from './AuroraImagePicker';
import {
  COURSE_TYPE_LABELS, DIFFICULTY_LABELS, CUISINE_ORIGIN_LABELS,
} from '../utils/enumLabels';

const COURSE_TYPES = Object.keys(COURSE_TYPE_LABELS);
const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS);
const CUISINES = Object.keys(CUISINE_ORIGIN_LABELS);

function formatTime(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

interface EditState {
  title: string; description: string; instructions: string;
  prep_time_minutes: string; cook_time_minutes: string; servings: string;
  difficulty: string; cuisine_origin: string; course_type: string;
  free_tags: string[]; tagInput: string;
  comment: string; rating: number;
}
function toEditState(r: RecipeResponse): EditState {
  return {
    title: r.title, description: r.description ?? '', instructions: r.instructions,
    prep_time_minutes: r.prep_time_minutes?.toString() ?? '', cook_time_minutes: r.cook_time_minutes?.toString() ?? '',
    servings: r.servings.toString(), difficulty: r.difficulty, cuisine_origin: r.cuisine_origin,
    course_type: r.course_type, free_tags: [...r.free_tags], tagInput: '',
    comment: r.comment ?? '', rating: r.rating ?? 0,
  };
}
// Vrai dès qu'un champ éditable diffère de la recette d'origine (tagInput est transitoire).
function isDirty(orig: RecipeResponse, s: EditState): boolean {
  const b = toEditState(orig);
  return (
    b.title !== s.title || b.description !== s.description || b.instructions !== s.instructions ||
    b.prep_time_minutes !== s.prep_time_minutes || b.cook_time_minutes !== s.cook_time_minutes ||
    b.servings !== s.servings || b.difficulty !== s.difficulty || b.cuisine_origin !== s.cuisine_origin ||
    b.course_type !== s.course_type || b.comment !== s.comment || b.rating !== s.rating ||
    JSON.stringify(b.free_tags) !== JSON.stringify(s.free_tags)
  );
}

interface Props {
  slug: string;
  onClose: () => void;
  slotPersons?: number;
  onSlotPersonsChange?: (n: number) => Promise<void> | void;
  onDeleted?: () => void;
  /** Appelé à la fermeture si la recette a été modifiée (édition, image),
   *  pour que la liste sous-jacente se rafraîchisse. */
  onUpdated?: () => void;
}

export default function AuroraRecipeModal({ slug, onClose, slotPersons, onSlotPersonsChange, onDeleted, onUpdated }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Vrai dès qu'une modification persistée a eu lieu (édition, image) : déclenche
  // le rafraîchissement de la liste parente à la fermeture.
  const changedRef = useRef(false);

  const [slotPersonsLocal, setSlotPersonsLocal] = useState(slotPersons ?? 1);
  const [savingPersons, setSavingPersons] = useState(false);
  useEffect(() => { if (slotPersons != null) setSlotPersonsLocal(slotPersons); }, [slotPersons]);

  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushOpen, setPushOpen] = useState(false);

  // Coaching : on ne peut pousser que depuis SON propre compte (« Moi »), vers un
  // de ses clients. Pas de push quand on travaille déjà dans le compte d'un client.
  const { active, accounts } = useAccount();
  const clientAccounts = accounts.filter((a) => a.role === 'COACH');
  const canPush = !!active?.is_default && clientAccounts.length > 0;

  const sendToClient = async (clientId: string, clientName: string) => {
    if (!recipe || pushing) return;
    setPushing(true); setPushMsg(null);
    try {
      const res = await pushRecipes([recipe.id], clientId);
      setPushMsg(res.pushed.length
        ? `✓ Envoyée à ${clientName}.`
        : `Déjà présente chez ${clientName}.`);
      setPushOpen(false);
    } catch {
      setPushMsg('Échec de l’envoi.');
    } finally {
      setPushing(false);
    }
  };

  const inMenu = slotPersons != null;
  function scaledQty(q: number): string {
    const servings = recipe?.servings || 1;
    const factor = inMenu ? slotPersonsLocal / servings : 1;
    const v = q * factor;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  async function changePersons(n: number) {
    if (n < 1 || !onSlotPersonsChange) return;
    setSlotPersonsLocal(n); setSavingPersons(true);
    try { await onSlotPersonsChange(n); } finally { setSavingPersons(false); }
  }

  // Ferme la modale en signalant au parent qu'un refresh est nécessaire si la
  // recette a changé (édition de champs, image uploadée ou choisie via Unsplash).
  const handleClose = useCallback(() => {
    if (changedRef.current) onUpdated?.();
    onClose();
  }, [onClose, onUpdated]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleClose]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, me] = await Promise.all([getRecipeBySlug(slug), getMe().catch(() => null)]);
      setRecipe(r); setCurrentUserId(me?.id ?? null);
    } catch { setError('Recette introuvable.'); } finally { setLoading(false); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  function startEdit() { if (!recipe) return; setEditState(toEditState(recipe)); setSaveError(null); setEditing(true); }
  function cancelEdit() { setEditing(false); setEditState(null); setSaveError(null); }
  function field(key: keyof EditState, value: string) { setEditState((p) => (p ? { ...p, [key]: value } : p)); }
  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || editState?.free_tags.includes(tag)) return;
    setEditState((p) => (p ? { ...p, free_tags: [...p.free_tags, tag], tagInput: '' } : p));
  }
  function removeTag(tag: string) { setEditState((p) => (p ? { ...p, free_tags: p.free_tags.filter((t) => t !== tag) } : p)); }

  async function saveEdit() {
    if (!recipe || !editState) return;
    setSaving(true); setSaveError(null);
    try {
      const updated = await updateRecipe(recipe.id, {
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
        comment: editState.comment || null,
        rating: editState.rating || null,
      });
      setRecipe(updated); setEditing(false); setEditState(null); changedRef.current = true;
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setSaveError(status === 403 ? "Vous n'êtes pas l'auteur de cette recette." : 'Erreur lors de la sauvegarde.');
    } finally { setSaving(false); }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !recipe) return;
    setUploadingImage(true); setImageError(null);
    try { setRecipe(await uploadRecipeImage(recipe.id, file)); changedRef.current = true; }
    catch { setImageError("Erreur lors du téléchargement de l'image."); }
    finally { setUploadingImage(false); if (imageInputRef.current) imageInputRef.current.value = ''; }
  }

  async function handleDelete() {
    if (!recipe || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      await deleteRecipe(recipe.id);
      onDeleted?.();
      onClose();
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setDeleteError(status === 403 ? "Vous n'êtes pas l'auteur de cette recette." : 'Erreur lors de la suppression.');
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  const isOwner = !!(recipe && currentUserId && recipe.created_by_user_id === currentUserId);
  const dirty = !!(editing && recipe && editState && isDirty(recipe, editState));

  return (
    <div className="rost-rd-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}>
      <div className="rost-rd-modal" role="dialog" aria-modal="true">
        <div className="rost-rd-head">
          <div className="rost-rd-head-actions">
            {!editing && !confirmDelete && canPush && (
              <div className="rost-usermenu" style={{ position: 'relative' }}>
                <button className="rost-add-btn" onClick={() => setPushOpen((v) => !v)} disabled={pushing}>
                  {pushing ? 'Envoi…' : 'Envoyer à un client ▾'}
                </button>
                {pushOpen && (
                  <>
                    <div className="rost-usermenu-backdrop" onClick={() => setPushOpen(false)} />
                    <div className="rost-usermenu-dropdown" role="menu" aria-label="Envoyer à un client">
                      <div style={{ padding: '6px 12px 8px', fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.6 }}>
                        Envoyer à
                      </div>
                      {clientAccounts.map((c) => (
                        <button key={c.id} role="menuitem" onClick={() => sendToClient(c.id, c.name)}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {!editing && !confirmDelete && pushMsg && <span className="rost-rd-saveerr">{pushMsg}</span>}
            {!editing && isOwner && !confirmDelete && <button className="rost-btn" onClick={startEdit}>Modifier</button>}
            {!editing && isOwner && !confirmDelete && (
              <button className="rost-btn rost-btn-danger" onClick={() => { setDeleteError(null); setConfirmDelete(true); }}>Supprimer</button>
            )}
            {!editing && confirmDelete && (
              <>
                <span className="rost-rd-saveerr">Supprimer définitivement ?</span>
                <button className="rost-btn rost-btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</button>
                <button className="rost-btn rost-btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Suppression…' : 'Confirmer'}</button>
              </>
            )}
            {editing && (
              <>
                {saveError && <span className="rost-rd-saveerr">{saveError}</span>}
                <button className="rost-btn rost-btn-ghost" onClick={cancelEdit} disabled={saving}>Annuler</button>
                <button className="rost-add-btn" onClick={saveEdit} disabled={saving || !dirty} title={!dirty ? 'Aucune modification' : undefined}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
              </>
            )}
          </div>
          <button className="rost-icon-btn" onClick={handleClose} aria-label="Fermer">✕</button>
        </div>

        <div className="rost-rd-body">
          {loading && <div className="rost-skel" style={{ height: 360 }} />}
          {!loading && error && <div className="rost-empty rost-empty-block">{error}</div>}

          {!loading && recipe && (
            <>
              <div className={recipe.image_url ? 'rost-rd-hero' : 'rost-rd-hero is-empty'}>
                {recipe.image_url
                  ? <img src={recipe.image_url} alt={recipe.title} />
                  : isOwner && !editing && <span className="rost-rd-hero-ph">Aucune image</span>}
                {isOwner && (
                  <>
                    <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImageUpload} />
                    <button className="rost-rd-imgbtn" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} title="Changer l'image (fichier)">
                      {uploadingImage ? '…' : '📷'}
                    </button>
                    <button className="rost-rd-imgbtn" style={{ right: 52 }} onClick={() => setShowPicker((v) => !v)} title="Choisir via Unsplash">🖼</button>
                  </>
                )}
              </div>
              {imageError && <p className="rost-rd-saveerr">{imageError}</p>}
              {deleteError && <p className="rost-rd-saveerr">{deleteError}</p>}
              {isOwner && showPicker && (
                <AuroraImagePicker recipe={recipe} onChange={(r) => { setRecipe(r); changedRef.current = true; }} />
              )}

              {editing
                ? <input className="rost-rd-title-input" value={editState!.title} onChange={(e) => field('title', e.target.value)} />
                : <h2 className="rost-rd-title">{recipe.title}</h2>}

              {onSlotPersonsChange && (
                <div className="rost-rd-slotbar">
                  <span className="rost-rd-slotbar-label">Pour ce repas</span>
                  <div className="rost-stepper">
                    <button onClick={() => changePersons(slotPersonsLocal - 1)} disabled={savingPersons || slotPersonsLocal <= 1} aria-label="Moins">−</button>
                    <span>{slotPersonsLocal}</span>
                    <button onClick={() => changePersons(slotPersonsLocal + 1)} disabled={savingPersons} aria-label="Plus">+</button>
                  </div>
                  <span className="rost-rd-slotbar-hint">{savingPersons ? 'mise à jour…' : 'personne(s) — impacte la liste de courses'}</span>
                </div>
              )}

              {!editing && (
                <div className="rost-rd-badges">
                  {COURSE_TYPE_LABELS[recipe.course_type] && <span className="rost-chip">{COURSE_TYPE_LABELS[recipe.course_type]}</span>}
                  {DIFFICULTY_LABELS[recipe.difficulty] && <span className="rost-chip">{DIFFICULTY_LABELS[recipe.difficulty]}</span>}
                  {CUISINE_ORIGIN_LABELS[recipe.cuisine_origin] && <span className="rost-chip rost-chip-ghost">{CUISINE_ORIGIN_LABELS[recipe.cuisine_origin]}</span>}
                </div>
              )}

              <div className="rost-rd-cols">
                <div className="rost-rd-main">
                  {(recipe.description || editing) && (
                    <section className="rost-rd-sect">
                      <h3 className="rost-rd-sect-label">Description</h3>
                      {editing
                        ? <textarea className="rost-textarea" rows={3} value={editState!.description} onChange={(e) => field('description', e.target.value)} placeholder="Description (optionnel)" />
                        : <p className="rost-rd-text">{recipe.description}</p>}
                    </section>
                  )}

                  <section className="rost-rd-sect">
                    <h3 className="rost-rd-sect-label">
                      Ingrédients
                      {inMenu ? <span className="rost-rd-hint"> — {slotPersonsLocal} pers.</span>
                        : recipe.servings ? <span className="rost-rd-hint"> — {recipe.servings} pers.</span> : null}
                    </h3>
                    {recipe.recipe_ingredients.length > 0 ? (
                      <ul className="rost-rd-ings">
                        {recipe.recipe_ingredients.map((ri) => (
                          <li key={ri.id}><span className="rost-rd-qty">{scaledQty(ri.quantity)} {ri.unit}</span><span>{ri.ingredient?.name ?? `#${ri.ingredient_id}`}</span></li>
                        ))}
                      </ul>
                    ) : <p className="rost-empty">Aucun ingrédient renseigné</p>}
                  </section>

                  <section className="rost-rd-sect">
                    <h3 className="rost-rd-sect-label">Instructions</h3>
                    {editing
                      ? <textarea className="rost-textarea" rows={14} value={editState!.instructions} onChange={(e) => field('instructions', e.target.value)} />
                      : <pre className="rost-rd-instr">{recipe.instructions}</pre>}
                  </section>

                  {(editing || recipe.rating != null || recipe.comment) && (
                    <section className="rost-rd-sect">
                      <h3 className="rost-rd-sect-label">Mon avis</h3>
                      {editing ? (
                        <>
                          <div className="rost-rating" role="group" aria-label="Note sur 5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button type="button" key={n}
                                className={`rost-rating-star ${editState!.rating >= n ? 'is-on' : ''}`}
                                onClick={() => setEditState((p) => (p ? { ...p, rating: p.rating === n ? 0 : n } : p))}
                                aria-label={`${n} étoile${n > 1 ? 's' : ''}`} aria-pressed={editState!.rating >= n}>★</button>
                            ))}
                            {editState!.rating > 0 && (
                              <button type="button" className="rost-rating-clear"
                                onClick={() => setEditState((p) => (p ? { ...p, rating: 0 } : p))}>Effacer</button>
                            )}
                          </div>
                          <textarea className="rost-textarea" rows={3} value={editState!.comment}
                            onChange={(e) => field('comment', e.target.value)} placeholder="Vos remarques sur cette recette…" />
                        </>
                      ) : (
                        <>
                          {recipe.rating != null && (
                            <div className="rost-rating is-readonly" aria-label={`Note ${recipe.rating} sur 5`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <span key={n} className={`rost-rating-star ${recipe.rating! >= n ? 'is-on' : ''}`}>★</span>
                              ))}
                            </div>
                          )}
                          {recipe.comment && <p className="rost-rd-text">{recipe.comment}</p>}
                        </>
                      )}
                    </section>
                  )}
                </div>

                <aside className="rost-rd-side">
                  <section className="rost-rd-sect">
                    <h4 className="rost-rd-sect-label">Infos</h4>
                    <dl className="rost-rd-info">
                      <div><dt>Préparation</dt><dd>{editing ? <input type="number" min="0" className="rost-rd-input-sm" value={editState!.prep_time_minutes} onChange={(e) => field('prep_time_minutes', e.target.value)} placeholder="min" /> : (formatTime(recipe.prep_time_minutes) ?? '—')}</dd></div>
                      <div><dt>Cuisson</dt><dd>{editing ? <input type="number" min="0" className="rost-rd-input-sm" value={editState!.cook_time_minutes} onChange={(e) => field('cook_time_minutes', e.target.value)} placeholder="min" /> : (formatTime(recipe.cook_time_minutes) ?? '—')}</dd></div>
                      <div><dt>Personnes</dt><dd>{editing ? <input type="number" min="1" className="rost-rd-input-sm" value={editState!.servings} onChange={(e) => field('servings', e.target.value)} /> : recipe.servings}</dd></div>
                    </dl>
                  </section>

                  {editing && (
                    <section className="rost-rd-sect">
                      <h4 className="rost-rd-sect-label">Classification</h4>
                      <dl className="rost-rd-info">
                        <div><dt>Type</dt><dd><select className="rost-rd-select" value={editState!.course_type} onChange={(e) => field('course_type', e.target.value)}>{COURSE_TYPES.map((ct) => <option key={ct} value={ct}>{COURSE_TYPE_LABELS[ct]}</option>)}</select></dd></div>
                        <div><dt>Difficulté</dt><dd><select className="rost-rd-select" value={editState!.difficulty} onChange={(e) => field('difficulty', e.target.value)}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}</select></dd></div>
                        <div><dt>Cuisine</dt><dd><select className="rost-rd-select" value={editState!.cuisine_origin} onChange={(e) => field('cuisine_origin', e.target.value)}>{CUISINES.map((c) => <option key={c} value={c}>{CUISINE_ORIGIN_LABELS[c]}</option>)}</select></dd></div>
                      </dl>
                    </section>
                  )}

                  <section className="rost-rd-sect">
                    <h4 className="rost-rd-sect-label">Tags</h4>
                    {editing ? (
                      <div>
                        <div className="rost-chips" style={{ marginBottom: 8 }}>
                          {editState!.free_tags.map((t) => (
                            <span key={t} className="rost-chip">{t}<button onClick={() => removeTag(t)} className="rost-tag-x">×</button></span>
                          ))}
                        </div>
                        <input className="rost-rd-input-sm" style={{ width: '100%' }} placeholder="Ajouter un tag…" value={editState!.tagInput}
                          onChange={(e) => field('tagInput', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(editState!.tagInput); }
                            else if (e.key === 'Backspace' && !editState!.tagInput && editState!.free_tags.length) removeTag(editState!.free_tags[editState!.free_tags.length - 1]);
                          }} />
                      </div>
                    ) : (
                      <div className="rost-chips">
                        {recipe.free_tags.length ? recipe.free_tags.map((t) => <span key={t} className="rost-chip">{t}</span>) : <span className="rost-empty">—</span>}
                      </div>
                    )}
                  </section>

                  {recipe.calories_per_serving != null && (
                    <section className="rost-rd-sect">
                      <h4 className="rost-rd-sect-label">Nutrition / pers.</h4>
                      <dl className="rost-rd-info">
                        <div><dt>Calories</dt><dd>{Math.round(recipe.calories_per_serving)} kcal</dd></div>
                        {recipe.proteins_per_serving != null && <div><dt>Protéines</dt><dd>{recipe.proteins_per_serving.toFixed(1)} g</dd></div>}
                        {recipe.carbs_per_serving != null && <div><dt>Glucides</dt><dd>{recipe.carbs_per_serving.toFixed(1)} g</dd></div>}
                        {recipe.fats_per_serving != null && <div><dt>Lipides</dt><dd>{recipe.fats_per_serving.toFixed(1)} g</dd></div>}
                      </dl>
                    </section>
                  )}

                  {recipe.source_url && (
                    <section className="rost-rd-sect">
                      <h4 className="rost-rd-sect-label">Source</h4>
                      <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="rost-rd-source">Voir la source ↗</a>
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
