import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { refreshAccessToken } from '../api/client';
import { clearAccessToken, setAccessToken } from '../api/tokenStore';
import { clearStoredAccountId } from '../utils/activeAccount';
import { clearCurrentUserCache } from '../hooks/useCurrentUser';

const USERS_BASE = 'https://api-users.localhost';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  /** 'loading' tant que le bootstrap initial n'a pas tranché. */
  status: AuthStatus;
  /** Enregistre l'access token reçu d'un login/2FA et marque la session active. */
  setSession: (accessToken: string) => void;
  /** Déconnecte : efface le cookie côté backend + l'access token en mémoire. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  // SEC-05 : au démarrage, l'access token (mémoire) est vide. On tente un
  // /auth/refresh : si le cookie refresh est valide, on récupère un access token
  // → session restaurée sans jamais avoir stocké de token dans localStorage.
  useEffect(() => {
    let alive = true;
    refreshAccessToken()
      .then(() => {
        if (alive) setStatus('authenticated');
      })
      .catch(() => {
        // Ne pas écraser une session déjà établie entre-temps (ex: bootstrap
        // OAuth en parallèle) : on ne rétrograde que si on est encore en attente.
        if (alive) setStatus((prev) => (prev === 'loading' ? 'anonymous' : prev));
      });
    return () => {
      alive = false;
    };
  }, []);

  const setSession = useCallback((accessToken: string) => {
    setAccessToken(accessToken);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${USERS_BASE}/api/v1/auth/logout`, null, {
        withCredentials: true,
        timeout: 8000,
      });
    } catch {
      // Best-effort : même si l'appel échoue, on purge l'état local.
    }
    clearAccessToken();
    clearStoredAccountId();
    clearCurrentUserCache();
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ status, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within an AuthProvider');
  return ctx;
}
