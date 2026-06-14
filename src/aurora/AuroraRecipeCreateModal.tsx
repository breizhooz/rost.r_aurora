import { useEffect, useState } from 'react';
import { createRecipeManual, uploadRecipeImage } from '../api/endpoints';
import { apiErrorMessage } from '../utils/apiError';
import type { RecipeCommitRequest, HydratedIngredient, RecipeResponse } from '../types';
import AuroraImagePicker from './AuroraImagePicker';

const COURSE_TYPE_OPTIONS = [
  { value: 'enums.course_type.starter', label: 'Entrée' }, { value: 'enums.course_type.main', label: 'Plat principal' },
  { value: 'enums.course_type.dessert', label: 'Dessert' }, { value: 'enums.course_type.sauce', label: 'Sauce' },
  { value: 'enums.course_type.drink', label: 'Boisson' }, { value: 'enums.course_type.snack', label: 'Snack / Apéro' },
  { value: 'enums.course_type.side_dish', label: 'Accompagnement' }, { value: 'enums.course_type.breakfast', label: 'Petit-déjeuner' },
  { value: 'enums.course_type.soup', label: 'Soupe' }, { value: 'enums.course_type.salad', label: 'Salade' },
];
const UNIT_OPTIONS = ['g', 'kg', 'ml', 'cl', 'l', 'unité', 'càs', 'càc', 'pincée', 'tranche', 'gousse', 'sachet', 'botte', 'feuille'];

function emptyRecipe(): RecipeCommitRequest {
  return { title: '', description: null, instructions: '', servings: 4, prep_time_minutes: null, cook_time_minutes: null, ingredients: [], course_type: null, free_tags: [] };
}

interface Props {
  onClose: () => void;
  onCreated?: (recipe: RecipeResponse) => void;
}

