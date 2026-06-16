import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { bootstrapOAuthSession } from '../api/client';
import { clearStoredAccountId } from '../utils/activeAccount';
import { consumePostLoginRedirect } from '../utils/postLoginRedirect';
import '../aurora/aurora.css';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuthContext();
  const [error, setError] = useState<string | null>(null);

  const err        = searchParams.get('error');
  const mfaToken   = searchParams.get('mfa_token');
  const mfaMethod  = searchParams.get('mfa_method');
  const bootstrap  = searchParams.get('bootstrap');

  useEffect(() => {
    if (err) {
      setError(decodeURIComponent(err));
      return;
    }

    if (mfaToken) {
      // 2FA active : on reprend le formulaire de vérification de la page Login.
      // Après le 2FA, l'effet `isAuthenticated` de Login redirige vers /vault, qui
      // demande la passphrase de chiffrement → coffre déverrouillé.
      navigate('/login', {
        replace: true,
        state: { mfaToken, mfaMethod: mfaMethod ?? 'totp' },
      });
      return;
    }

    if (bootstrap) {
      // Succès. Le callback OAuth (servi par `localhost`, seul host accepté par
      // Google) ne peut pas poser le cookie refresh sur l'hôte API. On échange
      // donc ce jeton court contre api-users.localhost, qui pose le cookie sur le
      // bon hôte et renvoie l'access token → session active.
      // Reconnexion = on repart sur le compte par défaut de l'identité. On purge
      // tout compte mémorisé d'une session précédente pour ne pas atterrir sur un
      // compte fantôme (qui donnerait l'impression d'une « première connexion »).
      clearStoredAccountId();
      bootstrapOAuthSession(bootstrap)
        .then((token) => {
          setSession(token);
          // OAuth authentifie mais ne fournit pas la passphrase de chiffrement →
          // on passe par /vault, qui demande/crée la passphrase puis file vers la
          // cible finale (reprend un parcours en attente, ex. lien d'invitation).
          const target = consumePostLoginRedirect() ?? '/dashboard';
          navigate('/vault', { replace: true, state: { from: target } });
        })
        .catch(() => {
          setError("Échec de l'authentification. Veuillez réessayer.");
        });
      return;
    }

    setError("Échec de l'authentification. Veuillez réessayer.");
  }, [err, mfaToken, mfaMethod, bootstrap, setSession, navigate]);

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card" style={{ textAlign: 'center' }}>
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>
        {error ? (
          <>
            <p className="rost-error" role="alert">{error}</p>
            <div className="rost-auth-links"><a href="/login">← Retour à la connexion</a></div>
          </>
        ) : (
          <p className="rost-auth-sub">Connexion en cours…</p>
        )}
      </div>
    </div>
  );
}
