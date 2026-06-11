import { useEffect, useState, useCallback } from 'react';
import {
  getMe,
  getMyProfile,
  searchRecipes,
  getMenus,
  checkHealth,
} from '../api/endpoints';
import { Skeleton, SkeletonRecipeCard, SkeletonProfileCard } from '../components/Skeleton';
import Layout from '../components/Layout';
import type {
  UserOut,
  ProfileResponse,
  SearchRecipeResult,
  WeeklyMenuResponse,
  MenuSlotResponse,
  ServiceHealth,
} from '../types';
import { courseTypeLabel, difficultyLabel, cuisineOriginLabel } from '../utils/enumLabels';
import styles from './Dashboard.module.css';

const DAYS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const DAY_ENUM_INDEX: Record<string, number> = {
  'enums.day.monday':    0,
  'enums.day.tuesday':   1,
  'enums.day.wednesday': 2,
  'enums.day.thursday':  3,
  'enums.day.friday':    4,
  'enums.day.saturday':  5,
  'enums.day.sunday':    6,
};

const MEAL_TYPE_FR: Record<string, string> = {
  'enums.meal_type.breakfast': 'Petit-déj.',
  'enums.meal_type.lunch':     'Déjeuner',
  'enums.meal_type.dinner':    'Dîner',
};

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

function sexLabel(sex: ProfileResponse['biological_sex']): string {
  if (!sex) return '—';
  const map: Record<string, string> = { male: 'Masculin', female: 'Féminin', other: 'Autre' };
  return map[sex] ?? sex;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date(iso));
  } catch { return iso; }
}

function todayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function getDayIndex(slot: MenuSlotResponse): number {
  return DAY_ENUM_INDEX[slot.day_of_week] ?? 0;
}

function fmtMealType(val: string): string {
  return MEAL_TYPE_FR[val] ?? val.split('.').pop()?.replace(/_/g, ' ') ?? val;
}

