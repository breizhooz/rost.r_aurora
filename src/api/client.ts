import axios, { type AxiosInstance } from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';
import { readStoredAccountId } from '../utils/activeAccount';
import { decodeAccessContext } from '../utils/accessContext';

const USERS_BASE = 'https://api-users.localhost';

// SEC-05 : un seul refresh en vol à la fois. Au boot (ou sur une rafale de 401),
// plusieurs requêtes peuvent vouloir rafraîchir en même temps → on partage la
// même promesse pour ne taper /auth/refresh qu'une fois.
let refreshPromise: Promise<string> | null = null;

/**
 * Échange le cookie refresh (HttpOnly) contre un nouvel access token en mémoire.
 * Utilise `axios` brut (sans intercepteur) pour ne pas reboucler sur un 401.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ access_token: string }>(
        `${USERS_BASE}/api/v1/auth/refresh`,
        null,
        { timeout: 8000, withCredentials: true }
      )
      .then(async (r) => {
        setAccessToken(r.data.access_token);
        // Le refresh repart toujours sur le compte *par défaut*. Si l'utilisateur
        // travaillait sur un autre compte, on ré-applique ce contexte pour qu'un
        // simple 401 en cours de session ne le ramène pas silencieusement sur son
        // compte par défaut (perte de contexte du switch).
        return reapplyActiveAccount(r.data.access_token);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Après un /auth/refresh, ré-applique le compte actif mémorisé s'il diffère de
 * celui porté par le token rafraîchi. Best-effort : si le switch échoue (compte
 * devenu inaccessible), on conserve le token par défaut.
 */
async function reapplyActiveAccount(refreshedToken: string): Promise<string> {
  const stored = readStoredAccountId();
  if (!stored) return refreshedToken;
  const current = decodeAccessContext(refreshedToken).actAccount;
  if (stored === current) return refreshedToken;
  try {
    const r = await axios.post<{ access_token: string }>(
      `${USERS_BASE}/api/v1/accounts/${stored}/switch`,
      null,
      {
        timeout: 8000,
        withCredentials: true,
        headers: { Authorization: `Bearer ${refreshedToken}` },
      },
    );
    setAccessToken(r.data.access_token);
    return r.data.access_token;
  } catch {
    return refreshedToken;
  }
}

/**
 * Échange le jeton de bootstrap OAuth (reçu dans l'URL du callback) contre un
 * access token, et pose le cookie refresh sur le bon hôte (api-users.localhost).
 * Nécessaire car le callback OAuth est servi par `localhost` (seul host accepté
 * par Google), différent de l'hôte API où le front lit le cookie.
 */
export function bootstrapOAuthSession(bootstrapToken: string): Promise<string> {
  return axios
    .post<{ access_token: string }>(
      `${USERS_BASE}/api/v1/auth/oauth/bootstrap`,
      { bootstrap_token: bootstrapToken },
      { timeout: 8000, withCredentials: true }
    )
    .then((r) => {
      setAccessToken(r.data.access_token);
      return r.data.access_token;
    });
}

function createClient(baseURL: string): AxiosInstance {
  // withCredentials : indispensable pour envoyer/recevoir le cookie refresh
  // (cross-site dev : front localhost:5173 ↔ API *.localhost).
  const instance = axios.create({ baseURL, timeout: 8000, withCredentials: true });

  instance.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;
        try {
          const token = await refreshAccessToken();
          original.headers.Authorization = `Bearer ${token}`;
          return instance(original);
        } catch {
          clearAccessToken();
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

export const usersClient        = createClient(USERS_BASE);
export const profileClient      = createClient('https://api-profile.localhost');
export const recipeClient       = createClient('https://api-recipe.localhost');
export const menuClient         = createClient('https://api-menu.localhost');
export const crawlerClient      = createClient('https://api-crawler.localhost');
export const notificationClient = createClient('https://api-notification.localhost');