export default function AuroraRecipeCreateModal({ onClose, onCreated }: Props) {
  const [recipe, setRecipe] = useState<RecipeCommitRequest>(emptyRecipe());
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [created, setCreated] = useState<RecipeResponse | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function setField<K extends keyof RecipeCommitRequest>(k: K, v: RecipeCommitRequest[K]) { setRecipe((p) => ({ ...p, [k]: v })); }
  function addIngredient() { setRecipe((p) => ({ ...p, ingredients: [...p.ingredients, { name: '', quantity: 1, unit: 'g' }] })); }
  function updateIngredient(idx: number, f: keyof HydratedIngredient, v: string | number) { setRecipe((p) => ({ ...p, ingredients: p.ingredients.map((ing, i) => i === idx ? { ...ing, [f]: v } : ing) })); }
  function removeIngredient(idx: number) { setRecipe((p) => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) })); }
  function addTag(raw: string) { const t = raw.trim().toLowerCase().replace(/\s+/g, '-'); if (!t) return; setRecipe((p) => p.free_tags.includes(t) ? p : { ...p, free_tags: [...p.free_tags, t] }); setTagInput(''); }
  function removeTag(t: string) { setRecipe((p) => ({ ...p, free_tags: p.free_tags.filter((x) => x !== t) })); }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null; setImageFile(file);
    if (file) { const r = new FileReader(); r.onload = (ev) => setImagePreview(ev.target?.result as string); r.readAsDataURL(file); } else setImagePreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!recipe.title.trim()) return;
    setSubmitting(true); setError('');
    try {
      const created = await createRecipeManual({
        title: recipe.title, description: recipe.description, instructions: recipe.instructions,
        servings: recipe.servings, prep_time_minutes: recipe.prep_time_minutes, cook_time_minutes: recipe.cook_time_minutes,
        course_type: recipe.course_type, free_tags: recipe.free_tags,
        ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      let final = created;
      if (imageFile) { try { final = await uploadRecipeImage(created.id, imageFile); } catch { /* non-bloquant */ } }
      // Phase 2 : on ne ferme pas, on propose de choisir une image Unsplash.
      setCreated(final);
      setSubmitting(false);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur lors de la création'));
      setSubmitting(false);
    }
  }

  function finish() {
    if (created) onCreated?.(created);
    onClose();
  }

  if (created) {
    return (
      <div className="rost-rd-overlay" onClick={finish}>
        <div className="rost-rd-modal" onClick={(e) => e.stopPropagation()}>
          <div className="rost-rd-head">
            <div className="rost-rd-head-actions"><span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>Choisis une image</span></div>
            <button className="rost-icon-btn" type="button" onClick={finish} aria-label="Fermer">✕</button>
          </div>
          <div className="rost-rd-body">
            <p className="rost-rd-text" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 0 }}>
              Recette « {created.title} » créée. Clique sur une image pour l’associer (optionnel), ou affine le mot-clé.
            </p>
            <AuroraImagePicker recipe={created} onChange={setCreated} />
          </div>
          <div className="rost-rd-head" style={{ borderTop: '1px solid var(--rule)', borderBottom: 'none', justifyContent: 'flex-end', gap: 8 }}>
            <button className="rost-add-btn" type="button" onClick={finish}>✓ Terminer</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rost-rd-overlay" onClick={onClose}>
      <div className="rost-rd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rost-rd-head">
          <div className="rost-rd-head-actions"><span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>Nouvelle recette manuelle</span></div>
          <button className="rost-icon-btn" type="button" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="rost-rd-body">
          <form id="manual-recipe-form" onSubmit={handleSubmit} className="rost-rd-cols rost-manual-form">
            <div className="rost-rd-main">
              <label className="rost-form-group"><span>Titre *</span><input className="rost-form-input" value={recipe.title} onChange={(e) => setField('title', e.target.value)} placeholder="Titre de la recette" required /></label>
              <label className="rost-form-group"><span>Classification</span>
                <select className="rost-form-select" value={recipe.course_type ?? ''} onChange={(e) => setField('course_type', e.target.value || null)}>
                  <option value="">— Non défini —</option>{COURSE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="rost-form-group"><span>Description</span><textarea className="rost-textarea" rows={2} value={recipe.description ?? ''} onChange={(e) => setField('description', e.target.value || null)} placeholder="Courte description…" /></label>
              <label className="rost-form-group"><span>Instructions</span><textarea className="rost-textarea" rows={7} value={recipe.instructions} onChange={(e) => setField('instructions', e.target.value)} placeholder="Étapes de préparation…" /></label>
              <div className="rost-form-group">
                <div className="rost-card-head" style={{ marginBottom: 6 }}><span>Ingrédients ({recipe.ingredients.length})</span><button type="button" className="rost-btn" onClick={addIngredient}>+ Ajouter</button></div>
                <p className="rost-rd-text" style={{ fontSize: 11, color: 'var(--dim)' }}>Les macros seront calculées automatiquement après création.</p>
                {recipe.ingredients.length === 0 ? <p className="rost-empty">Aucun ingrédient</p>
                  : recipe.ingredients.map((ing, idx) => (
                    <div className="rost-ing-row" key={idx}>
                      <input className="rost-form-input" placeholder="Ingrédient" value={ing.name} onChange={(e) => updateIngredient(idx, 'name', e.target.value)} />
                      <input className="rost-form-input rost-ing-qty" type="number" min={0} step="0.1" placeholder="Qté" value={ing.quantity} onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                      <select className="rost-form-select rost-ing-unit" value={ing.unit} onChange={(e) => updateIngredient(idx, 'unit', e.target.value)} aria-label="Unité">
                        {(UNIT_OPTIONS.includes(ing.unit) ? UNIT_OPTIONS : [ing.unit, ...UNIT_OPTIONS]).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button type="button" className="rost-item-del" onClick={() => removeIngredient(idx)}>✕</button>
                    </div>
                  ))}
              </div>
              <div className="rost-form-group">
                <span>Tags</span>
                <div className="rost-chips" style={{ marginBottom: 8 }}>{recipe.free_tags.map((t) => <span key={t} className="rost-chip">{t}<button type="button" className="rost-tag-x" onClick={() => removeTag(t)}>×</button></span>)}</div>
                <input className="rost-form-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } if (e.key === 'Backspace' && !tagInput && recipe.free_tags.length) removeTag(recipe.free_tags[recipe.free_tags.length - 1]); }} onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} placeholder="Ajouter un tag…" />
              </div>
            </div>
            <aside className="rost-rd-side">
              <section className="rost-rd-sect">
                <h4 className="rost-rd-sect-label">Photo</h4>
                <label className="rost-img-upload">
                  {imagePreview ? <img src={imagePreview} alt="preview" /> : <div className="rost-img-ph">📷<span>Ajouter une photo</span></div>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                </label>
                {imageFile && <button type="button" className="rost-btn rost-btn-ghost" style={{ marginTop: 8 }} onClick={() => { setImageFile(null); setImagePreview(null); }}>✕ Supprimer</button>}
              </section>
              <section className="rost-rd-sect">
                <h4 className="rost-rd-sect-label">Informations</h4>
                <dl className="rost-rd-info">
                  <div><dt>Portions</dt><dd><input className="rost-rd-input-sm" type="number" min={1} value={recipe.servings} onChange={(e) => setField('servings', parseInt(e.target.value) || 1)} /></dd></div>
                  <div><dt>Prép. (min)</dt><dd><input className="rost-rd-input-sm" type="number" min={0} value={recipe.prep_time_minutes ?? ''} onChange={(e) => setField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)} placeholder="—" /></dd></div>
                  <div><dt>Cuisson (min)</dt><dd><input className="rost-rd-input-sm" type="number" min={0} value={recipe.cook_time_minutes ?? ''} onChange={(e) => setField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)} placeholder="—" /></dd></div>
                </dl>
              </section>
            </aside>
          </form>
        </div>
        <div className="rost-rd-head" style={{ borderTop: '1px solid var(--rule)', borderBottom: 'none', justifyContent: 'flex-end', gap: 8 }}>
          {error && <p className="rost-error" style={{ margin: 0, marginRight: 'auto' }}>{error}</p>}
          <button className="rost-add-btn" type="submit" form="manual-recipe-form" disabled={submitting || !recipe.title.trim()}>{submitting ? 'Création…' : '✓ Créer la recette'}</button>
        </div>
      </div>
    </div>
  );
}
