import axios from 'axios';
import { usersClient, profileClient, recipeClient, menuClient, crawlerClient, notificationClient, refreshAccessToken } from './client';
import type {
  TokenResponse,
  AccountSummary,
  AccountListResponse,
  AccountRole,
  MemberStatus,
  MemberSummary,
  MemberListResponse,
  CoachInfo,
  RecipeLibraryItem,
  Invitation,
  InvitationKind,
  InvitationPreview,
  InvitationListResponse,
  AuditEntry,
  AuditListResponse,
  PreAuthTokenResponse,
  TotpSetupResponse,
  UserOut,
  ConsentResponse,
  AdminUser,
  UserRightsUpdate,
  RecipeCountsByUser,
  ProfileResponse,
  WeeklyMenuResponse,
  WeeklyMenuCreate,
  ServiceHealth,
  SearchRecipeResult,
  SearchResponse,
  QueueSnapshot,
  TaskStatus,
  OneshotResponse,
  NotificationItem,
  InstagramSessionInfo,
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
  CrawlSourceResponse,
  CrawlResultResponse,
  PaginatedCrawlResultResponse,
  CrawlStatus,
  CrawlType,
  RecipeHydrated,
  RecipeCommitRequest,
  PaginatedRecipeResponse,
  RecipeResponse,
  ImportEnqueueResponse,
  RecipeImportTaskStatus,
  ShoppingList,
  SpoonacularShake,
} from '../types';

export async function login(email: string, password: string): Promise<TokenResponse | PreAuthTokenResponse> {
  // withCredentials : nécessaire pour que le navigateur stocke le cookie refresh
  // (Set-Cookie) renvoyé cross-site par le backend (SEC-05).
  const { data } = await axios.post<TokenResponse | PreAuthTokenResponse>(
    'https://api-users.localhost/api/v1/auth/login',
    { email, password },
    { timeout: 8000, withCredentials: true }
  );
  return data;
}

export async function verifyMfa(mfaToken: string, code: string): Promise<TokenResponse> {
  const { data } = await axios.post<TokenResponse>(
    'https://api-users.localhost/api/v1/auth/2fa/verify',
    { mfa_token: mfaToken, code },
    { timeout: 8000, withCredentials: true }
  );
  return data;
}

export async function setupTotp(): Promise<TotpSetupResponse> {
  const { data } = await usersClient.post<TotpSetupResponse>('/api/v1/auth/2fa/setup/totp');
  return data;
}

export async function confirmTotp(code: string): Promise<TokenResponse> {
  const { data } = await usersClient.post<TokenResponse>('/api/v1/auth/2fa/confirm/totp', { code });
  return data;
}

export async function disableMfa(): Promise<void> {
  await usersClient.delete('/api/v1/auth/2fa/disable');
}

export async function register(email: string, password: string): Promise<UserOut> {
  const { data } = await axios.post<UserOut>(
    'https://api-users.localhost/api/v1/users',
    { email, password },
    { timeout: 8000 }
  );
  return data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await axios.post(
    'https://api-users.localhost/api/v1/auth/password/reset-request',
    { email },
    { timeout: 8000 }
  );
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await usersClient.post('/api/v1/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export async function getMe(): Promise<UserOut> {
  const { data } = await usersClient.get<UserOut>('/api/v1/users/me');
  return data;
}

// ── RGPD : consentement (art. 9), portabilité (art. 20), effacement (art. 17) ──
/** Type de consentement « données de santé » (le seul exploité par l'UI à ce jour). */
export const HEALTH_CONSENT_TYPE = 'health_data';
/** Version du consentement santé = version de la politique de confidentialité associée. */
export const HEALTH_CONSENT_VERSION = 'v1';

/** État courant des consentements (dernière trace par type, append-only côté backend). */
export async function getConsents(): Promise<ConsentResponse[]> {
  const { data } = await usersClient.get<ConsentResponse[]>('/api/v1/users/me/consents');
  return data;
}

/** Enregistre un octroi ou un retrait de consentement santé (append-only). */
export async function recordHealthConsent(granted: boolean): Promise<ConsentResponse> {
  const { data } = await usersClient.post<ConsentResponse>('/api/v1/users/me/consents', {
    consent_type: HEALTH_CONSENT_TYPE,
    version: HEALTH_CONSENT_VERSION,
    granted,
  });
  return data;
}

/**
 * Octroie ou retire le consentement santé puis **rafraîchit l'access token** afin
 * que le claim `health_consent` (et donc le garde-fou de service-profile) reflète
 * immédiatement le nouvel état. Sans ce refresh, le 403 fail-closed persisterait
 * jusqu'au prochain refresh « naturel ».
 */
export async function setHealthConsent(granted: boolean): Promise<ConsentResponse> {
  const consent = await recordHealthConsent(granted);
  await refreshAccessToken();
  return consent;
}

/** Export RGPD agrégé (identité + santé + menus + notifs + nutrition). */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data } = await usersClient.get<Record<string, unknown>>('/api/v1/users/me/export');
  return data;
}

