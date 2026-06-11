export interface TokenResponse {
  // SEC-05 : le refresh token n'est plus renvoyé en JSON (cookie HttpOnly).
  access_token: string;
  token_type: string;
}

// Multicomptes (CRM) — comptes accessibles par l'identité connectée.
export interface AccountSummary {
  id: string;
  name: string;
  role: string;
  is_default: boolean;
}

// Coaching (docs/coaching_model.md) : type de lien créé par une invitation.
export type InvitationKind = 'collaborator' | 'coach_link';

// Aperçu public d'une invitation (avant acceptation) pour l'écran de consentement.
export interface InvitationPreview {
  email: string;
  role: AccountRole;
  kind: InvitationKind;
  status: string;
  account_name: string;
  inviter_email: string | null;
}

export interface AccountListResponse {
  accounts: AccountSummary[];
}

// Multicomptes phase 3 — membres / invitations / journal d'activité.
export type AccountRole = 'OWNER' | 'ADMIN' | 'COACH' | 'EDITOR' | 'CONTRIBUTOR' | 'VIEWER';
export type MemberStatus = 'active' | 'suspended' | 'revoked';

export interface MemberSummary {
  membership_id: string;
  identity_id: string;
  email: string;
  role: AccountRole;
  status: MemberStatus;
}

export interface MemberListResponse {
  members: MemberSummary[];
}

// Coaching côté client : le coach actif de son compte (voir / révoquer).
export interface CoachInfo {
  membership_id: string | null;
  email: string | null;
}

// Vue coach : entrée légère de la bibliothèque d'un client (éviter les doublons).
export interface RecipeLibraryItem {
  id: number;
  title: string;
  slug: string;
  image_url: string | null;
  source_recipe_id: number | null;
}

export interface Invitation {
  id: string;
  account_id: string;
  email: string;
  role: AccountRole;
  kind: InvitationKind;
  status: string;
  // token renvoyé par le backend (email best-effort) — sert à fabriquer le lien d'invitation.
  token: string;
  expires_at: string;
}

export interface InvitationListResponse {
  invitations: Invitation[];
}