export default function Dashboard() {
  const [user,    setUser]    = useState<UserOut | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [recipes, setRecipes] = useState<SearchRecipeResult[]>([]);
  const [menus,   setMenus]   = useState<WeeklyMenuResponse[]>([]);
  const [health,  setHealth]  = useState<ServiceHealth[]>([]);

  const [loadingUser,    setLoadingUser]    = useState(true);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [loadingMenus,   setLoadingMenus]   = useState(true);
  const [loadingHealth,  setLoadingHealth]  = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    const result = await checkHealth();
    setHealth(result);
    setLoadingHealth(false);
  }, []);

  useEffect(() => {
    getMe()
      .then((u) => { setUser(u); return getMyProfile(); })
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoadingUser(false));

    searchRecipes('', 12)
      .then(setRecipes)
      .finally(() => setLoadingRecipes(false));

    getMenus()
      .then(setMenus)
      .finally(() => setLoadingMenus(false));

    fetchHealth();
  }, [fetchHealth]);

  const latestMenu = menus[0] ?? null;
  const slotsByDay: Record<number, MenuSlotResponse[]> = {};
  if (latestMenu?.slots) {
    for (const slot of latestMenu.slots) {
      const idx = getDayIndex(slot);
      if (!slotsByDay[idx]) slotsByDay[idx] = [];
      slotsByDay[idx].push(slot);
    }
  }

  const today = todayDayIndex();

  return (
    <Layout userEmail={user?.email}>
      <main className={styles.main}>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1>Tableau de bord</h1>
          <p>
            {loadingUser
              ? 'Chargement…'
              : `Bonjour, ${user?.email?.split('@')[0] ?? '…'} — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
            }
          </p>
        </div>

        {/* ── Top row: profile + health ── */}
        <div className={styles.topRow}>

          {/* Profile card */}
          <div className={styles.card}>
            <div className={styles.sectionLabel}>Profil utilisateur</div>
            {loadingUser ? (
              <SkeletonProfileCard />
            ) : (
              <>
                <div className={styles.profileHead}>
                  <div className={styles.profileAvatar}>
                    {user ? initials(user.email) : '??'}
                  </div>
                  <div>
                    <div className={styles.profileEmail}>{user?.email ?? '—'}</div>
                    <div className={styles.profileStatus}>
                      {user?.is_active ? 'Compte actif' : 'Compte inactif'}
                    </div>
                  </div>
                </div>
                {profile ? (
                  <div className={styles.profileStats}>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatLabel}>Taille</span>
                      <span className={styles.profileStatValue}>
                        {profile.height_cm ?? '—'}
                        {profile.height_cm && <span className={styles.profileStatUnit}>cm</span>}
                      </span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatLabel}>Poids</span>
                      <span className={styles.profileStatValue}>
                        {profile.weight_kg ?? '—'}
                        {profile.weight_kg && <span className={styles.profileStatUnit}>kg</span>}
                      </span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatLabel}>Sexe</span>
                      <span className={styles.profileStatValue} style={{ fontSize: '0.85rem' }}>
                        {sexLabel(profile.biological_sex)}
                      </span>
                    </div>
                    {profile.target_weight_kg && (
                      <div className={styles.profileStat}>
                        <span className={styles.profileStatLabel}>Objectif</span>
                        <span className={styles.profileStatValue}>
                          {profile.target_weight_kg}
                          <span className={styles.profileStatUnit}>kg</span>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className={styles.profileEmpty}>Aucun profil nutritionnel créé</p>
                )}
              </>
            )}
          </div>

          {/* Health status card */}
          <div className={styles.card}>
            <div className={styles.sectionLabel}>Santé des services</div>
            {loadingHealth ? (
              <div className={styles.healthGrid}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} height="44px" style={{ borderRadius: 10 }} />
                ))}
              </div>
            ) : (
              <>
                <div className={styles.healthGrid}>
                  {health.map((svc) => (
                    <div className={styles.healthItem} key={svc.name}>
                      <span className={`${styles.healthDot} ${styles[svc.status]}`} />
                      <span className={styles.healthName}>{svc.name}</span>
                      <span className={`${styles.healthBadge} ${styles[svc.status]}`}>
                        {svc.status === 'ok' ? 'OK' : svc.status === 'down' ? 'KO' : '…'}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className={styles.refreshBtn}
                  onClick={fetchHealth}
                  disabled={loadingHealth}
                >
                  <RefreshSvg /> Rafraîchir
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Recipes section ── */}
        <div className={`${styles.card} ${styles.recipesSection}`}>
          <div className={styles.sectionLabel}>Recettes récentes</div>
          {loadingRecipes ? (
            <div style={{ display: 'flex', gap: '1rem', overflow: 'hidden' }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonRecipeCard key={i} />)}
            </div>
          ) : recipes.length === 0 ? (
            <div className={styles.emptyState}>Aucune recette disponible</div>
          ) : (
            <div className={styles.recipesScroll}>
              {recipes.map((r) => (
                <div className={styles.recipeCard} key={r.id}>
                  <div className={styles.recipeType}>
                    {courseTypeLabel(r.course_type) ?? cuisineOriginLabel(r.cuisine_origin) ?? 'Recette'}
                  </div>
                  <div className={styles.recipeTitle}>{r.title}</div>
                  {r.description && (
                    <div className={styles.recipeDesc}>{r.description}</div>
                  )}
                  <div className={styles.recipeTags}>
                    {difficultyLabel(r.difficulty) && (
                      <span className={styles.recipeTag}>{difficultyLabel(r.difficulty)}</span>
                    )}
                    {r.prep_time_minutes != null && (
                      <span className={styles.recipeTagNeutral}>{r.prep_time_minutes} min</span>
                    )}
                    {r.servings != null && (
                      <span className={styles.recipeTagNeutral}>{r.servings} pers.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Weekly menu section ── */}
        <div className={`${styles.card} ${styles.menuSection}`}>
          <div className={styles.sectionLabel}>
            Menu de la semaine
            {latestMenu && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0 }}>
                — semaine du {formatDate(latestMenu.start_date)}
              </span>
            )}
          </div>
          {loadingMenus ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem' }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} height="120px" style={{ borderRadius: 10 }} />
              ))}
            </div>
          ) : !latestMenu ? (
            <div className={styles.emptyState}>Aucun menu planifié cette semaine</div>
          ) : (
            <div className={styles.weekGrid}>
              {DAYS_FR.map((day, idx) => (
                <div className={styles.dayCard} key={day}>
                  <div className={`${styles.dayLabel} ${idx === today ? styles.today : ''}`}>
                    {day}
                  </div>
                  {slotsByDay[idx]?.length ? (
                    slotsByDay[idx].map((slot, si) => (
                      <div className={styles.mealSlot} key={si}>
                        <div className={styles.mealType}>{fmtMealType(slot.meal_type)}</div>
                        <div className={styles.mealName}>Recette #{slot.recipe_id}</div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.dayEmpty}>—</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </Layout>
  );
}

function RefreshSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}