/** Suppression définitive du compte (effacement cross-service côté backend, art. 17). */
export async function deleteMyAccount(userId: string): Promise<void> {
  await usersClient.delete(`/api/v1/users/${userId}`);
}

// ── Multicomptes (CRM) ──────────────────────────────────────────────────────
/** Liste les comptes accessibles par l'identité connectée (+ son rôle dessus). */
export async function listAccounts(): Promise<AccountSummary[]> {
  const { data } = await usersClient.get<AccountListResponse>('/api/v1/accounts');
  return data.accounts;
}

/** Change de compte actif : renvoie un access token de contexte (act_account + scopes). */
export async function switchAccount(accountId: string): Promise<TokenResponse> {
  const { data } = await usersClient.post<TokenResponse>(`/api/v1/accounts/${accountId}/switch`);
  return data;
}

// ── Multicomptes phase 3 : membres / invitations / audit (scope member:manage) ──
/** Membres d'un compte (gestionnaires uniquement). */
export async function listMembers(accountId: string): Promise<MemberSummary[]> {
  const { data } = await usersClient.get<MemberListResponse>(`/api/v1/accounts/${accountId}/members`);
  return data.members;
}

/** Change le rôle et/ou le statut (suspend/réactive) d'un membre. */
export async function updateMember(
  accountId: string,
  membershipId: string,
  payload: { role?: AccountRole; status?: MemberStatus },
): Promise<MemberSummary> {
  const { data } = await usersClient.patch<MemberSummary>(
    `/api/v1/accounts/${accountId}/members/${membershipId}`,
    payload,
  );
  return data;
}

/** Révoque (soft-delete) un membre du compte. */
export async function revokeMember(accountId: string, membershipId: string): Promise<void> {
  await usersClient.delete(`/api/v1/accounts/${accountId}/members/${membershipId}`);
}

/** Invitations en attente d'un compte. */
export async function listInvitations(accountId: string): Promise<Invitation[]> {
  const { data } = await usersClient.get<InvitationListResponse>(
    `/api/v1/accounts/${accountId}/invitations`,
  );
  return data.invitations;
}

/** Invite un email à rejoindre le compte avec un rôle. Renvoie l'invitation (+ token).
 *  kind='coach_link' : l'accepteur (client) accordera au coach (inviteur) un accès
 *  délégué sur SON compte ; le rôle est alors forcé à COACH côté backend. */
export async function inviteMember(
  accountId: string,
  email: string,
  role: AccountRole,
  kind: InvitationKind = 'collaborator',
): Promise<Invitation> {
  const { data } = await usersClient.post<Invitation>(
    `/api/v1/accounts/${accountId}/invitations`,
    { email, role, kind },
  );
  return data;
}

/** Annule une invitation en attente. */
export async function cancelInvitation(accountId: string, invitationId: string): Promise<void> {
  await usersClient.delete(`/api/v1/accounts/${accountId}/invitations/${invitationId}`);
}

