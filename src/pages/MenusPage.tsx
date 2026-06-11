import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import RecipeDetailModal from '../components/RecipeDetailModal';
import {
  getMenus,
  generateMenu,
  updateMenu,
  deleteMenu,
  listAllRecipes,
  getCalculations,
} from '../api/endpoints';
import type {
  WeeklyMenuResponse,
  MenuSlotCreate,
  MenuSlotResponse,
  DayOfWeekKey,
  MealTypeKey,
  RecipeResponse,
} from '../types';
import styles from './MenusPage.module.css';

const DAYS: { key: DayOfWeekKey; label: string }[] = [
  { key: 'enums.day.monday',    label: 'Lun' },
  { key: 'enums.day.tuesday',   label: 'Mar' },
  { key: 'enums.day.wednesday', label: 'Mer' },
  { key: 'enums.day.thursday',  label: 'Jeu' },
  { key: 'enums.day.friday',    label: 'Ven' },
  { key: 'enums.day.saturday',  label: 'Sam' },
  { key: 'enums.day.sunday',    label: 'Dim' },
];

const MEALS: { key: MealTypeKey; label: string }[] = [
  { key: 'enums.meal_type.breakfast',       label: 'Petit-déjeuner' },
  { key: 'enums.meal_type.morning_snack',   label: 'Collation matin' },
  { key: 'enums.meal_type.lunch',           label: 'Déjeuner' },
  { key: 'enums.meal_type.afternoon_snack', label: 'Collation aprèm' },
  { key: 'enums.meal_type.dinner',          label: 'Dîner' },
];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(date: Date): string {
  // Format en date locale (pas toISOString/UTC) pour éviter un décalage d'un jour
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

interface SlotEdit {
  day: DayOfWeekKey;
  meal: MealTypeKey;
  currentRecipeId: number | null;
}

interface CellMenuState {
  day: DayOfWeekKey;
  meal: MealTypeKey;
}

export default function MenusPage() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [activeMenu, setActiveMenu] = useState<WeeklyMenuResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]   = useState('');
  const [tdee, setTdee]           = useState<number | null>(null);

  const [recipes, setRecipes]     = useState<RecipeResponse[]>([]);
  const [slotEdit, setSlotEdit]   = useState<SlotEdit | null>(null);
  const [saving, setSaving]       = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');

  const [recipeDetailSlug, setRecipeDetailSlug] = useState<string | null>(null);
  const [detailSlot, setDetailSlot] = useState<MenuSlotResponse | null>(null);
  const [persons, setPersons] = useState(2);
  const [cellMenu, setCellMenu] = useState<CellMenuState | null>(null);
  const cellMenuRef = useRef<CellMenuState | null>(null);
  cellMenuRef.current = cellMenu;

  const weekKey = isoDate(weekStart);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, calc] = await Promise.all([getMenus(), getCalculations()]);
      // Cible des menus = cible énergétique de l'objectif (déficit/surplus
      // appliqué) si disponible, sinon la maintenance (TDEE).
      const target = calc?.target_calories_kcal ?? calc?.tdee_kcal;
      if (target) setTdee(Math.round(target));
      const found = all.find(m => m.start_date === weekKey) ?? null;
      setActiveMenu(found);
      if (found) setPersons(found.nb_persons);
    } catch {
      setActiveMenu(null);
    }
    setLoading(false);
  }, [weekKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listAllRecipes()
      .then(items => { if (items.length) setRecipes(items); })
      .catch(() => {});
  }, []);

  // Close cell dropdown on any outside click
  useEffect(() => {
    if (!cellMenu) return;
    const close = () => setCellMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [cellMenu]);

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const menu = await generateMenu({
        start_date: weekKey,
        nb_persons: persons,
        caloric_target: tdee ?? undefined,
      });
      setActiveMenu(menu);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setGenError(detail ?? "Impossible de générer le menu. Vérifiez que des recettes sont disponibles.");
    }
    setGenerating(false);
  }

  async function handleDeleteMenu() {
    if (!activeMenu || !confirm('Supprimer ce menu ?')) return;
    try {
      await deleteMenu(activeMenu.id);
      setActiveMenu(null);
    } catch { /* ignore */ }
  }

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)); }
  function nextWeek() { setWeekStart(prev => addDays(prev, 7)); }

  function getSlot(day: DayOfWeekKey, meal: MealTypeKey) {
    return activeMenu?.slots.find(s => s.day_of_week === day && s.meal_type === meal) ?? null;
  }

  function openSlotEdit(day: DayOfWeekKey, meal: MealTypeKey) {
    if (!activeMenu) return;
    const slot = getSlot(day, meal);
    setSlotEdit({ day, meal, currentRecipeId: slot?.recipe_id ?? null });
    setRecipeSearch('');
  }

  function handleCellClick(day: DayOfWeekKey, meal: MealTypeKey) {
    if (!activeMenu) return;
    // If a dropdown is open, just close it
    if (cellMenuRef.current) {
      setCellMenu(null);
      return;
    }
    const slot = getSlot(day, meal);
    if (slot) {
      const recipe = recipes.find(r => r.id === slot.recipe_id);
      if (recipe?.slug) {
        setDetailSlot(slot);
        setRecipeDetailSlug(recipe.slug);
      }
    } else {
      openSlotEdit(day, meal);
    }
  }

  function toggleCellMenu(e: React.MouseEvent, day: DayOfWeekKey, meal: MealTypeKey) {
    e.stopPropagation();
    setCellMenu(prev =>
      prev?.day === day && prev?.meal === meal ? null : { day, meal }
    );
  }

  function toCreate(s: MenuSlotResponse): MenuSlotCreate {
    return {
      day_of_week: s.day_of_week,
      meal_type: s.meal_type,
      recipe_id: s.recipe_id,
      nb_persons: s.nb_persons,
    };
  }

  async function handleSlotRemove(day: DayOfWeekKey, meal: MealTypeKey) {
    if (!activeMenu) return;
    setSaving(true);
    try {
      const slots: MenuSlotCreate[] = activeMenu.slots
        .filter(s => !(s.day_of_week === day && s.meal_type === meal))
        .map(toCreate);
      const updated = await updateMenu(activeMenu.id, { slots });
      setActiveMenu(updated);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleSlotSave(recipeId: number) {
    if (!slotEdit || !activeMenu) return;
    setSaving(true);
    try {
      const slots: MenuSlotCreate[] = [
        ...activeMenu.slots
          .filter(s => !(s.day_of_week === slotEdit.day && s.meal_type === slotEdit.meal))
          .map(toCreate),
        {
          day_of_week: slotEdit.day,
          meal_type: slotEdit.meal,
          recipe_id: recipeId,
          nb_persons: activeMenu.nb_persons,
        },
      ];
      const updated = await updateMenu(activeMenu.id, { slots });
      setActiveMenu(updated);
      setSlotEdit(null);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleSlotPersonsChange(
    day: DayOfWeekKey,
    meal: MealTypeKey,
    newPersons: number,
  ) {
    if (!activeMenu) return;
    const slots: MenuSlotCreate[] = activeMenu.slots.map(s =>
      s.day_of_week === day && s.meal_type === meal
        ? { ...toCreate(s), nb_persons: newPersons }
        : toCreate(s)
    );
    const updated = await updateMenu(activeMenu.id, { slots });
    setActiveMenu(updated);
    // Les slots sont recréés (nouveaux ids) : on retrouve par (jour, repas), clé stable.
    setDetailSlot(
      updated.slots.find(s => s.day_of_week === day && s.meal_type === meal) ?? null
    );
  }

  const isCurrentWeek = isoDate(getMonday(new Date())) === weekKey;
  const filteredRecipes = recipeSearch.trim()
    ? recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase()))
    : recipes;

  return (
    <Layout>
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Menus de la semaine</h1>
            {tdee && <span className={styles.tdeeChip}>{tdee} kcal / jour</span>}
          </div>
          <div className={styles.headerActions}>
            {activeMenu && (
              <button
                className={styles.btnCart}
                onClick={() => navigate(`/courses?menu=${activeMenu.id}`)}
              >
                🛒 Générer la liste de courses
              </button>
            )}
            {activeMenu && (
              <button className={styles.btnDanger} onClick={handleDeleteMenu}>Supprimer</button>
            )}
            <label className={styles.personsControl} title="Nombre de personnes par défaut du menu">
              <span aria-hidden>👥</span>
              <input
                type="number"
                min={1}
                className={styles.personsInput}
                value={persons}
                onChange={e => setPersons(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <button className={styles.btnPrimary} onClick={handleGenerate} disabled={generating}>
              {generating
                ? <><span className={styles.spinner} /> Génération…</>
                : activeMenu ? '↺ Regénérer' : '+ Générer un menu'}
            </button>
          </div>
        </div>

        {genError && <p className={styles.error}>{genError}</p>}

        {/* Week navigation */}
        <div className={styles.weekNav}>
          <button className={styles.navBtn} onClick={prevWeek}>‹</button>
          <div className={styles.weekLabel}>
            Semaine du <strong>{dayLabel(weekStart)}</strong> au <strong>{dayLabel(addDays(weekStart, 6))}</strong>
            {!isCurrentWeek && (
              <button className={styles.todayBtn} onClick={() => setWeekStart(getMonday(new Date()))}>
                Aujourd'hui
              </button>
            )}
          </div>
          <button className={styles.navBtn} onClick={nextWeek}>›</button>
        </div>

        {loading ? (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonLabel} />
                {Array.from({ length: 7 }).map((__, j) => (
                  <div key={j} className={styles.skeletonCell} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            {!activeMenu && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📅</div>
                <p className={styles.emptyText}>Aucun menu pour cette semaine.</p>
                <p className={styles.emptyHint}>
                  Cliquez sur « Générer un menu » pour créer un planning automatique basé sur vos recettes et votre profil calorique.
                </p>
              </div>
            )}

            {/* Agenda */}
            <div className={styles.agenda}>
              <div className={styles.agendaGrid}>
                {/* Corner */}
                <div className={styles.cornerCell} />
                {/* Day headers */}
                {DAYS.map((d, i) => (
                  <div key={d.key} className={styles.dayHeader}>
                    <span className={styles.dayName}>{d.label}</span>
                    <span className={styles.dayDate}>{dayLabel(addDays(weekStart, i))}</span>
                  </div>
                ))}

                {/* Meal rows */}
                {MEALS.map(meal => (
                  <>
                    <div key={`label-${meal.key}`} className={styles.mealLabel}>
                      {meal.label}
                    </div>
                    {DAYS.map(day => {
                      const slot = getSlot(day.key, meal.key);
                      const recipe = slot ? recipes.find(r => r.id === slot.recipe_id) : null;
                      const isMenuOpen = cellMenu?.day === day.key && cellMenu?.meal === meal.key;

                      return (
                        <div
                          key={`${day.key}-${meal.key}`}
                          className={`${styles.cell} ${slot ? styles.cellFilled : styles.cellEmpty} ${!activeMenu ? styles.cellDisabled : ''} ${isMenuOpen ? styles.cellMenuOpen : ''}`}
                          onClick={() => handleCellClick(day.key, meal.key)}
                        >
                          {slot ? (
                            <>
                              <div className={styles.slotContent}>
                                {recipe?.image_url && (
                                  <img src={recipe.image_url} alt="" className={styles.slotImg} />
                                )}
                                <span className={styles.slotTitle}>
                                  {recipe?.title ?? `#${slot.recipe_id}`}
                                </span>
                                <span className={styles.slotPersons} title={`${slot.nb_persons} personne(s)`}>
                                  👥 {slot.nb_persons}
                                </span>
                                {recipe?.calories_per_serving && (
                                  <span className={styles.slotCal}>
                                    {Math.round(recipe.calories_per_serving)} kcal
                                  </span>
                                )}
                              </div>

                              {/* ··· button */}
                              <button
                                className={styles.slotMenuBtn}
                                onClick={e => toggleCellMenu(e, day.key, meal.key)}
                                title="Options"
                              >
                                ···
                              </button>

                              {/* Dropdown */}
                              {isMenuOpen && (
                                <div
                                  className={styles.slotDropdown}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    className={styles.dropdownItem}
                                    onClick={() => { setCellMenu(null); openSlotEdit(day.key, meal.key); }}
                                  >
                                    Changer la recette
                                  </button>
                                  <button
                                    className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                    onClick={() => { setCellMenu(null); handleSlotRemove(day.key, meal.key); }}
                                    disabled={saving}
                                  >
                                    Retirer ce repas
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            activeMenu && <span className={styles.addHint}>+</span>
                          )}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Recipe picker modal (empty slot or "Changer") */}
        {slotEdit && (
          <div className={styles.overlay} onClick={() => setSlotEdit(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  {MEALS.find(m => m.key === slotEdit.meal)?.label}
                  {' — '}
                  {DAYS.find(d => d.key === slotEdit.day)?.label}
                </h3>
                <button className={styles.closeBtn} onClick={() => setSlotEdit(null)}>✕</button>
              </div>

              <input
                className={styles.recipeSearch}
                placeholder="Rechercher une recette…"
                value={recipeSearch}
                onChange={e => setRecipeSearch(e.target.value)}
              />

              <div className={styles.recipeList}>
                {filteredRecipes.length === 0 ? (
                  <p className={styles.empty}>Aucune recette trouvée.</p>
                ) : (
                  filteredRecipes.map(r => (
                    <button
                      key={r.id}
                      className={`${styles.recipeOption} ${slotEdit.currentRecipeId === r.id ? styles.recipeOptionActive : ''}`}
                      onClick={() => handleSlotSave(r.id)}
                      disabled={saving}
                    >
                      {r.image_url && <img src={r.image_url} alt="" className={styles.recipeOptionImg} />}
                      <span className={styles.recipeOptionTitle}>{r.title}</span>
                      {r.calories_per_serving && (
                        <span className={styles.recipeOptionCal}>{Math.round(r.calories_per_serving)} kcal</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recipe detail modal */}
        {recipeDetailSlug && (
          <RecipeDetailModal
            slug={recipeDetailSlug}
            slotPersons={detailSlot?.nb_persons}
            onSlotPersonsChange={
              detailSlot
                ? (n) => handleSlotPersonsChange(detailSlot.day_of_week, detailSlot.meal_type, n)
                : undefined
            }
            onClose={() => { setRecipeDetailSlug(null); setDetailSlot(null); }}
          />
        )}

      </main>
    </Layout>
  );
}
