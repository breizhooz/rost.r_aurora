// Profil : données corporelles SUR L'APPAREIL + préférences/cibles côté SERVEUR.
//
// Allègement RGPD (2026-10-24) — fin du coffre chiffré et des données médicales :
//   • poids, taille, naissance, sexe et activité restent dans ce navigateur
//     (localStorage, par compte) et ne sont JAMAIS envoyés au serveur ;
//   • le calcul BMR/TDEE/cibles se fait ici (@nutri/e2e-core, avec le plancher
//     physiologique) ; seules les cibles (kcal + macros) partent au serveur ;
//   • objectif, régime, préférences et aliments exclus vivent dans service-profile
//     (GET/PATCH /api/v1/profiles/me). Les allergies sont de simples aliments exclus.
//
// Les signatures reprennent celles des anciens endpoints (getMyProfile,
// upsertNutrition…) pour que les écrans changent le moins possible.

import axios from 'axios';
import { computeNutrition, type NutritionResult } from '@nutri/e2e-core';
import { profileClient } from './client';
import { decodeAccessContext } from '../utils/accessContext';
import type {
  ProfileResponse,
  CalculationResponse,
  SportsProfileResponse,
  LifestyleProfileResponse,
  NutritionPreferencesResponse,
  ExcludedFoodResponse,
} from '../types';

// ══════════════════════════ Données de l'appareil ═══════════════════════════

type Sex = 'male' | 'female' | 'other';

interface BodyCore {
  date_of_birth: string | null;
  biological_sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
}

interface SportsInfo {
  sports: string[];
  practice_level: string;
  sessions_per_week: number;
  avg_session_duration_min: number;
  avg_intensity_rpe: number;
}

interface ActivityInfo {
  profession_activity_level: string | null;
  sedentary_hours_per_day: number | null;
}

interface DeviceData {
  schema: 2;
  body: BodyCore | null;
  sports: SportsInfo | null;
  activity: ActivityInfo | null;
}

const EMPTY_DEVICE: DeviceData = { schema: 2, body: null, sports: null, activity: null };

/** Clé de stockage par compte actif (un appareil peut servir plusieurs comptes). */
function deviceKey(): string {
  return `rost.device-profile.${decodeAccessContext().actAccount ?? 'default'}`;
}

function readDevice(): DeviceData {
  try {
    const raw = localStorage.getItem(deviceKey());
    if (!raw) return { ...EMPTY_DEVICE };
    const parsed = JSON.parse(raw) as Partial<DeviceData>;
    return { ...EMPTY_DEVICE, ...parsed, schema: 2 };
  } catch {
    return { ...EMPTY_DEVICE };
  }
}

/** Efface les données physiques du compte actif sur cet appareil (suppression de compte). */
export function clearDeviceProfile(): void {
  try {
    localStorage.removeItem(deviceKey());
  } catch {
    /* stockage indisponible : rien à effacer */
  }
}

function writeDevice(data: DeviceData): void {
  try {
    localStorage.setItem(deviceKey(), JSON.stringify(data));
  } catch {
    throw new Error('Stockage local indisponible : impossible d’enregistrer sur cet appareil.');
  }
}

// ══════════════════════════ Profil serveur ══════════════════════════════════

interface ServerProfile {
  account_id: string;
  main_goal: string;
  diet_type: string;
  diet_type_other: string | null;
  meals_per_day: number | null;
  snacks_per_day: number | null;
  practices_if: boolean;
  fasting_window_hours: number | null;
  cooking_level: string | null;
  cooking_time_available: string | null;
  cooking_for: string | null;
  budget_per_day_eur: string | number | null;
  excluded_foods: string[];
  nutrition_rules_enabled: boolean;
  rules_variety_pct: number;
  rules_override_calories: number | null;
  rules_override_proteines: number | null;
  target_calories_kcal: number | null;
  target_proteins_g: number | null;
  target_carbs_g: number | null;
  target_fats_g: number | null;
  updated_at: string;
}

const PROFILE_URL = '/api/v1/profiles/me';
let serverCache: Promise<ServerProfile | null> | null = null;
// Compte pour lequel `serverCache` a été rempli : un changement de compte actif
// invalide le cache (sinon on afficherait le profil du compte précédent).
let serverCacheAccount: string | null = null;

/** Réinitialise le cache du profil serveur (à appeler au montage de la page Profil). */
export function resetHealthDocCache(): void {
  serverCache = null;
}