export interface AuditEntry {
  id: string;
  actor_identity_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AuditListResponse {
  entries: AuditEntry[];
}

export interface CrawlRights {
  instagram: boolean;
  web: boolean;
}

export interface UserRights {
  crawl: CrawlRights;
  uniq_link: CrawlRights;
}

export interface UserOut {
  id: string;
  email: string;
  is_active: boolean;
  two_factor_enabled: boolean;
  user_admin: boolean;
  is_coach: boolean;
  user_right: UserRights;
}

export interface AdminUser {
  id: string;
  email: string;
  is_active: boolean;
  user_admin: boolean;
  is_coach: boolean;
  account_roles: string[];
  user_right: UserRights;
}

export interface UserRightsUpdate {
  user_admin?: boolean;
  is_coach?: boolean;
  user_right?: UserRights;
}

export type RecipeCountsByUser = Record<string, number>;

export interface PreAuthTokenResponse {
  mfa_token: string;
  mfa_method: string;
  token_type: string;
}

export interface TotpSetupResponse {
  provisioning_uri: string;
  qr_code_base64: string;
}

export interface ProfileResponse {
  id: string;
  slug: string;
  user_id: string;
  date_of_birth: string | null;
  biological_sex: 'male' | 'female' | 'other' | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  nutrition_rules_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngredientResponse {
  id: number;
  name: string;
  tags: string[];
  free_tags: string[];
  calories_per_100g: number | null;
  proteins_per_100g: number | null;
  carbs_per_100g: number | null;
  fats_per_100g: number | null;
}

export interface RecipeIngredientResponse {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  ingredient: IngredientResponse;
}

export interface ImageSuggestion {
  unsplash_id: string;
  thumb_url: string;
  full_url: string;
  download_location: string;
  author: string | null;
  author_url: string | null;
}

export interface RecipeResponse {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  instructions: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  difficulty: string;
  cuisine_origin: string;
  origin_recipe: string;
  course_type: string;
  tags: Record<string, unknown>;
  free_tags: string[];
  book_name: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  image_suggestions: ImageSuggestion[];
  image_search_keyword: string | null;
  source_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  recipe_ingredients: RecipeIngredientResponse[];
  calories_per_serving: number | null;
  proteins_per_serving: number | null;
  carbs_per_serving: number | null;
  fats_per_serving: number | null;
  comment: string | null;
  rating: number | null;
  // Coaching : non-null si la recette a été poussée par un gestionnaire (coach).
  source_recipe_id: number | null;
}

/** Recette tirée du cache Spoonacular pour le widget « Shake ta recette ». */
export interface SpoonacularShake {
  spoonacular_id: number;
  title: string;
  description: string;
  image_url: string | null;
  source_url: string | null;
  /** Payload Spoonacular complet (champs libres) rendu dans la modal. */
  payload: Record<string, unknown>;
}

export interface PaginatedRecipeResponse {
  items: RecipeResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export type MealTypeKey =
  | 'enums.meal_type.breakfast'
  | 'enums.meal_type.morning_snack'
  | 'enums.meal_type.lunch'
  | 'enums.meal_type.afternoon_snack'
  | 'enums.meal_type.dinner';

export type DayOfWeekKey =
  | 'enums.day.monday'
  | 'enums.day.tuesday'
  | 'enums.day.wednesday'
  | 'enums.day.thursday'
  | 'enums.day.friday'
  | 'enums.day.saturday'
  | 'enums.day.sunday';

export interface MenuSlotResponse {
  id: number;
  menu_id: number;
  day_of_week: DayOfWeekKey;
  meal_type: MealTypeKey;
  recipe_id: number;
  nb_persons: number;
  created_at: string;
  updated_at: string;
}

export interface MenuSlotCreate {
  day_of_week: DayOfWeekKey;
  meal_type: MealTypeKey;
  recipe_id: number;
  nb_persons?: number;
}

export interface WeeklyMenuCreate {
  start_date: string;
  nb_persons: number;
  caloric_target?: number | null;
  notes?: string | null;
  exclusions?: string[];
  slots?: MenuSlotCreate[];
}

export interface WeeklyMenuResponse {
  id: number;
  slug: string | null;
  user_id: string | null;
  start_date: string;
  nb_persons: number;
  caloric_target: number | null;
  notes: string | null;
  rating: number | null;
  slots: MenuSlotResponse[];
  created_at: string;
  updated_at: string;
}

export type HealthStatus = 'ok' | 'down' | 'loading';

export interface ServiceHealth {
  name: string;
  url: string;
  status: HealthStatus;
}

// ── Search ──────────────────────────────────────────────
export interface SearchRecipeResult {
  id: number;
  score: number | null;
  title: string;
  slug: string;
  description: string | null;
  difficulty: string | null;
  cuisine_origin: string | null;
  course_type: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  ingredient_names: string[];
  allergens: string[];
  image_url: string | null;
  free_tags: string[];
  created_at: string | null;
  calories?: number | null;
  proteines?: number | null;
  glucides?: number | null;
  lipides?: number | null;
  // Coaching : non-null si la recette a été poussée par un gestionnaire (coach).
  source_recipe_id?: number | null;
}

export interface NutritionTargets {
  calories: number;
  proteines: number;
  lipides: number;
  glucides: number;
  warnings: string[];
}

export interface SearchResponse {
  total: number;
  limit: number;
  offset: number;
  results: SearchRecipeResult[];
  nutrition_targets?: NutritionTargets;
}

// ── Profile sub-resources ────────────────────────────────
export interface MacrosResponse {
  goal: string;
  tdee_kcal: number;
  proteins_g: number;
  carbs_g: number;
  fats_g: number;
  proteins_kcal: number;
  carbs_kcal: number;
  fats_kcal: number;
}

export interface CalculationResponse {
  bmi: number;
  bmi_category: string;
  bmr_kcal: number;
  tdee_kcal: number;
  pal: number;
  ideal_weight_min_kg: number;
  ideal_weight_max_kg: number;
  macros: MacrosResponse | null;
  /** Cible énergétique = TDEE ajusté du déficit/surplus de l'objectif (null si pas d'objectif). */
  target_calories_kcal: number | null;
  /** Ajustement appliqué au TDEE, en % signé (-20 déficit, +12 surplus, 0 maintien). */
  energy_adjustment_pct: number;
  /** Explication textuelle déterministe de l'objectif calculé. */
  explanation: string | null;
}

export interface SportsProfileResponse {
  id: string;
  slug: string;
  sports: string[];
  practice_level: string;
  sessions_per_week: number;
  avg_session_duration_min: number;
  avg_intensity_rpe: number;
  resting_heart_rate_bpm: number | null;
  updated_at: string;
}

export interface LifestyleProfileResponse {
  id: string;
  slug: string;
  profession_activity_level: string | null;
  stress_level: string | null;
  sleep_hours: number | null;
  chronotype: string | null;
  alcohol_frequency: string | null;
  is_smoker: boolean;
  sedentary_hours_per_day: number | null;
  updated_at: string;
}

export interface NutritionPreferencesResponse {
  id: string;
  slug: string;
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
  updated_at: string;
}

export interface BodyCompositionResponse {
  id: string;
  slug: string;
  measured_at: string;
  body_fat_percentage: number | null;
  lean_mass_kg: number | null;
  bone_mass_kg: number | null;
  water_percentage: number | null;
  created_at: string;
}

export interface BodyMeasurementsResponse {
  id: string;
  slug: string;
  measured_at: string;
  waist_cm: number | null;
  hips_cm: number | null;
  chest_cm: number | null;
  shoulders_cm: number | null;
  left_arm_cm: number | null;
  right_arm_cm: number | null;
  left_thigh_cm: number | null;
  right_thigh_cm: number | null;
  created_at: string;
}

export interface PerformanceMetricResponse {
  id: string;
  slug: string;
  measured_at: string;
  vo2max: number | null;
  vma_kmh: number | null;
  ftp_watts: number | null;
  one_rm_squat_kg: number | null;
  one_rm_bench_press_kg: number | null;
  one_rm_deadlift_kg: number | null;
  one_rm_overhead_press_kg: number | null;
  created_at: string;
}

export interface InjuryResponse {
  id: string;
  slug: string;
  body_part: string;
  injury_type: string;
  is_current: boolean;
  is_chronic: boolean;
  diagnosed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface FoodAllergyResponse {
  id: string;
  slug: string;
  allergen: string;
  severity: string;
  notes: string | null;
  created_at: string;
}

export interface ExcludedFoodResponse {
  id: string;
  slug: string;
  food_name: string;
  reason: string | null;
  created_at: string;
}

export interface MedicalConditionResponse {
  id: string;
  slug: string;
  category: string;
  condition_name: string;
  is_current: boolean;
  notes: string | null;
  created_at: string;
}

export interface MedicationResponse {
  id: string;
  slug: string;
  medication_name: string;
  impacts_metabolism: boolean;
  notes: string | null;
  created_at: string;
}

// ── Shopping list ────────────────────────────────────────
export interface ShoppingItem {
  ingredient_id: number;
  ingredient_name: string;
  total_quantity: number;
  unit: string;
  category: string | null;
}

export interface ShoppingList {
  menu_id: number;
  menu_slug: string;
  nb_persons: number;
  start_date: string;
  items: ShoppingItem[];
}

// ── Crawler ──────────────────────────────────────────────
export type CrawlType   = 'web' | 'instagram' | 'youtube' | 'ocr';
export type CrawlStatus = 'waiting' | 'valid' | 'rejected';

export interface HydratedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface RecipeHydrated {
  title: string;
  description: string | null;
  instructions: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  ingredients: HydratedIngredient[];
  groq_tokens_used: number;
  from_cache: boolean;
  is_recipe: boolean;
  recipe_confidence: number;
}

export interface RecipeCommitRequest {
  title: string;
  description: string | null;
  instructions: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  ingredients: HydratedIngredient[];
  course_type: string | null;
  free_tags: string[];
}

export interface CrawlSourceResponse {
  id: string;
  user_id: string;
  type: CrawlType;
  url: string;
  actif: boolean;
  frequency_hours: number;
  execution_hour: string;
  last_crawl: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlResultResponse {
  id: string;
  source_id: string | null;
  user_id: string | null;
  type: CrawlType;
  url_origin: string;
  title: string;
  raw_content: string | null;
  images: string[];
  video_url: string | null;
  published_at: string | null;
  status: CrawlStatus;
  validate_by: string | null;
  validate_date: string | null;
  created_at: string;
}

export interface PaginatedCrawlResultResponse {
  items: CrawlResultResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface QueueTask {
  id: string | null;
  name: string | null;
  args: unknown;
  kwargs: unknown;
  worker: string | null;
  eta: string | null;
}

export interface QueueSnapshot {
  workers: string[];
  counts: Record<string, number>;
  active: QueueTask[];
  scheduled: QueueTask[];
  reserved: QueueTask[];
}

export interface CrawlTaskResult {
  status: 'done' | 'blocked' | 'error';
  reason?: string;
  message?: string;
  url?: string;
  new_count?: number;
  detail?: string;
}

export interface TaskStatus {
  task_id: string;
  state: string;
  known: boolean;
  ready: boolean;
  successful: boolean | null;
  error: string | null;
  finished_at: string | null;
  result: CrawlTaskResult | null;
}

export interface OneshotResponse {
  detail: string;
  url: string;
  type: 'instagram' | 'web';
  task_id: string;
}

export interface NotificationItem {
  slug: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export interface InstagramSessionInfo {
  configured: boolean;
  username: string | null;
  updated_at: string | null;
}

/** Rapport renvoyé par l'import de recettes en masse (admin). */
export interface RecipeImportReport {
  ingredients_upserted: number;
  recipes_created: number;
  recipe_slugs: string[];
}

// Réponse immédiate de l'upload : la tâche d'import est enfilée, pas exécutée.
export interface ImportEnqueueResponse {
  task_id: string;
  status: string;
}

// État d'une tâche d'import (polling). Sur succès, `result` porte le rapport.
export interface RecipeImportTaskStatus {
  task_id: string;
  state: string;
  known: boolean;
  ready: boolean;
  successful: boolean | null;
  error: string | null;
  finished_at: string | null;
  result: RecipeImportReport | null;
}
