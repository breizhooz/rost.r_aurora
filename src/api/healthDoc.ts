// Adaptateur « endpoints santé » → document chiffré (E2E). Expose les MÊMES
// signatures que les anciennes fonctions serveur de src/api/endpoints.ts
// (getMyProfile, getAllergies, addAllergy, deleteAllergy, upsertNutrition…), mais
// opère entièrement sur le HealthDocument déchiffré (1 blob, collection « health »).
// Ainsi AuroraProfil ne change quasiment pas : seules ses IMPORTS basculent ici.
//
// Le serveur ne voit jamais ces données : tout est (dé)chiffré localement via le
// coffre (healthVault). Le calcul métabolique est dérivé localement (deriveNutrition).

import {
  getHealthDoc,
  putHealthDoc,
  emptyHealthDocument,
  deriveNutrition,
  newId,
  type HealthDocument,
  type ProfileCore,
  type SportsInfo,
  type LifestyleInfo,
  type NutritionInfo,
  type AllergyItem,
  type ExcludedFoodItem,
  type ConditionItem,
  type MedicationItem,
  type InjuryItem,
  type BodyCompositionItem,
  type BodyMeasurementsItem,
  type PerformanceItem,
} from './healthVault';
import type {
  ProfileResponse,
  CalculationResponse,
  SportsProfileResponse,
  LifestyleProfileResponse,
  NutritionPreferencesResponse,
  BodyCompositionResponse,
  BodyMeasurementsResponse,
  PerformanceMetricResponse,
  InjuryResponse,
  FoodAllergyResponse,
  ExcludedFoodResponse,
  MedicalConditionResponse,
  MedicationResponse,
} from '../types';

// ── Cache du document (partagé par les getters d'un même chargement de page) ──
let cache: { doc: HealthDocument; version: number | undefined } | null = null;
let loadPromise: Promise<HealthDocument> | null = null;

/** Réinitialise le cache (à appeler au montage de la page Profil). */
export function resetHealthDocCache(): void {
  cache = null;
  loadPromise = null;
}

async function ensureLoaded(): Promise<HealthDocument> {
  if (cache) return cache.doc;
  if (!loadPromise) {
    loadPromise = (async () => {
      const stored = await getHealthDoc();
      cache = stored
        ? { doc: stored.doc, version: stored.version }
        : { doc: emptyHealthDocument(), version: undefined };
      return cache.doc;
    })();
  }
  return loadPromise;
}

/** Applique une mutation au document, le chiffre et le persiste (verrou optimiste). */
async function commit(mutate: (d: HealthDocument) => void): Promise<HealthDocument> {
  const current = await ensureLoaded();
  const next: HealthDocument = structuredClone(current);
  mutate(next);
  const version = await putHealthDoc(next, cache?.version);
  cache = { doc: next, version };
  return next;
}

// ── Coercition douce des corps de formulaire (FormData → typé) ───────────────
type Body = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));
const sn = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const b = (v: unknown): boolean => v === true || v === 'true';

// ── Mappage item interne → forme « réponse serveur » (slug = id client) ──────
function withMeta<T extends { id: string }>(item: T): T & { slug: string; created_at: string } {
  return { ...item, slug: item.id, created_at: '' };
}

// ── Catégorie IMC (libellé FR) — remplace l'i18n serveur bmi_category ────────
function bmiCategory(bmi: number): string {
  if (bmi < 16) return 'Dénutrition sévère';
  if (bmi < 17) return 'Dénutrition modérée';
  if (bmi < 18.5) return 'Maigreur';
  if (bmi < 25) return 'Corpulence normale';
  if (bmi < 30) return 'Surpoids';
  if (bmi < 35) return 'Obésité modérée';
  if (bmi < 40) return 'Obésité sévère';
  return 'Obésité morbide';
}

// ════════════════════════════════ GETTERS ═══════════════════════════════════

export async function getMyProfile(): Promise<ProfileResponse | null> {
  const doc = await ensureLoaded();
  if (!doc.profile) return null;
  return {
    id: 'local',
    slug: 'local',
    user_id: 'local',
    date_of_birth: doc.profile.date_of_birth,
    biological_sex: doc.profile.biological_sex,
    height_cm: doc.profile.height_cm,
    weight_kg: doc.profile.weight_kg,
    target_weight_kg: doc.profile.target_weight_kg,
    nutrition_rules_enabled: doc.profile.nutrition_rules_enabled,
    created_at: '',
    updated_at: '',
  };
}