/** Journal d'activité (audit) du compte. */
export async function listAudit(accountId: string, limit = 50, offset = 0): Promise<AuditEntry[]> {
  const { data } = await usersClient.get<AuditListResponse>(
    `/api/v1/accounts/${accountId}/audit`,
    { params: { limit, offset } },
  );
  return data.entries;
}

/** Aperçu public d'une invitation (avant acceptation) → écran de consentement. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const { data } = await usersClient.get<InvitationPreview>(
    `/api/v1/accounts/invitations/${token}/preview`,
  );
  return data;
}

/** Accepte une invitation pour son propre compte → crée le membership. */
export async function acceptInvitation(token: string): Promise<AccountSummary> {
  const { data } = await usersClient.post<AccountSummary>(
    `/api/v1/accounts/invitations/${token}/accept`,
  );
  return data;
}

/** Quitte un compte dont on est membre (un coach « coupe le lien » avec un client). */
export async function leaveAccount(accountId: string): Promise<void> {
  await usersClient.delete(`/api/v1/accounts/${accountId}/membership/me`);
}

/** Côté client : coach actif de son compte (onglet « Mon coach » du profil). */
export async function getAccountCoach(accountId: string): Promise<CoachInfo> {
  const { data } = await usersClient.get<CoachInfo>(`/api/v1/accounts/${accountId}/coach`);
  return data;
}

/** Côté client : coupe le lien avec son coach (seule action permise au client). */
export async function revokeAccountCoach(accountId: string): Promise<void> {
  await usersClient.delete(`/api/v1/accounts/${accountId}/coach`);
}

/** Coach → client : pousse (copie) des recettes de son compte vers le compte d'un client. */
export async function pushRecipes(
  recipeIds: number[],
  targetAccountId: string,
): Promise<{ pushed: string[]; skipped: number[] }> {
  const { data } = await recipeClient.post<{ pushed: string[]; skipped: number[] }>(
    '/api/v1/recipe/push',
    { recipe_ids: recipeIds, target_account_id: targetAccountId },
  );
  return data;
}

/** Coach : bibliothèque de recettes d'un client (pour voir ce qu'il a déjà). */
export async function getClientLibrary(accountId: string): Promise<RecipeLibraryItem[]> {
  const { data } = await recipeClient.get<RecipeLibraryItem[]>(
    `/api/v1/recipe/library/${accountId}`,
  );
  return data;
}

// ── Admin (RBAC) ──────────────────────────────────────────────────────────
export async function adminListUsers(): Promise<AdminUser[]> {
  const { data } = await usersClient.get<AdminUser[]>('/api/v1/users');
  return data;
}

export async function adminUpdateUserRights(
  userId: string,
  payload: UserRightsUpdate,
): Promise<AdminUser> {
  const { data } = await usersClient.patch<AdminUser>(`/api/v1/users/${userId}/rights`, payload);
  return data;
}

export async function getRecipeCountsByUser(): Promise<RecipeCountsByUser> {
  const { data } = await recipeClient.get<RecipeCountsByUser>('/api/v1/recipe/counts-by-user');
  return data;
}

/** Admin : enfile l'import en masse de recettes (+ catalogue) depuis un fichier JSON.
 *  Le fichier est validé tout de suite ; l'import lui-même tourne en tâche de fond
 *  (long car il appelle service-nutrition). Suivre via getRecipeImportStatus(task_id). */
export async function importRecipes(file: File): Promise<ImportEnqueueResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await recipeClient.post<ImportEnqueueResponse>('/api/v1/recipe/import', form);
  return data;
}

/** Admin : état d'une tâche d'import (polling). Sur succès, `result` porte le rapport. */
export async function getRecipeImportStatus(taskId: string): Promise<RecipeImportTaskStatus> {
  const { data } = await recipeClient.get<RecipeImportTaskStatus>(`/api/v1/recipe/import/${taskId}`);
  return data;
}

/** Admin : supprime toutes les recettes d'un utilisateur (BDD + index ES). */
export async function deleteRecipesByUser(userId: string): Promise<{ deleted: number }> {
  const { data } = await recipeClient.delete<{ deleted: number }>(`/api/v1/recipe/by-user/${userId}`);
  return data;
}