function loadServer(): Promise<ServerProfile | null> {
  const account = decodeAccessContext().actAccount ?? null;
  if (account !== serverCacheAccount) {
    serverCache = null;
    serverCacheAccount = account;
  }
  if (!serverCache) {
    serverCache = profileClient
      .get<ServerProfile>(PROFILE_URL)
      .then(({ data }) => data)
      .catch((err) => {
        serverCache = null;
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      });
  }
  return serverCache;
}

async function patchServer(patch: Record<string, unknown>): Promise<ServerProfile> {
  const { data } = await profileClient.patch<ServerProfile>(PROFILE_URL, patch);
  serverCache = Promise.resolve(data);
  return data;
}

// ══════════════════════════ Calcul local + envoi des cibles ═════════════════

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

function derive(device: DeviceData, goal: string | null): NutritionResult | null {
  const p = device.body;
  if (!p || p.weight_kg == null || p.height_cm == null || !p.biological_sex) return null;
  const age = ageFromDob(p.date_of_birth);
  if (age == null) return null;
  return computeNutrition({
    weightKg: p.weight_kg,
    heightCm: p.height_cm,
    age,
    sex: p.biological_sex,
    ...(device.activity?.profession_activity_level
      ? { activityLevel: device.activity.profession_activity_level }
      : {}),
    sports: device.sports
      ? { sessionsPerWeek: device.sports.sessions_per_week, avgIntensityRpe: device.sports.avg_intensity_rpe }
      : null,
    ...(goal ? { goal } : {}),
  });
}

/**
 * Recalcule les cibles sur l'appareil et les envoie au serveur (menus, recherche).
 * Seul le RÉSULTAT part : jamais le poids, la taille, l'âge ni le sexe.
 * Sans consentement (403), les cibles restent locales : le bandeau du profil
 * invite à le donner.
 */
async function syncTargets(): Promise<void> {
  const server = await loadServer();
  const r = derive(readDevice(), server?.main_goal ?? null);
  if (!r) return;
  try {
    await patchServer({
      target_calories_kcal: Math.round(r.targetCaloriesKcal ?? r.tdeeKcal),
      target_proteins_g: r.macros?.proteinsG ?? null,
      target_carbs_g: r.macros?.carbsG ?? null,
      target_fats_g: r.macros?.fatsG ?? null,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 403) return;
    throw err;
  }
}

// ══════════════════════════ Mappage vers les formes « réponse » ═════════════

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

type Body = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));
const sn = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const b = (v: unknown): boolean => v === true || v === 'true';

// ════════════════════════════════ GETTERS ═══════════════════════════════════

export async function getMyProfile(): Promise<ProfileResponse | null> {
  const body = readDevice().body;
  if (!body) return null;
  const server = await loadServer();
  return {
    id: 'device',
    slug: 'device',
    user_id: 'device',
    ...body,
    nutrition_rules_enabled: server?.nutrition_rules_enabled ?? true,
    created_at: '',
    updated_at: '',
  };
}

export async function getCalculations(): Promise<CalculationResponse | null> {
  const server = await loadServer();
  const goal = server?.main_goal ?? null;
  const r = derive(readDevice(), goal);
  if (!r) return null;
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
          goal: goal ?? '',
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
  const sports = readDevice().sports;
  return sports ? { id: 'device', slug: 'device', updated_at: '', ...sports } : null;
}

export async function getLifestyle(): Promise<LifestyleProfileResponse | null> {
  const activity = readDevice().activity;
  return activity ? { id: 'device', slug: 'device', updated_at: '', ...activity } : null;
}

export async function getNutritionPreferences(): Promise<NutritionPreferencesResponse | null> {
  const p = await loadServer();
  if (!p) return null;
  return {
    id: p.account_id,
    slug: p.account_id,
    diet_type: p.diet_type,
    main_goal: p.main_goal,
    meals_per_day: p.meals_per_day,
    snacks_per_day: p.snacks_per_day,
    practices_if: p.practices_if,
    fasting_window_hours: p.fasting_window_hours,
    cooking_level: p.cooking_level,
    cooking_time_available: p.cooking_time_available,
    cooking_for: p.cooking_for,
    budget_per_day_eur: p.budget_per_day_eur == null ? null : Number(p.budget_per_day_eur),
    excluded_foods: p.excluded_foods,
    rules_variety_pct: p.rules_variety_pct,
    rules_override_calories: p.rules_override_calories,
    rules_override_proteines: p.rules_override_proteines,
    updated_at: p.updated_at,
  };
}