export async function getCalculations(): Promise<CalculationResponse | null> {
  const doc = await ensureLoaded();
  const r = deriveNutrition(doc);
  if (!r) return null;
  const goal = doc.nutrition?.main_goal ?? '';
  return {
    bmi: r.bmi,
    bmi_category: bmiCategory(r.bmi),
    bmr_kcal: r.bmrKcal,
    tdee_kcal: r.tdeeKcal,
    pal: r.pal,
    ideal_weight_min_kg: r.idealWeightMinKg,
    ideal_weight_max_kg: r.idealWeightMaxKg,
    macros: r.macros
      ? {
          goal,
          tdee_kcal: r.targetCaloriesKcal ?? r.tdeeKcal,
          proteins_g: r.macros.proteinsG,
          carbs_g: r.macros.carbsG,
          fats_g: r.macros.fatsG,
          proteins_kcal: r.macros.proteinsKcal,
          carbs_kcal: r.macros.carbsKcal,
          fats_kcal: r.macros.fatsKcal,
        }
      : null,
    target_calories_kcal: r.targetCaloriesKcal,
    energy_adjustment_pct: r.energyAdjustmentPct,
    explanation: null,
  };
}

export async function getSportsProfile(): Promise<SportsProfileResponse | null> {
  const doc = await ensureLoaded();
  if (!doc.sports) return null;
  return { id: 'local', slug: 'local', updated_at: '', ...doc.sports };
}

export async function getLifestyle(): Promise<LifestyleProfileResponse | null> {
  const doc = await ensureLoaded();
  if (!doc.lifestyle) return null;
  return { id: 'local', slug: 'local', updated_at: '', ...doc.lifestyle };
}

export async function getNutritionPreferences(): Promise<NutritionPreferencesResponse | null> {
  const doc = await ensureLoaded();
  if (!doc.nutrition) return null;
  return { id: 'local', slug: 'local', updated_at: '', ...doc.nutrition };
}

export async function getBodyComposition(): Promise<BodyCompositionResponse[]> {
  return (await ensureLoaded()).body_composition.map(withMeta);
}
export async function getBodyMeasurements(): Promise<BodyMeasurementsResponse[]> {
  return (await ensureLoaded()).body_measurements.map(withMeta);
}
export async function getPerformanceMetrics(): Promise<PerformanceMetricResponse[]> {
  return (await ensureLoaded()).performance.map(withMeta);
}
export async function getInjuries(): Promise<InjuryResponse[]> {
  return (await ensureLoaded()).injuries.map(withMeta);
}
export async function getAllergies(): Promise<FoodAllergyResponse[]> {
  return (await ensureLoaded()).allergies.map(withMeta);
}
export async function getExcludedFoods(): Promise<ExcludedFoodResponse[]> {
  return (await ensureLoaded()).excluded_foods.map(withMeta);
}
export async function getConditions(): Promise<MedicalConditionResponse[]> {
  return (await ensureLoaded()).conditions.map(withMeta);
}
export async function getMedications(): Promise<MedicationResponse[]> {
  return (await ensureLoaded()).medications.map(withMeta);
}

// ════════════════════════════════ MUTATEURS ═════════════════════════════════

export async function createProfile(body: Body): Promise<ProfileResponse> {
  await commit((d) => {
    d.profile = {
      date_of_birth: sn(body.date_of_birth),
      biological_sex: (sn(body.biological_sex) as ProfileCore['biological_sex']) ?? null,
      height_cm: n(body.height_cm),
      weight_kg: n(body.weight_kg),
      target_weight_kg: n(body.target_weight_kg),
      nutrition_rules_enabled: d.profile?.nutrition_rules_enabled ?? true,
    };
  });
  return (await getMyProfile())!;
}