/** Admin : supprime un compte utilisateur. */
export async function adminDeleteUser(userId: string): Promise<void> {
  await usersClient.delete(`/api/v1/users/${userId}`);
}

export async function getMyProfile(): Promise<ProfileResponse | null> {
  try {
    const { data } = await profileClient.get<ProfileResponse>('/api/v1/profiles/me');
    return data;
  } catch {
    return null;
  }
}

export async function getRecipeBySlug(slug: string): Promise<RecipeResponse> {
  const { data } = await recipeClient.get<RecipeResponse>(`/api/v1/recipe/${slug}`);
  return data;
}

export async function uploadRecipeImage(id: number, file: File): Promise<RecipeResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await recipeClient.post<RecipeResponse>(`/api/v1/recipe/id/${id}/image`, form);
  return data;
}

export async function updateRecipe(id: number, payload: Record<string, unknown>): Promise<RecipeResponse> {
  const { data } = await recipeClient.put<RecipeResponse>(`/api/v1/recipe/id/${id}`, payload);
  return data;
}

/** Relance une recherche Unsplash avec un mot-clé libre et renvoie 4 nouvelles propositions. */
export async function refreshImageSuggestions(id: number, keyword: string): Promise<RecipeResponse> {
  const { data } = await recipeClient.post<RecipeResponse>(`/api/v1/recipe/id/${id}/image-suggestions`, { keyword });
  return data;
}

/** Valide et enregistre l'image finale choisie parmi les propositions Unsplash. */
export async function selectRecipeImage(id: number, unsplashId: string): Promise<RecipeResponse> {
  const { data } = await recipeClient.post<RecipeResponse>(`/api/v1/recipe/id/${id}/image/select`, { unsplash_id: unsplashId });
  return data;
}

export async function deleteRecipe(id: number): Promise<void> {
  await recipeClient.delete(`/api/v1/recipe/id/${id}`);
}

/** « Shake ta recette » : tire une recette au hasard du cache Spoonacular. */
export async function shakeRecipe(): Promise<SpoonacularShake> {
  const { data } = await recipeClient.get<SpoonacularShake>('/api/v1/recipe/spoonacular/shake');
  return data;
}

/** Ajoute une recette Spoonacular à la liste personnelle (pipeline habituel). */
export async function addSpoonacularRecipe(spoonacularId: number): Promise<RecipeResponse> {
  const { data } = await recipeClient.post<RecipeResponse>(
    `/api/v1/recipe/spoonacular/${spoonacularId}/add`
  );
  return data;
}

export async function createRecipeManual(body: {
  title: string;
  description: string | null;
  instructions: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  course_type: string | null;
  free_tags: string[];
  ingredients: { name: string; quantity: number; unit: string }[];
}): Promise<RecipeResponse> {
  const { data } = await recipeClient.post<RecipeResponse>('/api/v1/recipe/manual', body);
  return data;
}

export async function listRecipes(
  page = 1,
  pageSize = 20,
  courseType?: string,
  createdByUserId?: string,
): Promise<PaginatedRecipeResponse> {
  const params: Record<string, unknown> = { page, page_size: pageSize };
  if (courseType) params.course_type = courseType;
  if (createdByUserId) params.created_by_user_id = createdByUserId;
  const { data } = await recipeClient.get<PaginatedRecipeResponse>('/api/v1/recipe', { params });
  return data;
}

export async function listAllRecipes(
  courseType?: string,
  createdByUserId?: string,
): Promise<RecipeResponse[]> {
  const pageSize = 50;
  const first = await listRecipes(1, pageSize, courseType, createdByUserId);
  const all = [...first.items];
  for (let page = 2; page <= first.pages; page++) {
    const next = await listRecipes(page, pageSize, courseType, createdByUserId);
    all.push(...next.items);
  }
  return all;
}

/** Toutes les recettes de l'utilisateur (y compris déjà intégrées). */
export async function listMyRecipes(userId: string): Promise<RecipeResponse[]> {
  return listAllRecipes(undefined, userId);
}

