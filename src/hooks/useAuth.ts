import { useState, useCallback } from 'react';
import { login as apiLogin, verifyMfa as apiVerifyMfa } from '../api/endpoints';
import { useAuthContext } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiError';

// E2E : le coffre n'est PAS déverrouillé ici. Le mot de passe de connexion ne
// dérive plus la clé de chiffrement (modèle « passphrase de coffre séparée ») :
// une fois la session établie, la page Login redirige vers /vault (cf. VaultGate),
// qui demande la passphrase de chiffrement (ou la crée au 1er passage).

export function useAuth() {
  const { status, setSession } = useAuthContext();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken]     = useState<string | null>(null);
  const [mfaMethod, setMfaMethod]   = useState<string>('totp');

  const isAuthenticated = status === 'authenticated';

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null);
    try {
      const result = await apiLogin(email, password);
      if ('mfa_token' in result) {
        setMfaToken(result.mfa_token);
        setMfaMethod(result.mfa_method);
        setMfaRequired(true);
      } else {
        // SEC-05 : le refresh est posé en cookie HttpOnly par le backend ;
        // on ne garde que l'access token en mémoire. La redirection (→ /vault)
        // est portée par l'effet `isAuthenticated` de la page Login.
        setSession(result.access_token);
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Identifiants incorrects'));
    } finally {
      setLoading(false);
    }
  }, [setSession]);

  const verifyMfa = useCallback(async (code: string) => {
    if (!mfaToken) return;
    setLoading(true); setError(null);
    try {
      const tokens = await apiVerifyMfa(mfaToken, code);
      setSession(tokens.access_token);
      setMfaRequired(false);
      setMfaToken(null);
      // Redirection (→ /vault) portée par l'effet `isAuthenticated` de Login.
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Code invalide'));
    } finally {
      setLoading(false);
    }
  }, [mfaToken, setSession]);

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

  return { isAuthenticated, login, loading, error, mfaRequired, mfaMethod, verifyMfa, startMfa, resetMfa };
}