export async function updateProfile(body: Body): Promise<ProfileResponse> {
  await commit((d) => {
    const base: ProfileCore = d.profile ?? {
      date_of_birth: null,
      biological_sex: null,
      height_cm: null,
      weight_kg: null,
      target_weight_kg: null,
      nutrition_rules_enabled: true,
    };
    d.profile = {
      ...base,
      ...('date_of_birth' in body ? { date_of_birth: sn(body.date_of_birth) } : {}),
      ...('biological_sex' in body
        ? { biological_sex: (sn(body.biological_sex) as ProfileCore['biological_sex']) ?? null }
        : {}),
      ...('height_cm' in body ? { height_cm: n(body.height_cm) } : {}),
      ...('weight_kg' in body ? { weight_kg: n(body.weight_kg) } : {}),
      ...('target_weight_kg' in body ? { target_weight_kg: n(body.target_weight_kg) } : {}),
      ...('nutrition_rules_enabled' in body
        ? { nutrition_rules_enabled: b(body.nutrition_rules_enabled) }
        : {}),
    };
  });
  return (await getMyProfile())!;
}

export async function upsertSports(body: Body): Promise<SportsProfileResponse> {
  await commit((d) => {
    d.sports = {
      sports: Array.isArray(body.sports) ? (body.sports as string[]) : [],
      practice_level: s(body.practice_level),
      sessions_per_week: n(body.sessions_per_week) ?? 0,
      avg_session_duration_min: n(body.avg_session_duration_min) ?? 0,
      avg_intensity_rpe: n(body.avg_intensity_rpe) ?? 0,
      resting_heart_rate_bpm: n(body.resting_heart_rate_bpm),
    } satisfies SportsInfo;
  });
  return (await getSportsProfile())!;
}

export async function upsertLifestyle(body: Body): Promise<LifestyleProfileResponse> {
  await commit((d) => {
    d.lifestyle = {
      profession_activity_level: sn(body.profession_activity_level),
      stress_level: sn(body.stress_level),
      sleep_hours: n(body.sleep_hours),
      chronotype: sn(body.chronotype),
      alcohol_frequency: sn(body.alcohol_frequency),
      is_smoker: b(body.is_smoker),
      sedentary_hours_per_day: n(body.sedentary_hours_per_day),
    } satisfies LifestyleInfo;
  });
  return (await getLifestyle())!;
}

export async function upsertNutrition(body: Body): Promise<NutritionPreferencesResponse> {
  await commit((d) => {
    const base = d.nutrition;
    d.nutrition = {
      diet_type: s(body.diet_type) || base?.diet_type || 'omnivore',
      main_goal: s(body.main_goal) || base?.main_goal || 'maintenance',
      meals_per_day: 'meals_per_day' in body ? n(body.meals_per_day) : base?.meals_per_day ?? null,
      snacks_per_day: 'snacks_per_day' in body ? n(body.snacks_per_day) : base?.snacks_per_day ?? null,
      practices_if: 'practices_if' in body ? b(body.practices_if) : base?.practices_if ?? false,
      fasting_window_hours:
        'fasting_window_hours' in body ? n(body.fasting_window_hours) : base?.fasting_window_hours ?? null,
      cooking_level: 'cooking_level' in body ? sn(body.cooking_level) : base?.cooking_level ?? null,
      cooking_time_available: base?.cooking_time_available ?? null,
      cooking_for: base?.cooking_for ?? null,
      hydration_target_ml:
        'hydration_target_ml' in body ? n(body.hydration_target_ml) : base?.hydration_target_ml ?? null,
      supplements: Array.isArray(body.supplements)
        ? (body.supplements as string[])
        : base?.supplements ?? [],
      budget_per_day_eur:
        'budget_per_day_eur' in body ? n(body.budget_per_day_eur) : base?.budget_per_day_eur ?? null,
      excluded_foods: Array.isArray(body.excluded_foods)
        ? (body.excluded_foods as string[])
        : base?.excluded_foods ?? [],
      rules_aggressiveness:
        'rules_aggressiveness' in body ? n(body.rules_aggressiveness) ?? 1 : base?.rules_aggressiveness ?? 1,
      rules_variety_pct:
        'rules_variety_pct' in body ? n(body.rules_variety_pct) ?? 0.1 : base?.rules_variety_pct ?? 0.1,
      rules_override_calories:
        'rules_override_calories' in body ? n(body.rules_override_calories) : base?.rules_override_calories ?? null,
      rules_override_proteines:
        'rules_override_proteines' in body ? n(body.rules_override_proteines) : base?.rules_override_proteines ?? null,
    } satisfies NutritionInfo;
  });
  return (await getNutritionPreferences())!;
}