export async function searchRecipes(q: string, limit = 8): Promise<SearchRecipeResult[]> {
  try {
    const params: Record<string, unknown> = { limit };
    if (q.trim()) params.q = q.trim();
    const { data } = await recipeClient.get<SearchResponse>('/api/v1/search/recipes', { params });
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function searchRecipesPage(opts: {
  q?: string;
  courseType?: string;
  limit?: number;
  offset?: number;
  aggressiveness?: number;
  varietyPct?: number;
  overrideCalories?: number;
  overrideProteines?: number;
}): Promise<SearchResponse> {
  const params: Record<string, unknown> = { limit: opts.limit ?? 20, offset: opts.offset ?? 0 };
  if (opts.q?.trim()) params.q = opts.q.trim();
  if (opts.courseType) params.course_type = opts.courseType;
  if (opts.aggressiveness != null) params.aggressiveness = opts.aggressiveness;
  if (opts.varietyPct != null) params.variety_pct = opts.varietyPct;
  if (opts.overrideCalories != null) params.override_calories = opts.overrideCalories;
  if (opts.overrideProteines != null) params.override_proteines = opts.overrideProteines;
  const { data } = await recipeClient.get<SearchResponse>('/api/v1/search/recipes', { params });
  return data;
}

// ── Profile sub-resources ────────────────────────────────
async function safeGet<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

async function safeGetList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn() ?? []; } catch { return []; }
}

export async function getCalculations(): Promise<CalculationResponse | null> {
  return safeGet(async () => {
    const { data } = await profileClient.get<CalculationResponse>('/api/v1/profiles/me/calculate');
    return data;
  });
}

export async function getSportsProfile(): Promise<SportsProfileResponse | null> {
  return safeGet(async () => {
    const { data } = await profileClient.get<SportsProfileResponse>('/api/v1/profiles/me/sports');
    return data;
  });
}

export async function getLifestyle(): Promise<LifestyleProfileResponse | null> {
  return safeGet(async () => {
    const { data } = await profileClient.get<LifestyleProfileResponse>('/api/v1/profiles/me/lifestyle');
    return data;
  });
}

export async function getNutritionPreferences(): Promise<NutritionPreferencesResponse | null> {
  return safeGet(async () => {
    const { data } = await profileClient.get<NutritionPreferencesResponse>('/api/v1/profiles/me/nutrition');
    return data;
  });
}

export async function getBodyComposition(): Promise<BodyCompositionResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<BodyCompositionResponse[]>('/api/v1/profiles/me/composition');
    return data;
  });
}

export async function getBodyMeasurements(): Promise<BodyMeasurementsResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<BodyMeasurementsResponse[]>('/api/v1/profiles/me/measurements');
    return data;
  });
}

export async function getPerformanceMetrics(): Promise<PerformanceMetricResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<PerformanceMetricResponse[]>('/api/v1/profiles/me/performance');
    return data;
  });
}

export async function getInjuries(): Promise<InjuryResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<InjuryResponse[]>('/api/v1/profiles/me/injuries');
    return data;
  });
}

export async function getAllergies(): Promise<FoodAllergyResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<FoodAllergyResponse[]>('/api/v1/profiles/me/allergies');
    return data;
  });
}

export async function getExcludedFoods(): Promise<ExcludedFoodResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<ExcludedFoodResponse[]>('/api/v1/profiles/me/excluded-foods');
    return data;
  });
}

export async function getConditions(): Promise<MedicalConditionResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<MedicalConditionResponse[]>('/api/v1/profiles/me/conditions');
    return data;
  });
}

export async function getMedications(): Promise<MedicationResponse[]> {
  return safeGetList(async () => {
    const { data } = await profileClient.get<MedicationResponse[]>('/api/v1/profiles/me/medications');
    return data;
  });
}

// ── Profile create / upsert ──────────────────────────────
export async function createProfile(body: Record<string, unknown>): Promise<ProfileResponse> {
  const { data } = await profileClient.post<ProfileResponse>('/api/v1/profiles', body);
  return data;
}

