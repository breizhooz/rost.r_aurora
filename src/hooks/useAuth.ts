import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin, verifyMfa as apiVerifyMfa } from '../api/endpoints';
import { useAuthContext } from '../context/AuthContext';

export function useAuth() {
  const navigate = useNavigate();
  const { status, setSession, logout: ctxLogout } = useAuthContext();
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
        // on ne garde que l'access token en mémoire.
        setSession(result.access_token);
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Identifiants incorrects');
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
      navigate('/dashboard');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Code invalide');
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