// ── Listes : add (avec id client) + delete (par id, alias slug) ──────────────

async function addItem<T extends { id: string }>(
  key: keyof HealthDocument,
  build: () => T,
): Promise<T & { slug: string; created_at: string }> {
  const item = build();
  await commit((d) => {
    (d[key] as unknown as T[]).push(item);
  });
  return withMeta(item);
}

async function deleteItem(key: keyof HealthDocument, id: string): Promise<void> {
  await commit((d) => {
    const arr = d[key] as unknown as { id: string }[];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  });
}

export const addAllergy = (body: Body) =>
  addItem<AllergyItem>('allergies', () => ({
    id: newId(),
    allergen: s(body.allergen),
    severity: s(body.severity),
    notes: sn(body.notes),
  }));
export const deleteAllergy = (slug: string) => deleteItem('allergies', slug);

export const addExcludedFood = (body: Body) =>
  addItem<ExcludedFoodItem>('excluded_foods', () => ({
    id: newId(),
    food_name: s(body.food_name),
    reason: sn(body.reason),
  }));
export const deleteExcludedFood = (slug: string) => deleteItem('excluded_foods', slug);

export const addCondition = (body: Body) =>
  addItem<ConditionItem>('conditions', () => ({
    id: newId(),
    category: s(body.category),
    condition_name: s(body.condition_name),
    is_current: b(body.is_current),
    notes: sn(body.notes),
  }));
export const deleteCondition = (slug: string) => deleteItem('conditions', slug);

export const addMedication = (body: Body) =>
  addItem<MedicationItem>('medications', () => ({
    id: newId(),
    medication_name: s(body.medication_name),
    impacts_metabolism: b(body.impacts_metabolism),
    notes: sn(body.notes),
  }));
export const deleteMedication = (slug: string) => deleteItem('medications', slug);

export const addInjury = (body: Body) =>
  addItem<InjuryItem>('injuries', () => ({
    id: newId(),
    body_part: s(body.body_part),
    injury_type: s(body.injury_type),
    is_current: b(body.is_current),
    is_chronic: b(body.is_chronic),
    diagnosed_at: sn(body.diagnosed_at),
    notes: sn(body.notes),
  }));
export const deleteInjury = (slug: string) => deleteItem('injuries', slug);

export const addBodyComposition = (body: Body) =>
  addItem<BodyCompositionItem>('body_composition', () => ({
    id: newId(),
    measured_at: s(body.measured_at),
    body_fat_percentage: n(body.body_fat_percentage),
    lean_mass_kg: n(body.lean_mass_kg),
    bone_mass_kg: n(body.bone_mass_kg),
    water_percentage: n(body.water_percentage),
  }));
export const deleteBodyComposition = (slug: string) => deleteItem('body_composition', slug);

export const addBodyMeasurements = (body: Body) =>
  addItem<BodyMeasurementsItem>('body_measurements', () => ({
    id: newId(),
    measured_at: s(body.measured_at),
    waist_cm: n(body.waist_cm),
    hips_cm: n(body.hips_cm),
    chest_cm: n(body.chest_cm),
    shoulders_cm: n(body.shoulders_cm),
    left_arm_cm: n(body.left_arm_cm),
    right_arm_cm: n(body.right_arm_cm),
    left_thigh_cm: n(body.left_thigh_cm),
    right_thigh_cm: n(body.right_thigh_cm),
  }));
export const deleteBodyMeasurements = (slug: string) => deleteItem('body_measurements', slug);

export const addPerformanceMetric = (body: Body) =>
  addItem<PerformanceItem>('performance', () => ({
    id: newId(),
    measured_at: s(body.measured_at),
    vo2max: n(body.vo2max),
    vma_kmh: n(body.vma_kmh),
    ftp_watts: n(body.ftp_watts),
    one_rm_squat_kg: n(body.one_rm_squat_kg),
    one_rm_bench_press_kg: n(body.one_rm_bench_press_kg),
    one_rm_deadlift_kg: n(body.one_rm_deadlift_kg),
    one_rm_overhead_press_kg: n(body.one_rm_overhead_press_kg),
  }));
export const deletePerformanceMetric = (slug: string) => deleteItem('performance', slug);
