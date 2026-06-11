import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import AuroraRecipeModal from './AuroraRecipeModal';
import {
  getMe, getMenus, generateMenu, updateMenu, deleteMenu, listAllRecipes, getCalculations,
} from '../api/endpoints';
import type {
  WeeklyMenuResponse, MenuSlotCreate, MenuSlotResponse, DayOfWeekKey, MealTypeKey, RecipeResponse, UserOut,
} from '../types';

const DAYS: { key: DayOfWeekKey; label: string }[] = [
  { key: 'enums.day.monday', label: 'Lun' },
  { key: 'enums.day.tuesday', label: 'Mar' },
  { key: 'enums.day.wednesday', label: 'Mer' },
  { key: 'enums.day.thursday', label: 'Jeu' },
  { key: 'enums.day.friday', label: 'Ven' },
  { key: 'enums.day.saturday', label: 'Sam' },
  { key: 'enums.day.sunday', label: 'Dim' },
];

const MEALS: { key: MealTypeKey; label: string }[] = [
  { key: 'enums.meal_type.breakfast', label: 'Petit-déj' },
  { key: 'enums.meal_type.morning_snack', label: 'Collation' },
  { key: 'enums.meal_type.lunch', label: 'Déjeuner' },
  { key: 'enums.meal_type.afternoon_snack', label: 'Collation' },
  { key: 'enums.meal_type.dinner', label: 'Dîner' },
];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addDays(date: Date, n: number): Date { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function dayLabel(date: Date): string { return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }

interface SlotEdit { day: DayOfWeekKey; meal: MealTypeKey; currentRecipeId: number | null; }

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

export default function AuroraSemaine() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserOut | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [activeMenu, setActiveMenu] = useState<WeeklyMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [tdee, setTdee] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [slotEdit, setSlotEdit] = useState<SlotEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [persons, setPersons] = useState(2);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [detailSlot, setDetailSlot] = useState<MenuSlotResponse | null>(null);

  const weekKey = isoDate(weekStart);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, calc] = await Promise.all([getMenus(), getCalculations()]);
      if (calc?.tdee_kcal) setTdee(Math.round(calc.tdee_kcal));
      const found = all.find((m) => m.start_date === weekKey) ?? null;
      setActiveMenu(found);
      if (found) setPersons(found.nb_persons);
    } catch { setActiveMenu(null); }
    setLoading(false);
  }, [weekKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { listAllRecipes().then((it) => it.length && setRecipes(it)).catch(() => {}); }, []);

  async function handleGenerate() {
    setGenerating(true); setGenError('');
    try {
      const menu = await generateMenu({ start_date: weekKey, nb_persons: persons, caloric_target: tdee ?? undefined });
      setActiveMenu(menu);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setGenError(detail ?? "Impossible de générer le menu. Vérifiez que des recettes sont disponibles.");
    }
    setGenerating(false);
  }

  async function handleDeleteMenu() {
    if (!activeMenu || !confirm('Supprimer ce menu ?')) return;
    try { await deleteMenu(activeMenu.id); setActiveMenu(null); } catch { /* ignore */ }
  }

  function getSlot(day: DayOfWeekKey, meal: MealTypeKey) {
    return activeMenu?.slots.find((s) => s.day_of_week === day && s.meal_type === meal) ?? null;
  }
  function toCreate(s: MenuSlotResponse): MenuSlotCreate {
    return { day_of_week: s.day_of_week, meal_type: s.meal_type, recipe_id: s.recipe_id, nb_persons: s.nb_persons };
  }

  async function handleSlotRemove(day: DayOfWeekKey, meal: MealTypeKey) {
    if (!activeMenu) return;
    setSaving(true);
    try {
      const slots = activeMenu.slots.filter((s) => !(s.day_of_week === day && s.meal_type === meal)).map(toCreate);
      setActiveMenu(await updateMenu(activeMenu.id, { slots }));
    } catch { /* ignore */ }
    setSaving(false);
  }

  function openDetail(day: DayOfWeekKey, meal: MealTypeKey) {
    const slot = getSlot(day, meal);
    if (!slot) return;
    const recipe = recipes.find((r) => r.id === slot.recipe_id);
    if (recipe?.slug) { setDetailSlot(slot); setDetailSlug(recipe.slug); }
  }

  async function handleSlotPersonsChange(day: DayOfWeekKey, meal: MealTypeKey, newPersons: number) {
    if (!activeMenu) return;
    const slots: MenuSlotCreate[] = activeMenu.slots.map((s) =>
      s.day_of_week === day && s.meal_type === meal
        ? { ...toCreate(s), nb_persons: newPersons }
        : toCreate(s),
    );
    const updated = await updateMenu(activeMenu.id, { slots });
    setActiveMenu(updated);
    setDetailSlot(updated.slots.find((s) => s.day_of_week === day && s.meal_type === meal) ?? null);
  }

  async function handleSlotSave(recipeId: number) {
    if (!slotEdit || !activeMenu) return;
    setSaving(true);
    try {
      const slots: MenuSlotCreate[] = [
        ...activeMenu.slots.filter((s) => !(s.day_of_week === slotEdit.day && s.meal_type === slotEdit.meal)).map(toCreate),
        { day_of_week: slotEdit.day, meal_type: slotEdit.meal, recipe_id: recipeId, nb_persons: activeMenu.nb_persons },
      ];
      setActiveMenu(await updateMenu(activeMenu.id, { slots }));
      setSlotEdit(null);
    } catch { /* ignore */ }
    setSaving(false);
  }

  const isCurrentWeek = isoDate(getMonday(new Date())) === weekKey;
  const filteredRecipes = recipeSearch.trim()
    ? recipes.filter((r) => r.title.toLowerCase().includes(recipeSearch.toLowerCase()))
    : recipes;

  // Calories planifiées par personne : somme des kcal/portion des recettes du créneau.
  function dayKcal(day: DayOfWeekKey): number {
    return MEALS.reduce((sum, meal) => {
      const slot = getSlot(day, meal.key);
      const recipe = slot ? recipes.find((r) => r.id === slot.recipe_id) : null;
      return sum + (recipe?.calories_per_serving ?? 0);
    }, 0);
  }
  const weekKcal = DAYS.reduce((s, d) => s + dayKcal(d.key), 0);

  return (
    <AuroraShell screen="semaine" initials={user ? initials(user.email) : undefined}
      title="Semaine" subtitle={tdee ? `${tdee} kcal / jour` : undefined}>
      <div className="rost-page">
        <div className="rost-toolbar">
          <div className="rost-week-nav">
            <button className="rost-icon-btn" onClick={() => setWeekStart((p) => addDays(p, -7))}>‹</button>
            <span className="rost-week-label">
              {dayLabel(weekStart)} – {dayLabel(addDays(weekStart, 6))}
              {!isCurrentWeek && (
                <button className="rost-link-btn" onClick={() => setWeekStart(getMonday(new Date()))}>aujourd'hui</button>
              )}
            </span>
            <button className="rost-icon-btn" onClick={() => setWeekStart((p) => addDays(p, 7))}>›</button>
          </div>
          <div className="rost-toolbar-actions">
            {activeMenu && (
              <button className="rost-btn" onClick={() => navigate(`/courses?menu=${activeMenu.id}`)}>🛒 Courses</button>
            )}
            {activeMenu && <button className="rost-btn rost-btn-ghost" onClick={handleDeleteMenu}>Supprimer</button>}
            <label className="rost-persons" title="Personnes par défaut">
              👥<input type="number" min={1} value={persons}
                onChange={(e) => setPersons(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <button className="rost-add-btn" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Génération…' : activeMenu ? '↺ Regénérer' : '+ Générer'}
            </button>
          </div>
        </div>

        {genError && <p className="rost-error">{genError}</p>}

        {loading ? (
          <div className="rost-skel" style={{ height: 420 }} />
        ) : (
          <>
            {!activeMenu && (
              <div className="rost-empty rost-empty-block">
                Aucun menu pour cette semaine. « Générer » crée un planning auto depuis vos recettes et votre cible calorique.
              </div>
            )}
            {activeMenu && (
              <div className="rost-week-summary">
                <span className="rost-week-summary-label">Total semaine</span>
                <span className="rost-week-summary-val">{Math.round(weekKcal)} kcal<em>/ pers.</em></span>
                {tdee != null && <span className="rost-week-summary-hint">cible ≈ {tdee * 7} kcal sur 7 jours</span>}
              </div>
            )}
            <div className="rost-agenda">
              <div className="rost-agenda-grid">
                <div className="rost-agenda-corner" />
                {DAYS.map((d, i) => (
                  <div className="rost-agenda-dayhead" key={d.key}>
                    <span className="rost-agenda-dayname">{d.label}</span>
                    <span className="rost-agenda-daydate">{dayLabel(addDays(weekStart, i))}</span>
                  </div>
                ))}
                {MEALS.map((meal) => (
                  <div key={meal.key} style={{ display: 'contents' }}>
                    <div className="rost-agenda-meal">{meal.label}</div>
                    {DAYS.map((day) => {
                      const slot = getSlot(day.key, meal.key);
                      const recipe = slot ? recipes.find((r) => r.id === slot.recipe_id) : null;
                      return (
                        <div
                          key={`${day.key}-${meal.key}`}
                          className={`rost-agenda-cell ${slot ? 'is-filled' : ''} ${!activeMenu ? 'is-disabled' : ''}`}
                          onClick={() => {
                            if (!activeMenu) return;
                            if (slot) openDetail(day.key, meal.key);
                            else setSlotEdit({ day: day.key, meal: meal.key, currentRecipeId: null });
                          }}
                        >
                          {slot ? (
                            <>
                              {(recipe?.image_thumb_url || recipe?.image_url) && (
                                <img className="rost-agenda-thumb" src={recipe.image_thumb_url ?? recipe.image_url ?? ''} alt="" loading="lazy" />
                              )}
                              <span className="rost-agenda-title">{recipe?.title ?? `#${slot.recipe_id}`}</span>
                              <span className="rost-agenda-cal">
                                {recipe?.calories_per_serving ? `${Math.round(recipe.calories_per_serving)} kcal` : ''} · 👥{slot.nb_persons}
                              </span>
                              <button
                                className="rost-agenda-edit"
                                title="Changer la recette"
                                onClick={(e) => { e.stopPropagation(); setSlotEdit({ day: day.key, meal: meal.key, currentRecipeId: slot.recipe_id }); }}
                              >✎</button>
                              <button
                                className="rost-agenda-remove"
                                title="Retirer"
                                onClick={(e) => { e.stopPropagation(); handleSlotRemove(day.key, meal.key); }}
                              >×</button>
                            </>
                          ) : (activeMenu && <span className="rost-agenda-add">+</span>)}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {activeMenu && (
                  <div style={{ display: 'contents' }}>
                    <div className="rost-agenda-meal rost-agenda-total-label">Σ / jour</div>
                    {DAYS.map((day) => {
                      const kcal = Math.round(dayKcal(day.key));
                      return (
                        <div className="rost-agenda-total" key={`total-${day.key}`}>
                          <span>{kcal > 0 ? kcal : '—'}</span><em>kcal / pers.</em>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {slotEdit && (
        <div className="rost-overlay" onClick={() => setSlotEdit(null)}>
          <div className="rost-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rost-modal-head">
              <h3>{MEALS.find((m) => m.key === slotEdit.meal)?.label} — {DAYS.find((d) => d.key === slotEdit.day)?.label}</h3>
              <button className="rost-icon-btn" onClick={() => setSlotEdit(null)}>✕</button>
            </div>
            <input className="rost-modal-search" placeholder="Rechercher une recette…"
              value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
            <div className="rost-modal-list">
              {filteredRecipes.length === 0 ? (
                <p className="rost-empty">Aucune recette trouvée.</p>
              ) : filteredRecipes.map((r) => (
                <button key={r.id}
                  className={`rost-recipe-option ${slotEdit.currentRecipeId === r.id ? 'is-active' : ''}`}
                  onClick={() => handleSlotSave(r.id)} disabled={saving}>
                  <span className="rost-recipe-option-title">{r.title}</span>
                  {r.calories_per_serving && <span className="rost-recipe-option-cal">{Math.round(r.calories_per_serving)} kcal</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {detailSlug && (
        <AuroraRecipeModal
          slug={detailSlug}
          slotPersons={detailSlot?.nb_persons}
          onSlotPersonsChange={
            detailSlot ? (n) => handleSlotPersonsChange(detailSlot.day_of_week, detailSlot.meal_type, n) : undefined
          }
          onClose={() => { setDetailSlug(null); setDetailSlot(null); }}
        />
      )}
    </AuroraShell>
  );
}
