import { useEffect, useState } from 'react';
import { getMe } from '../api/endpoints';
import type { UserOut } from '../types';

// Cache module-level : un seul /me partagé entre le Shell et les pages,
// pour éviter les appels redondants et garder une source de vérité unique.
let cache: UserOut | null = null;
let inFlight: Promise<UserOut> | null = null;

/** Purge le cache /me (changement de compte, déconnexion) → prochain appel refait /me. */
export function clearCurrentUserCache(): void {
  cache = null;
  inFlight = null;
}

export interface CurrentUser {
  user: UserOut | null;
  loading: boolean;
  isAdmin: boolean;
  isCoach: boolean;
  canCrawl: (source: 'instagram' | 'web') => boolean;
  refresh: () => Promise<void>;
}

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<UserOut | null>(cache);
  const [loading, setLoading] = useState<boolean>(cache === null);

  useEffect(() => {
    let active = true;
    if (cache) {
      setUser(cache);
      setLoading(false);
      return;
    }
    if (!inFlight) inFlight = getMe();
    inFlight
      .then((u) => { cache = u; if (active) setUser(u); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { inFlight = null; if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const isAdmin = !!user?.user_admin;
  const isCoach = !!user?.is_coach;
  const canCrawl = (source: 'instagram' | 'web'): boolean =>
    isAdmin || !!user?.user_right?.crawl?.[source];

  const refresh = async () => {
    cache = await getMe();
    setUser(cache);
  };

  return { user, loading, isAdmin, isCoach, canCrawl, refresh };
}
