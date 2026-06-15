// Coffre de santé chiffré (E2E zero-knowledge). TOUTES les données de profil/santé
// (art. 9 RGPD) vivent désormais dans UN document agrégé, chiffré côté client et
// rangé dans le coffre opaque de service-profile (collection « health », ref_key
// « default », padding palier fixe anti-inférence). Le serveur ne voit qu'un
// ciphertext de taille constante ; il ne calcule plus rien sur la santé.
//
// Le calcul métabolique (BMR/TDEE/cible/macros) est fait localement via
// @nutri/e2e-core (computeNutrition), à partir du document déchiffré.

import axios from 'axios';
import {
  encryptBlob,
  decryptBlob,
  HEALTH_PADDING,
  toBase64,
  fromBase64,
  computeNutrition,
  type NutritionResult,
} from '@nutri/e2e-core';
import { profileClient } from './client';
import { requireUserKey } from '../crypto/vault';

export { VaultLockedError } from '../crypto/vault';

const BASE = '/api/v1/profiles/me/blobs/health';
const REF_KEY = 'default';

/** Génère un identifiant client pour les éléments de liste (remplace les slugs serveur). */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Schéma du document santé (agrégé) ───────────────────────────────────────

export type Sex = 'male' | 'female' | 'other';

export interface ProfileCore {
  date_of_birth: string | null;
  biological_sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  nutrition_rules_enabled: boolean;
}

export interface SportsInfo {
  sports: string[];
  practice_level: string;
  sessions_per_week: number;
  avg_session_duration_min: number;
  avg_intensity_rpe: number;
  resting_heart_rate_bpm: number | null;
}

export interface LifestyleInfo {
  profession_activity_level: string | null;
  stress_level: string | null;
  sleep_hours: number | null;
  chronotype: string | null;
  alcohol_frequency: string | null;
  is_smoker: boolean;
  sedentary_hours_per_day: number | null;
}

export interface NutritionInfo {
  diet_type: string;
  main_goal: string;
  meals_per_day: number | null;
  snacks_per_day: number | null;
  practices_if: boolean;
  fasting_window_hours: number | null;
  cooking_level: string | null;
  cooking_time_available: string | null;
  cooking_for: string | null;
  hydration_target_ml: number | null;
  supplements: string[];
  budget_per_day_eur: number | null;
  excluded_foods: string[];
  rules_aggressiveness: number;
  rules_variety_pct: number;
  rules_override_calories: number | null;
  rules_override_proteines: number | null;
}

export interface AllergyItem { id: string; allergen: string; severity: string; notes: string | null; }
export interface ExcludedFoodItem { id: string; food_name: string; reason: string | null; }
export interface ConditionItem { id: string; category: string; condition_name: string; is_current: boolean; notes: string | null; }
export interface MedicationItem { id: string; medication_name: string; impacts_metabolism: boolean; notes: string | null; }
export interface InjuryItem { id: string; body_part: string; injury_type: string; is_current: boolean; is_chronic: boolean; diagnosed_at: string | null; notes: string | null; }
export interface BodyCompositionItem { id: string; measured_at: string; body_fat_percentage: number | null; lean_mass_kg: number | null; bone_mass_kg: number | null; water_percentage: number | null; }
export interface BodyMeasurementsItem { id: string; measured_at: string; waist_cm: number | null; hips_cm: number | null; chest_cm: number | null; shoulders_cm: number | null; left_arm_cm: number | null; right_arm_cm: number | null; left_thigh_cm: number | null; right_thigh_cm: number | null; }
export interface PerformanceItem { id: string; measured_at: string; vo2max: number | null; vma_kmh: number | null; ftp_watts: number | null; one_rm_squat_kg: number | null; one_rm_bench_press_kg: number | null; one_rm_deadlift_kg: number | null; one_rm_overhead_press_kg: number | null; }

/** Document santé complet (1 blob chiffré par compte). */
export interface HealthDocument {
  schema: 1;
  profile: ProfileCore | null;
  sports: SportsInfo | null;
  lifestyle: LifestyleInfo | null;
  nutrition: NutritionInfo | null;
  allergies: AllergyItem[];
  excluded_foods: ExcludedFoodItem[];
  conditions: ConditionItem[];
  medications: MedicationItem[];
  injuries: InjuryItem[];
  body_composition: BodyCompositionItem[];
  body_measurements: BodyMeasurementsItem[];
  performance: PerformanceItem[];
}

/** Document vide (aucune donnée encore saisie). */
export function emptyHealthDocument(): HealthDocument {
  return {
    schema: 1,
    profile: null,
    sports: null,
    lifestyle: null,
    nutrition: null,
    allergies: [],
    excluded_foods: [],
    conditions: [],
    medications: [],
    injuries: [],
    body_composition: [],
    body_measurements: [],
    performance: [],
  };
}

export interface StoredHealth {
  doc: HealthDocument;
  version: number;
}

interface BlobOut {
  collection: string;
  ref_key: string;
  content_version: number;
  ciphertext: string;
}

/** Récupère et déchiffre le document santé. `null` si aucun (404). */
export async function getHealthDoc(): Promise<StoredHealth | null> {
  const uk = requireUserKey();
  try {
    const { data } = await profileClient.get<BlobOut>(`${BASE}/${REF_KEY}`);
    const doc = await decryptBlob<HealthDocument>(uk, fromBase64(data.ciphertext));
    return { doc, version: data.content_version };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Chiffre et range le document santé. `expectedVersion` = verrouillage optimiste
 * (If-Match) ; omis = création. Renvoie la nouvelle version.
 */
export async function putHealthDoc(doc: HealthDocument, expectedVersion?: number): Promise<number> {
  const uk = requireUserKey();
  const ciphertext = toBase64(await encryptBlob(uk, doc, HEALTH_PADDING));
  const headers =
    expectedVersion !== undefined ? { 'If-Match': String(expectedVersion) } : undefined;
  const { data } = await profileClient.put<BlobOut>(
    `${BASE}/${REF_KEY}`,
    { ciphertext },
    headers ? { headers } : undefined,
  );
  return data.content_version;
}

/** Calcule l'âge (années) depuis une date ISO de naissance. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Dérive le calcul métabolique (BMR/TDEE/cible/macros) localement depuis le
 * document santé. `null` si les données anthropométriques sont incomplètes.
 * Remplace l'ancien endpoint serveur GET /profiles/me/calculate.
 */
export function deriveNutrition(doc: HealthDocument): NutritionResult | null {
  const p = doc.profile;
  if (!p || p.weight_kg == null || p.height_cm == null || !p.biological_sex) return null;
  const age = ageFromDob(p.date_of_birth);
  if (age == null) return null;

  const sports = doc.sports
    ? { sessionsPerWeek: doc.sports.sessions_per_week, avgIntensityRpe: doc.sports.avg_intensity_rpe }
    : null;

  return computeNutrition({
    weightKg: p.weight_kg,
    heightCm: p.height_cm,
    age,
    sex: p.biological_sex,
    ...(doc.lifestyle?.profession_activity_level
      ? { activityLevel: doc.lifestyle.profession_activity_level }
      : {}),
    sports,
    ...(doc.nutrition?.main_goal ? { goal: doc.nutrition.main_goal } : {}),
  });
}
