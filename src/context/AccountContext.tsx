import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listAccounts, switchAccount } from '../api/endpoints';
import { setAccessToken } from '../api/tokenStore';
import { decodeAccessContext } from '../utils/accessContext';
import { emitRefresh } from '../utils/liveRefresh';
import {
  readStoredAccountId,
  writeStoredAccountId,
  clearStoredAccountId,
} from '../utils/activeAccount';
import { clearCurrentUserCache } from '../hooks/useCurrentUser';
import { useAuthContext } from './AuthContext';
import type { AccountSummary } from '../types';

/**
 * Contexte de compte actif (multicomptes).
 *
 * Source de vérité unique du compte sur lequel l'utilisateur travaille, partagée
 * par la capsule de switch, le bandeau persistant du Shell et les pages. Résout
 * trois fragilités du socle précédent :
 *
 *  1. L'`activeId` ne vit plus dans un état local de la capsule (réinitialisé à
 *     chaque démontage) mais dans ce contexte global, persisté en sessionStorage.
 *  2. Au bootstrap (reload, retour OAuth), le token issu de `/auth/refresh`
 *     repart sur le compte *par défaut* ; on ré-applique ici le compte mémorisé
 *     pour ne pas perdre la bascule en cours.
 *  3. Le compte mémorisé est toujours validé contre la liste des comptes
 *     accessibles, et purgé à la déconnexion → une reconnexion (mot de passe ou
 *     OAuth) ne peut pas atterrir sur un compte fantôme d'une session précédente.
 */

interface AccountContextValue {
  accounts: AccountSummary[];
  /** Id du compte actif (porté par le token courant). */
  activeId: string | null;
  /** Résumé du compte actif (nom, rôle, défaut). */
  active: AccountSummary | null;
  /** Faux tant que le compte actif n'a pas été réconcilié au démarrage. */
  ready: boolean;
  /** Bascule vers un autre compte : (ré)émet le token de contexte + signale les écrans. */
  switchTo: (id: string) => Promise<void>;
  /** Recharge la liste des comptes accessibles (après une invitation acceptée, etc.). */
  reloadAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuthContext();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const reloadAccounts = useCallback(async () => {
    const list = await listAccounts();
    setAccounts(list);
  }, []);

  // Réconciliation du compte actif au démarrage / changement d'état d'auth.
  useEffect(() => {
    if (status !== 'authenticated') {
      // Anonyme : on purge tout (pas de fuite de contexte d'une session à l'autre).
      if (status === 'anonymous') {
        setAccounts([]);
        setActiveId(null);
        clearStoredAccountId();
      }
      // 'loading' → on attend ; 'anonymous' → rien à réconcilier, on débloque.
      setReady(status === 'anonymous');
      return;
    }

    let alive = true;
    setReady(false);
    (async () => {
      try {
        const list = await listAccounts();
        if (!alive) return;
        setAccounts(list);

        const has = (id: string | null): id is string => !!id && list.some((a) => a.id === id);
        const tokenAcct = decodeAccessContext().actAccount;
        const stored = readStoredAccountId();
        const fallback = (list.find((a) => a.is_default) ?? list[0])?.id ?? null;
        // Compte voulu : la bascule mémorisée si elle est encore accessible,
        // sinon celui porté par le token (défaut après refresh), sinon le défaut.
        const desired = has(stored) ? stored : has(tokenAcct) ? tokenAcct : fallback;

        if (desired && desired !== tokenAcct) {
          // Le token (compte par défaut) ne pointe pas sur le compte voulu :
          // on ré-applique le contexte pour survivre au reload / retour OAuth.
          try {
            const { access_token } = await switchAccount(desired);
            if (!alive) return;
            setAccessToken(access_token);
            clearCurrentUserCache();
          } catch {
            /* compte devenu inaccessible : on reste sur le token par défaut */
          }
        }
        if (!alive) return;
        const finalId = decodeAccessContext().actAccount ?? desired;
        setActiveId(finalId);
        writeStoredAccountId(finalId);
      } catch {
        // Service comptes indisponible : on ne bloque pas l'app, on retombe sur
        // le token courant (compte par défaut) sans bandeau de switch.
        if (alive) setActiveId(decodeAccessContext().actAccount);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  const switchTo = useCallback(async (id: string) => {
    const { access_token } = await switchAccount(id);
    setAccessToken(access_token);
    setActiveId(id);
    writeStoredAccountId(id);
    clearCurrentUserCache();
    // Réveille les écrans déjà montés (dashboard, etc.) pour qu'ils refetchent
    // avec le nouveau contexte, même sans démontage (switch depuis la même page).
    emitRefresh('account');
  }, []);

  const active = useMemo(
    () => accounts.find((a) => a.id === activeId) ?? null,
    [accounts, activeId],
  );

  const value = useMemo<AccountContextValue>(
    () => ({ accounts, activeId, active, ready, switchTo, reloadAccounts }),
    [accounts, activeId, active, ready, switchTo, reloadAccounts],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within an AccountProvider');
  return ctx;
}