export async function updateProfile(body: Record<string, unknown>): Promise<ProfileResponse> {
  const { data } = await profileClient.patch<ProfileResponse>('/api/v1/profiles/me', body);
  return data;
}

export async function addBodyComposition(body: Record<string, unknown>): Promise<BodyCompositionResponse> {
  const { data } = await profileClient.post<BodyCompositionResponse>('/api/v1/profiles/me/composition', body);
  return data;
}

export async function deleteBodyComposition(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/composition/${slug}`);
}

export async function addBodyMeasurements(body: Record<string, unknown>): Promise<BodyMeasurementsResponse> {
  const { data } = await profileClient.post<BodyMeasurementsResponse>('/api/v1/profiles/me/measurements', body);
  return data;
}

export async function deleteBodyMeasurements(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/measurements/${slug}`);
}

export async function addPerformanceMetric(body: Record<string, unknown>): Promise<PerformanceMetricResponse> {
  const { data } = await profileClient.post<PerformanceMetricResponse>('/api/v1/profiles/me/performance', body);
  return data;
}

export async function deletePerformanceMetric(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/performance/${slug}`);
}

export async function upsertSports(body: Record<string, unknown>): Promise<SportsProfileResponse> {
  const { data } = await profileClient.put<SportsProfileResponse>('/api/v1/profiles/me/sports', body);
  return data;
}

export async function upsertLifestyle(body: Record<string, unknown>): Promise<LifestyleProfileResponse> {
  const { data } = await profileClient.put<LifestyleProfileResponse>('/api/v1/profiles/me/lifestyle', body);
  return data;
}

export async function upsertNutrition(body: Record<string, unknown>): Promise<NutritionPreferencesResponse> {
  const { data } = await profileClient.put<NutritionPreferencesResponse>('/api/v1/profiles/me/nutrition', body);
  return data;
}

// ── Profile list mutations ───────────────────────────────
export async function addInjury(body: Record<string, unknown>): Promise<InjuryResponse> {
  const { data } = await profileClient.post<InjuryResponse>('/api/v1/profiles/me/injuries', body);
  return data;
}
export async function deleteInjury(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/injuries/${slug}`);
}

export async function addAllergy(body: Record<string, unknown>): Promise<FoodAllergyResponse> {
  const { data } = await profileClient.post<FoodAllergyResponse>('/api/v1/profiles/me/allergies', body);
  return data;
}
export async function deleteAllergy(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/allergies/${slug}`);
}

export async function addCondition(body: Record<string, unknown>): Promise<MedicalConditionResponse> {
  const { data } = await profileClient.post<MedicalConditionResponse>('/api/v1/profiles/me/conditions', body);
  return data;
}
export async function deleteCondition(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/conditions/${slug}`);
}

