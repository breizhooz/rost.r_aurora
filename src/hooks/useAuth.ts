import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { unlockWithPassword } from '@nutri/e2e-core';
import { login as apiLogin, verifyMfa as apiVerifyMfa } from '../api/endpoints';
import { getKeyMaterial } from '../api/e2eKeys';
import { setUserKey } from '../crypto/vault';
import { useAuthContext } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiError';

// E2E : après une session établie, déverrouille le coffre (UK en mémoire) à partir
// du mot de passe. Best-effort — un échec n'empêche pas la connexion (les écrans
// chiffrés géreront l'absence de coffre). Sans inscription de clés (compte legacy),
// `getKeyMaterial` renvoie null → on ignore.
async function unlockVault(password: string): Promise<void> {
  try {
    const material = await getKeyMaterial();
    if (material) setUserKey(await unlockWithPassword(password, material));
  } catch {
    /* déverrouillage best-effort */
  }
}

export function useAuth() {
  const navigate = useNavigate();
  const { status, setSession, logout: ctxLogout } = useAuthContext();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken]     = useState<string | null>(null);
  const [mfaMethod, setMfaMethod]   = useState<string>('totp');
  // Mot de passe mémorisé le temps du 2FA pour déverrouiller le coffre après MFA.
  const pendingPassword = useRef<string | null>(null);

  const isAuthenticated = status === 'authenticated';

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null);
    try {
      const result = await apiLogin(email, password);
      if ('mfa_token' in result) {
        pendingPassword.current = password; // déverrouillage différé après le 2FA
        setMfaToken(result.mfa_token);
        setMfaMethod(result.mfa_method);
        setMfaRequired(true);
      } else {
        // SEC-05 : le refresh est posé en cookie HttpOnly par le backend ;
        // on ne garde que l'access token en mémoire.
        setSession(result.access_token);
        await unlockVault(password);
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Identifiants incorrects'));
    } finally {
      setLoading(false);
    }
  }, [navigate, setSession]);

  const verifyMfa = useCallback(async (code: string) => {
    if (!mfaToken) return;
    setLoading(true); setError(null);
    try {
      const tokens = await apiVerifyMfa(mfaToken, code);
      setSession(tokens.access_token);
      setMfaRequired(false);
      setMfaToken(null);
      if (pendingPassword.current) {
        await unlockVault(pendingPassword.current);
        pendingPassword.current = null;
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Code invalide'));
    } finally {
      setLoading(false);
    }
  }, [mfaToken, navigate, setSession]);

  const startMfa = useCallback((token: string, method: string = 'totp') => {
    setMfaToken(token);
    setMfaMethod(method);
    setMfaRequired(true);
    setError(null);
  }, []);

  const resetMfa = useCallback(() => {
    setMfaRequired(false);
    setMfaToken(null);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    await ctxLogout();
    navigate('/login');
  }, [ctxLogout, navigate]);

  return { isAuthenticated, login, logout, loading, error, mfaRequired, mfaMethod, verifyMfa, startMfa, resetMfa };
}