export async function getExcludedFoods(): Promise<ExcludedFoodResponse[]> {
  const p = await loadServer();
  return (p?.excluded_foods ?? []).map((name) => ({
    id: name,
    slug: name,
    food_name: name,
    reason: null,
    created_at: '',
  }));
}

// ════════════════════════════════ MUTATEURS ═════════════════════════════════

function bodyFrom(input: Body, base: BodyCore | null): BodyCore {
  const pick = <K extends keyof BodyCore>(key: K, conv: (v: unknown) => BodyCore[K]): BodyCore[K] =>
    key in input ? conv(input[key]) : (base?.[key] ?? null) as BodyCore[K];
  return {
    date_of_birth: pick('date_of_birth', sn),
    biological_sex: pick('biological_sex', (v) => sn(v) as Sex | null),
    height_cm: pick('height_cm', n),
    weight_kg: pick('weight_kg', n),
    target_weight_kg: pick('target_weight_kg', n),
  };
}

/** Données corporelles : enregistrées sur l'appareil uniquement. */
export async function createProfile(input: Body): Promise<ProfileResponse> {
  const device = readDevice();
  writeDevice({ ...device, body: bodyFrom(input, null) });
  await syncTargets();
  return (await getMyProfile())!;
}

export async function updateProfile(input: Body): Promise<ProfileResponse> {
  const device = readDevice();
  const bodyKeys = ['date_of_birth', 'biological_sex', 'height_cm', 'weight_kg', 'target_weight_kg'];
  if (bodyKeys.some((k) => k in input)) {
    writeDevice({ ...device, body: bodyFrom(input, device.body) });
  }
  if ('nutrition_rules_enabled' in input) {
    await patchServer({ nutrition_rules_enabled: b(input.nutrition_rules_enabled) });
  }
  await syncTargets();
  return (await getMyProfile())!;
}

export async function upsertSports(input: Body): Promise<SportsProfileResponse> {
  const device = readDevice();
  writeDevice({
    ...device,
    sports: {
      sports: Array.isArray(input.sports) ? (input.sports as string[]) : [],
      practice_level: s(input.practice_level),
      sessions_per_week: n(input.sessions_per_week) ?? 0,
      avg_session_duration_min: n(input.avg_session_duration_min) ?? 0,
      avg_intensity_rpe: n(input.avg_intensity_rpe) ?? 0,
    },
  });
  await syncTargets();
  return (await getSportsProfile())!;
}

export async function upsertLifestyle(input: Body): Promise<LifestyleProfileResponse> {
  const device = readDevice();
  writeDevice({
    ...device,
    activity: {
      profession_activity_level: sn(input.profession_activity_level),
      sedentary_hours_per_day: n(input.sedentary_hours_per_day),
    },
  });
  await syncTargets();
  return (await getLifestyle())!;
}

const SERVER_PREFERENCE_FIELDS = [
  'diet_type', 'main_goal', 'meals_per_day', 'snacks_per_day', 'practices_if',
  'fasting_window_hours', 'cooking_level', 'cooking_time_available', 'cooking_for',
  'budget_per_day_eur', 'excluded_foods', 'rules_variety_pct', 'rules_override_calories',
  'rules_override_proteines',
] as const;

/** Préférences (serveur) ; l'objectif influe sur les cibles → recalcul. */
export async function upsertNutrition(input: Body): Promise<NutritionPreferencesResponse> {
  const patch: Record<string, unknown> = {};
  for (const key of SERVER_PREFERENCE_FIELDS) {
    if (key in input && input[key] !== undefined) patch[key] = input[key];
  }
  if (typeof patch.diet_type === 'string' && !patch.diet_type) delete patch.diet_type;
  if (typeof patch.main_goal === 'string' && !patch.main_goal) delete patch.main_goal;
  await patchServer(patch);
  await syncTargets();
  return (await getNutritionPreferences())!;
}

export async function addExcludedFood(input: Body): Promise<ExcludedFoodResponse> {
  const name = s(input.food_name).trim();
  const current = (await loadServer())?.excluded_foods ?? [];
  await patchServer({ excluded_foods: [...current, name] });
  return { id: name, slug: name, food_name: name, reason: null, created_at: '' };
}

export async function deleteExcludedFood(slug: string): Promise<void> {
  const current = (await loadServer())?.excluded_foods ?? [];
  await patchServer({ excluded_foods: current.filter((f) => f !== slug) });
}