export async function addMedication(body: Record<string, unknown>): Promise<MedicationResponse> {
  const { data } = await profileClient.post<MedicationResponse>('/api/v1/profiles/me/medications', body);
  return data;
}
export async function deleteMedication(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/medications/${slug}`);
}

export async function addExcludedFood(body: Record<string, unknown>): Promise<ExcludedFoodResponse> {
  const { data } = await profileClient.post<ExcludedFoodResponse>('/api/v1/profiles/me/excluded-foods', body);
  return data;
}
export async function deleteExcludedFood(slug: string): Promise<void> {
  await profileClient.delete(`/api/v1/profiles/me/excluded-foods/${slug}`);
}

// ── Crawler ──────────────────────────────────────────────
export async function getCrawlerSources(): Promise<CrawlSourceResponse[]> {
  const { data } = await crawlerClient.get<CrawlSourceResponse[]>('/api/v1/crawler/sources');
  return data;
}

export async function createCrawlerSource(body: Record<string, unknown>): Promise<CrawlSourceResponse> {
  const { data } = await crawlerClient.post<CrawlSourceResponse>('/api/v1/crawler/sources', body);
  return data;
}

export async function deleteCrawlerSource(id: string): Promise<void> {
  await crawlerClient.delete(`/api/v1/crawler/sources/${id}`);
}

export async function triggerCrawl(sourceId: string, full = false): Promise<void> {
  await crawlerClient.post(`/api/v1/crawler/sources/${sourceId}/crawl`, null, {
    params: full ? { full: true } : undefined,
  });
}

export async function getCrawlerQueue(): Promise<QueueSnapshot> {
  const { data } = await crawlerClient.get<QueueSnapshot>('/api/v1/crawler/admin/queue');
  return data;
}

/** Admin : diagnostic d'une tâche Celery par son requestId (état, erreur, date du dernier échec). */
export async function getCrawlerTaskStatus(taskId: string): Promise<TaskStatus> {
  const { data } = await crawlerClient.get<TaskStatus>(`/api/v1/crawler/admin/tasks/${taskId}`);
  return data;
}

/** Admin : installe un nouveau cookie sessionid Instagram. Renvoie le compte authentifié. */
export async function updateInstagramSession(sessionId: string): Promise<{ username: string }> {
  const { data } = await crawlerClient.post<{ username: string }>(
    '/api/v1/crawler/admin/instagram/session',
    { session_id: sessionId },
  );
  return data;
}

/** Admin : état de la session Instagram enregistrée (compte + date, sans le cookie). */
export async function getInstagramSession(): Promise<InstagramSessionInfo> {
  const { data } = await crawlerClient.get<InstagramSessionInfo>('/api/v1/crawler/admin/instagram/session');
  return data;
}

export async function getCrawlerResults(
  status: CrawlStatus = 'waiting',
  page = 1,
  pageSize = 20,
  sort: 'asc' | 'desc' = 'desc',
  crawlType?: CrawlType,
): Promise<PaginatedCrawlResultResponse> {
  const params: Record<string, unknown> = { status, page, page_size: pageSize, sort };
  if (crawlType) params.crawl_type = crawlType;
  const { data } = await crawlerClient.get<PaginatedCrawlResultResponse>('/api/v1/crawler/results', { params });
  return data;
}

export async function crawlOneshot(url: string): Promise<OneshotResponse> {
  const { data } = await crawlerClient.post<OneshotResponse>('/api/v1/crawler/sources/oneshot', { url });
  return data;
}

// Statut d'un import oneshot (polling). Sur succès, `result` porte l'état métier
// ({status: 'done'|'blocked', message}) → permet de remonter un blocage Instagram.
export async function getCrawlOneshotStatus(taskId: string): Promise<TaskStatus> {
  const { data } = await crawlerClient.get<TaskStatus>(`/api/v1/crawler/sources/oneshot/${taskId}`);
  return data;
}

// Historique des notifications in-app de l'utilisateur (service-notification).
export async function getNotifications(userId: string, limit = 20): Promise<NotificationItem[]> {
  const { data } = await notificationClient.get<NotificationItem[]>(
    `/api/v1/users/${userId}/history`,
    { params: { limit } },
  );
  return data;
}

export interface OcrScanResponse {
  is_recipe: boolean;
  title: string;
  recipe_confidence: number;
  raw_text: string;
  detail: string;
}

/** Analyse une image (OCR + IA) sans rien persister. L'image n'est jamais stockée côté serveur. */
export async function ocrScan(file: File): Promise<OcrScanResponse> {
  const form = new FormData();
  form.append('file', file);
  // OCR + analyse IA : plus long que les appels classiques → timeout élargi.
  const { data } = await crawlerClient.post<OcrScanResponse>('/api/v1/crawler/ocr', form, { timeout: 60_000 });
  return data;
}

/** Importe (décision explicite) le texte OCR validé → crée la pré-recette en attente. */
export async function ocrImport(rawText: string, title: string): Promise<void> {
  await crawlerClient.post('/api/v1/crawler/ocr/import', { raw_text: rawText, title });
}

export async function validateCrawlResult(id: string): Promise<CrawlResultResponse> {
  const { data } = await crawlerClient.patch<CrawlResultResponse>(`/api/v1/crawler/results/${id}/validate`);
  return data;
}

export async function rejectCrawlResult(id: string): Promise<CrawlResultResponse> {
  const { data } = await crawlerClient.patch<CrawlResultResponse>(`/api/v1/crawler/results/${id}/reject`);
  return data;
}

export async function resetCrawlResult(id: string): Promise<CrawlResultResponse> {
  const { data } = await crawlerClient.patch<CrawlResultResponse>(`/api/v1/crawler/results/${id}/reset`);
  return data;
}

export async function hydrateResult(id: string): Promise<RecipeHydrated> {
  const { data } = await crawlerClient.post<RecipeHydrated>(`/api/v1/crawler/results/${id}/hydrate`);
  return data;
}

export async function commitResult(id: string, body: RecipeCommitRequest): Promise<CrawlResultResponse> {
  const { data } = await crawlerClient.post<CrawlResultResponse>(`/api/v1/crawler/results/${id}/commit`, body);
  return data;
}

export async function getMenus(): Promise<WeeklyMenuResponse[]> {
  try {
    const { data } = await menuClient.get<WeeklyMenuResponse[]>('/api/v1/menus');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getMenuById(id: number): Promise<WeeklyMenuResponse> {
  const { data } = await menuClient.get<WeeklyMenuResponse>(`/api/v1/menus/${id}`);
  return data;
}

export async function createMenu(body: WeeklyMenuCreate): Promise<WeeklyMenuResponse> {
  const { data } = await menuClient.post<WeeklyMenuResponse>('/api/v1/menus', body);
  return data;
}

export async function generateMenu(body: WeeklyMenuCreate): Promise<WeeklyMenuResponse> {
  const { data } = await menuClient.post<WeeklyMenuResponse>('/api/v1/menus/generate', body);
  return data;
}

export async function updateMenu(id: number, body: Partial<WeeklyMenuCreate>): Promise<WeeklyMenuResponse> {
  const { data } = await menuClient.put<WeeklyMenuResponse>(`/api/v1/menus/${id}`, body);
  return data;
}

export async function deleteMenu(id: number): Promise<void> {
  await menuClient.delete(`/api/v1/menus/${id}`);
}

export async function getShoppingList(menuId: number): Promise<ShoppingList> {
  const { data } = await menuClient.get<ShoppingList>(`/api/v1/menus/${menuId}/shopping-list`);
  return data;
}

export async function exportShoppingList(menuId: number, format: 'csv' | 'pdf'): Promise<Blob> {
  const { data } = await menuClient.get<Blob>(
    `/api/v1/menus/${menuId}/shopping-list/export`,
    { params: { format }, responseType: 'blob' },
  );
  return data;
}

const SERVICES: { name: string; label: string; url: string }[] = [
  { name: 'users',        label: 'Users',        url: 'https://api-users.localhost' },
  { name: 'recipe',       label: 'Recipe',       url: 'https://api-recipe.localhost' },
  { name: 'menu',         label: 'Menu',         url: 'https://api-menu.localhost' },
  { name: 'profile',      label: 'Profile',      url: 'https://api-profile.localhost' },
  { name: 'nutrition',    label: 'Nutrition',    url: 'https://api-nutrition.localhost' },
  { name: 'crawler',      label: 'Crawler',      url: 'https://api-crawler.localhost' },
  { name: 'notification', label: 'Notification', url: 'https://api-notification.localhost' },
];

export async function checkHealth(): Promise<ServiceHealth[]> {
  const results = await Promise.allSettled(
    SERVICES.map((s) =>
      axios.get(`${s.url}/health`, { timeout: 5000 }).then((r) => ({
        name: s.label,
        url: s.url,
        status: (r.data?.status === 'ok' ? 'ok' : 'down') as ServiceHealth['status'],
      }))
    )
  );
  return results.map((result, i) => ({
    name: SERVICES[i].label,
    url: SERVICES[i].url,
    status: result.status === 'fulfilled'
      ? result.value.status
      : ('down' as const),
  }));
}
