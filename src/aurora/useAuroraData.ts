import { useCallback, useEffect, useState } from 'react';
import {
  getMe,
  getMyProfile,
  getCalculations,
  getSportsProfile,
  getMenus,
  listAllRecipes,
} from '../api/endpoints';
import { useRefreshSignal } from '../utils/liveRefresh';
import type {
  UserOut,
  ProfileResponse,
  CalculationResponse,
  SportsProfileResponse,
  WeeklyMenuResponse,
  MenuSlotResponse,
  RecipeResponse,
  DayOfWeekKey,
  MealTypeKey,
} from '../types';

const DAY_INDEX: Record<DayOfWeekKey, number> = {
  'enums.day.monday': 0,
  'enums.day.tuesday': 1,
  'enums.day.wednesday': 2,
  'enums.day.thursday': 3,
  'enums.day.friday': 4,
  'enums.day.saturday': 5,
  'enums.day.sunday': 6,
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const MEAL_ORDER: Record<MealTypeKey, number> = {
  'enums.meal_type.breakfast': 0,
  'enums.meal_type.morning_snack': 1,
  'enums.meal_type.lunch': 2,
  'enums.meal_type.afternoon_snack': 3,
  'enums.meal_type.dinner': 4,
};

const MEAL_SLOT_LABEL: Record<MealTypeKey, string> = {
  'enums.meal_type.breakfast': 'Petit-déj',
  'enums.meal_type.morning_snack': 'Collation',
  'enums.meal_type.lunch': 'Déjeuner',
  'enums.meal_type.afternoon_snack': 'Collation',
  'enums.meal_type.dinner': 'Dîner',
};

// Heures indicatives par créneau (le menu ne porte pas d'horaire).
const MEAL_TIME: Record<MealTypeKey, string> = {
  'enums.meal_type.breakfast': '07:30',
  'enums.meal_type.morning_snack': '10:30',
  'enums.meal_type.lunch': '12:45',
  'enums.meal_type.afternoon_snack': '16:30',
  'enums.meal_type.dinner': '20:00',
};

export interface Macros { kcal: number; protein: number; carbs: number; fat: number; }

export interface AuroraMeal {
  slot: string;
  title: string;
  when: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  done: boolean;
}

export interface AuroraWeekDay { day: string; kcal: number; today: boolean; }

export interface AuroraRecipe { title: string; kcal: number; p: number; time: number | null; tag: string; }

export interface AuroraJournalEntry {
  ts: number;
  when: string;
  slot: string;
  title: string;
  slug: string | null;
  src: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  note: string;
}

export interface AuroraStreak {
  bigValue: string;
  bigUnit: string;
  weight: number | null;
  targetWeight: number | null;
  restingHr: number | null;
  sessions: number | null;
}

export interface AuroraViewModel {
  user: { email: string; name: string; initials: string };
  goal: Macros;
  hasGoal: boolean;
  today: Macros;
  meals: AuroraMeal[];
  week: AuroraWeekDay[];
  topRecipes: AuroraRecipe[];
  journal: AuroraJournalEntry[];
  journalIsPlanned: boolean;
  streak: AuroraStreak;
  recipeCount: number;
}

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

function displayName(email: string): string {
  const local = email.split('@')[0].split(/[._-]/)[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function todayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function num(v: number | null | undefined): number {
  return v == null ? 0 : Math.round(v);
}

function pickCurrentMenu(menus: WeeklyMenuResponse[]): WeeklyMenuResponse | null {
  if (menus.length === 0) return null;
  const now = Date.now();
  const withStart = menus
    .map((m) => ({ m, start: new Date(m.start_date).getTime() }))
    .filter((x) => !Number.isNaN(x.start));
  // Menu dont la semaine couvre aujourd'hui, sinon le plus récent passé, sinon le 1er.
  const covering = withStart.find(
    (x) => now >= x.start && now < x.start + 7 * 24 * 3600 * 1000,
  );
  if (covering) return covering.m;
  const past = withStart.filter((x) => x.start <= now).sort((a, b) => b.start - a.start);
  if (past.length) return past[0].m;
  return menus[0];
}

function courseTag(recipe: RecipeResponse | undefined): string {
  if (!recipe) return 'recette';
  const map: Record<string, string> = {
    'enums.course_type.main': 'plat',
    'enums.course_type.starter': 'entrée',
    'enums.course_type.breakfast': 'petit-déj',
    'enums.course_type.snack': 'snack',
    'enums.course_type.dessert': 'dessert',
    'enums.course_type.salad': 'salade',
    'enums.course_type.soup': 'soupe',
    'enums.course_type.side_dish': 'accompagnement',
    'enums.course_type.drink': 'boisson',
  };
  return map[recipe.course_type] ?? 'recette';
}

function buildViewModel(
  user: UserOut,
  profile: ProfileResponse | null,
  calc: CalculationResponse | null,
  sports: SportsProfileResponse | null,
  menu: WeeklyMenuResponse | null,
  menus: WeeklyMenuResponse[],
  recipes: RecipeResponse[],
): AuroraViewModel {
  const recipeMap = new Map<number, RecipeResponse>();
  for (const r of recipes) recipeMap.set(r.id, r);

  // ── Objectifs (vrais : calcul du profil) ───────────────────────────────
  const macros = calc?.macros ?? null;
  const goal: Macros = {
    kcal: num(macros?.tdee_kcal ?? calc?.tdee_kcal),
    protein: num(macros?.proteins_g),
    carbs: num(macros?.carbs_g),
    fat: num(macros?.fats_g),
  };
  const hasGoal = goal.kcal > 0;

  // ── Slots groupés par jour ──────────────────────────────────────────────
  const slotsByDay: Record<number, MenuSlotResponse[]> = {};
  for (const slot of menu?.slots ?? []) {
    const idx = DAY_INDEX[slot.day_of_week] ?? 0;
    (slotsByDay[idx] ??= []).push(slot);
  }
  for (const idx of Object.keys(slotsByDay)) {
    slotsByDay[+idx].sort((a, b) => MEAL_ORDER[a.meal_type] - MEAL_ORDER[b.meal_type]);
  }

  const ti = todayIndex();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const slotMacros = (slot: MenuSlotResponse) => {
    const r = recipeMap.get(slot.recipe_id);
    return {
      title: r?.title ?? `Recette #${slot.recipe_id}`,
      slug: r?.slug ?? null,
      kcal: num(r?.calories_per_serving),
      p: num(r?.proteins_per_serving),
      c: num(r?.carbs_per_serving),
      f: num(r?.fats_per_serving),
    };
  };

  // ── Repas du jour ─────────────────────────────────────────────────────────
  const meals: AuroraMeal[] = (slotsByDay[ti] ?? []).map((slot) => {
    const m = slotMacros(slot);
    const time = MEAL_TIME[slot.meal_type];
    const [hh, mm] = time.split(':').map(Number);
    return {
      slot: MEAL_SLOT_LABEL[slot.meal_type],
      title: m.title,
      when: time,
      kcal: m.kcal,
      p: m.p,
      c: m.c,
      f: m.f,
      done: hh * 60 + mm <= nowMinutes,
    };
  });

  // ── Totaux du jour (planifiés à partir du menu) ─────────────────────────
  const today: Macros = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.p,
      carbs: acc.carbs + m.c,
      fat: acc.fat + m.f,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  // ── Semaine (kcal planifiées par jour) ──────────────────────────────────
  const week: AuroraWeekDay[] = DAY_LABELS.map((day, idx) => {
    const kcal = (slotsByDay[idx] ?? []).reduce((s, slot) => s + slotMacros(slot).kcal, 0);
    return { day, kcal, today: idx === ti };
  });

  // ── Top recettes (par protéines / portion) ──────────────────────────────
  const topRecipes: AuroraRecipe[] = recipes
    .filter((r) => r.proteins_per_serving != null)
    .sort((a, b) => (b.proteins_per_serving ?? 0) - (a.proteins_per_serving ?? 0))
    .slice(0, 5)
    .map((r) => ({
      title: r.title,
      kcal: num(r.calories_per_serving),
      p: num(r.proteins_per_serving),
      time: r.prep_time_minutes,
      tag: courseTag(r),
    }));

  // ── Journal : pas d'endpoint de log → on agrège les menus planifiés ─────
  // (dates réelles pour permettre le filtre 3 jours / semaine / mois)
  const journal: AuroraJournalEntry[] = menus
    .flatMap((mn) => {
      const start = new Date(mn.start_date);
      if (Number.isNaN(start.getTime())) return [] as AuroraJournalEntry[];
      return mn.slots.map((slot) => {
        const m = slotMacros(slot);
        const d = new Date(start);
        d.setDate(start.getDate() + (DAY_INDEX[slot.day_of_week] ?? 0));
        const [hh, mm] = MEAL_TIME[slot.meal_type].split(':').map(Number);
        d.setHours(hh, mm, 0, 0);
        return {
          ts: d.getTime(),
          when: `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${MEAL_TIME[slot.meal_type]}`,
          slot: MEAL_SLOT_LABEL[slot.meal_type],
          title: m.title,
          slug: m.slug,
          src: 'menu planifié',
          kcal: m.kcal,
          p: m.p,
          c: m.c,
          f: m.f,
          note: '',
        };
      });
    })
    .sort((a, b) => b.ts - a.ts);

  // ── Streak / suivi (poids + sport, vraies données) ──────────────────────
  const streak: AuroraStreak = {
    bigValue: profile?.weight_kg != null ? String(Math.round(profile.weight_kg)) : '—',
    bigUnit: 'kg · poids actuel',
    weight: profile?.weight_kg ?? null,
    targetWeight: profile?.target_weight_kg ?? null,
    restingHr: sports?.resting_heart_rate_bpm ?? null,
    sessions: sports?.sessions_per_week ?? null,
  };

  return {
    user: { email: user.email, name: displayName(user.email), initials: initials(user.email) },
    goal,
    hasGoal,
    today,
    meals,
    week,
    topRecipes,
    journal,
    journalIsPlanned: true,
    streak,
    recipeCount: recipes.length,
  };
}

export function useAuroraData() {
  const [vm, setVm] = useState<AuroraViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Compteur de rechargement : incrémenté sur signal de changement de compte
  // pour refetcher avec le nouveau contexte, même sans démontage de la page.
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useRefreshSignal('account', reload);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [user, profile, calc, sports, menus, recipes] = await Promise.all([
          getMe(),
          getMyProfile(),
          getCalculations(),
          getSportsProfile(),
          getMenus(),
          listAllRecipes().catch(() => [] as RecipeResponse[]),
        ]);
        if (cancelled) return;
        const menu = pickCurrentMenu(menus);
        setVm(buildViewModel(user, profile, calc, sports, menu, menus, recipes));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return { vm, loading, error };
}
