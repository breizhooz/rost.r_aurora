import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeSwitch from '../components/ThemeSwitch';
import { consumePostLoginRedirect } from '../utils/postLoginRedirect';
import '../aurora/aurora.css';

const OAUTH_BASE = 'https://api-users.localhost';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode]   = useState('');
  const { login, verifyMfa, startMfa, resetMfa, loading, error, isAuthenticated, mfaRequired, mfaMethod } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) return;
    // Reprise d'un parcours interrompu par le login (ex : lien d'invitation) :
    // une page peut déposer l'URL de retour dans sessionStorage avant de rediriger ici.
    navigate(consumePostLoginRedirect() ?? '/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Reprise du flux 2FA initié via OAuth : le mfa_token est transmis par
  // OAuthCallback dans le state de navigation.
  useEffect(() => {
    const st = location.state as { mfaToken?: string; mfaMethod?: string } | null;
    if (st?.mfaToken) {
      startMfa(st.mfaToken, st.mfaMethod ?? 'totp');
      // Purge le state pour qu'un refresh ne relance pas la 2FA.
      window.history.replaceState({}, '');
    }
  }, [location.state, startMfa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaRequired) {
      await verifyMfa(mfaCode);
    } else {
      await login(email, password);
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-theme"><ThemeSwitch floating /></div>

      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        {mfaRequired ? (
          /* ── Étape MFA ── */
          <>
            <h2 className="rost-auth-title">Vérification</h2>
            <p className="rost-auth-sub">
              {mfaMethod === 'totp'
                ? 'Entrez le code de votre application authenticator'
                : 'Entrez le code reçu par email'}
            </p>

            <form onSubmit={handleSubmit} className="rost-auth-form" noValidate>
              <label className="rost-form-group">
                <span>Code à 6 chiffres</span>
                <input
                  className="rost-form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  disabled={loading}
                  style={{ letterSpacing: '0.3em', fontSize: '1.3rem', textAlign: 'center' }}
                />
              </label>

              {error && <p className="rost-error">{error}</p>}

              <button type="submit" className="rost-add-btn rost-auth-submit" disabled={loading || mfaCode.length !== 6}>
                {loading ? 'Vérification…' : 'Vérifier le code'}
              </button>

              <button type="button" className="rost-btn rost-btn-ghost rost-auth-back" onClick={() => { resetMfa(); setMfaCode(''); }}>
                ← Retour à la connexion
              </button>
            </form>
          </>
        ) : (
          /* ── Connexion ── */
          <>
            <h2 className="rost-auth-title">Bienvenue</h2>
            <p className="rost-auth-sub">Connectez-vous à votre espace nutrition</p>

            <div className="rost-auth-social">
              <a href={`${OAUTH_BASE}/api/v1/auth/oauth/google/authorize`} className="rost-btn rost-auth-oauth">
                <GoogleIcon /> Continuer avec Google
              </a>
              <a href={`${OAUTH_BASE}/api/v1/auth/oauth/facebook/authorize`} className="rost-btn rost-auth-oauth">
                <FacebookIcon /> Continuer avec Facebook
              </a>
            </div>

            <div className="rost-auth-divider"><span>ou</span></div>

            <form onSubmit={handleSubmit} className="rost-auth-form" noValidate>
              <label className="rost-form-group">
                <span>Adresse email</span>
                <input
                  className="rost-form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </label>

              <label className="rost-form-group">
                <span>Mot de passe</span>
                <input
                  className="rost-form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </label>

              {error && <p className="rost-error">{error}</p>}

              <button type="submit" className="rost-add-btn rost-auth-submit" disabled={loading || !email || !password}>
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>

              <div className="rost-auth-links">
                <span>Pas encore de compte ? <Link to="/register">Créer un compte</Link></span>
                <Link to="/forgot-password">Mot de passe oublié ?</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.3C9.6 36.4 16.3 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.7 2.1-2 3.9-3.7 5.2l6.2 5.2C37.1 40.1 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="#1877F2">
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.27h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z"/>
    </svg>
  );
}
