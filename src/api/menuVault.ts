// Coffre de menus chiffrés (E2E zero-knowledge). Le menu hebdomadaire est
// désormais GÉNÉRÉ et CHIFFRÉ côté client, puis rangé dans le coffre opaque de
// service-menu (collection « weekly_menu », 1 blob par semaine, ref_key = date
// du lundi). Le serveur ne voit qu'un ciphertext de taille fixée (padding PADMÉ).
//
// La crypto est dans @nutri/e2e-core ; ici on n'orchestre que les appels réseau
// (ciphertext en base64) et l'assemblage du résumé nutritionnel servant à
// construire les contraintes de génération.

import axios from 'axios';
import {
  encryptBlob,
  decryptBlob,
  MENU_PADDING,
  toBase64,
  fromBase64,
  type NutritionSummary,
} from '@nutri/e2e-core';
import { menuClient } from './client';
import { requireUserKey } from '../crypto/vault';
import { getHealthDoc, deriveNutrition } from './healthVault';
import type { DayOfWeekKey, MealTypeKey } from '../types';

export { VaultLockedError } from '../crypto/vault';

/** Un créneau du menu (document client, sans id serveur). */
export interface MenuSlotDoc {
  day_of_week: DayOfWeekKey;
  meal_type: MealTypeKey;
  recipe_id: number;
  nb_persons: number;
}

/** Le document de menu chiffré pour une semaine. */
export interface MenuDocument {
  start_date: string;
  nb_persons: number;
  slots: MenuSlotDoc[];
}

/** Menu déchiffré + version de concurrence (pour les écritures If-Match). */
export interface StoredMenu {
  doc: MenuDocument;
  version: number;
}

const BASE = '/api/v1/menus/me/blobs/weekly_menu';

interface BlobOut {
  collection: string;
  ref_key: string;
  content_version: number;
  ciphertext: string;
}
interface BlobEnvelope {
  collection: string;
  ref_key: string;
  content_version: number;
  updated_at: string;
}

/** Récupère et déchiffre le menu d'une semaine. `null` si aucun (404). */
export async function getMenuBlob(weekKey: string): Promise<StoredMenu | null> {
  const uk = requireUserKey();
  try {
    const { data } = await menuClient.get<BlobOut>(`${BASE}/${weekKey}`);
    const doc = await decryptBlob<MenuDocument>(uk, fromBase64(data.ciphertext));
    return { doc, version: data.content_version };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Chiffre et range le menu d'une semaine. `expectedVersion` = version attendue
 * (verrouillage optimiste, en-tête If-Match) ; `0`/omis = création. Renvoie la
 * nouvelle version.
 */
export async function putMenuBlob(
  weekKey: string,
  doc: MenuDocument,
  expectedVersion?: number,
): Promise<number> {
  const uk = requireUserKey();
  const ciphertext = toBase64(await encryptBlob(uk, doc, MENU_PADDING));
  const headers =
    expectedVersion !== undefined ? { 'If-Match': String(expectedVersion) } : undefined;
  const { data } = await menuClient.put<BlobOut>(
    `${BASE}/${weekKey}`,
    { ciphertext },
    headers ? { headers } : undefined,
  );
  return data.content_version;
}

/** Supprime le menu d'une semaine. */
export async function deleteMenuBlob(weekKey: string): Promise<void> {
  await menuClient.delete(`${BASE}/${weekKey}`);
}

/** Liste les semaines (ref_key) ayant un menu chiffré, plus récentes d'abord. */
export async function listMenuWeeks(): Promise<string[]> {
  try {
    const { data } = await menuClient.get<BlobEnvelope[]>(BASE);
    return data
      .map((e) => e.ref_key)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  } catch {
    return [];
  }
}

/**
 * Assemble le résumé nutritionnel (allergies, régime, exclusions, cible) dans la
 * forme attendue par `buildConstraints`, à partir du **document santé déchiffré**
 * (E2E). La cible énergétique est dérivée localement (`deriveNutrition`). Le
 * serveur ne participe plus : il ne voit que le ciphertext.
 */
export async function buildNutritionSummaryFromProfile(): Promise<NutritionSummary> {
  const stored = await getHealthDoc();
  const doc = stored?.doc;
  if (!doc) {
    return { allergies: [], excluded_foods: [], nutrition_preferences: null, calculation: null };
  }
  const calc = deriveNutrition(doc);
  return {
    allergies: doc.allergies.map((a) => ({ allergen: a.allergen })),
    excluded_foods: doc.excluded_foods.map((e) => ({ food_name: e.food_name })),
    nutrition_preferences: doc.nutrition
      ? { diet_type: doc.nutrition.diet_type, excluded_foods: doc.nutrition.excluded_foods }
      : null,
    calculation:
      calc?.targetCaloriesKcal != null
        ? { target_calories_kcal: calc.targetCaloriesKcal }
        : null,
  };
}
