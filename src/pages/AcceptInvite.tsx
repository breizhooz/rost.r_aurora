import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { acceptInvitation, previewInvitation, switchAccount } from '../api/endpoints';
import { setAccessToken } from '../api/tokenStore';
import { setPostLoginRedirect } from '../utils/postLoginRedirect';
import { apiErrorMessage } from '../utils/apiError';
import type { AccountSummary, InvitationPreview } from '../types';
import '../aurora/aurora.css';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propriétaire', ADMIN: 'Administrateur', EDITOR: 'Éditeur',
  CONTRIBUTOR: 'Contributeur', VIEWER: 'Lecteur', COACH: 'Gestionnaire',
};

function errMessage(err: unknown): string {
  return apiErrorMessage(err, err instanceof Error ? err.message : 'Une erreur est survenue');
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { status, logout } = useAuthContext();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [joined, setJoined] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  const isCoachLink = preview?.kind === 'coach_link';

  // Aperçu public de l'invitation (avant acceptation) → écran de consentement adapté.
  useEffect(() => {
    if (!token) return;
    previewInvitation(token).then(setPreview).catch(() => setPreview(null));
  }, [token]);

  const doAccept = useCallback(() => {
    if (!token) return;
    attempted.current = true;
    setBusy(true);
    setError(null);
    acceptInvitation(token)
      .then(setJoined)
      .catch((err) => setError(errMessage(err)))
      .finally(() => setBusy(false));
  }, [token]);

  // Le mode collaboratif s'accepte automatiquement à l'arrivée (comportement
  // historique). Le lien de coaching exige un consentement explicite (l'accès est
  // accordé à SON propre compte) → on attend le clic.
  useEffect(() => {
    if (status !== 'authenticated' || !token || attempted.current) return;
    if (preview === null) return; // attend l'aperçu pour décider
    if (preview.kind === 'collaborator') doAccept();
  }, [status, token, preview, doAccept]);

  // Mauvaise adresse connectée : on se déconnecte pour reprendre avec l'adresse invitée.
  const logoutAndRetry = async () => {
    setPostLoginRedirect(window.location.pathname + window.location.search);
    await logout();
    attempted.current = false;
    setError(null);
  };

  const goToAccount = async () => {
    if (!joined) return;
    setBusy(true);
    try {
      const { access_token } = await switchAccount(joined.id);
      setAccessToken(access_token);
      navigate('/comptes', { replace: true });
    } catch {
      navigate('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const goToLogin = () => {
    setPostLoginRedirect(window.location.pathname + window.location.search);
    navigate('/login');
  };

  let body: React.ReactNode;
  if (!token) {
    body = (
      <>
        <p className="rost-error" role="alert">Lien d’invitation invalide (jeton manquant).</p>
        <div className="rost-auth-links"><Link to="/dashboard">← Tableau de bord</Link></div>
      </>
    );
  } else if (status === 'loading') {
    body = <p className="rost-auth-sub">Vérification de la session…</p>;
  } else if (status === 'anonymous') {
    body = (
      <>
        <p className="rost-auth-sub">
          {isCoachLink ? (
            <><strong>{preview?.inviter_email ?? 'Un gestionnaire'}</strong> souhaite devenir votre gestionnaire.
            Connectez-vous (ou créez un compte) avec l’adresse <strong>{preview?.email}</strong> pour accepter.</>
          ) : (
            <>Connectez-vous (ou créez un compte) avec l’adresse email <strong>invitée</strong> pour rejoindre ce compte.</>
          )}
        </p>
        <div className="rost-auth-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <button className="rost-add-btn" type="button" onClick={goToLogin}>Se connecter</button>
          <button className="rost-btn rost-btn-ghost" type="button"
            onClick={() => { setPostLoginRedirect(window.location.pathname + window.location.search); navigate('/register'); }}>
            Créer un compte
          </button>
        </div>
      </>
    );
  } else if (joined) {
    body = (
      <>
        <p className="rost-auth-sub">
          {isCoachLink ? (
            <>✓ <strong>{preview?.inviter_email ?? 'Votre gestionnaire'}</strong> est désormais votre gestionnaire et peut alimenter votre suivi.</>
          ) : (
            <>✓ Vous avez rejoint <strong>{joined.name}</strong> en tant que <strong>{ROLE_LABEL[joined.role] ?? joined.role}</strong>.</>
          )}
        </p>
        <div className="rost-auth-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          {!isCoachLink && (
            <button className="rost-add-btn" type="button" onClick={goToAccount} disabled={busy}>
              Aller sur ce compte
            </button>
          )}
          <button className="rost-btn rost-btn-ghost" type="button" onClick={() => navigate('/dashboard', { replace: true })}>
            Tableau de bord
          </button>
        </div>
      </>
    );
  } else if (busy) {
    body = <p className="rost-auth-sub">Acceptation de l’invitation…</p>;
  } else if (error) {
    body = (
      <>
        <p className="rost-error" role="alert">{error}</p>
        <p className="rost-auth-sub" style={{ marginTop: 12 }}>
          Une invitation ne peut être acceptée que par <strong>l’adresse email invitée</strong>
          {preview?.email ? <> (<strong>{preview.email}</strong>)</> : null}. Si vous êtes connecté
          avec un autre compte, déconnectez-vous pour reprendre avec la bonne adresse.
        </p>
        <div className="rost-auth-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <button className="rost-add-btn" type="button" onClick={logoutAndRetry} disabled={busy}>
            Se déconnecter et changer d’adresse
          </button>
          <button className="rost-btn rost-btn-ghost" type="button" onClick={() => navigate('/dashboard', { replace: true })}>
            Tableau de bord
          </button>
        </div>
      </>
    );
  } else if (isCoachLink) {
    // Authentifié + lien de coaching : consentement explicite.
    body = (
      <>
        <p className="rost-auth-sub">
          <strong>{preview?.inviter_email ?? 'Un gestionnaire'}</strong> souhaite devenir votre <strong>gestionnaire</strong>.
          En acceptant, il pourra <strong>voir et alimenter vos recettes, votre menu et votre profil</strong>
          {' '}(objectifs nutritionnels). Vous restez propriétaire de votre compte et pourrez retirer cet accès à tout moment.
        </p>
        <div className="rost-auth-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <button className="rost-add-btn" type="button" onClick={doAccept} disabled={busy}>
            Accepter ce gestionnaire
          </button>
          <button className="rost-btn rost-btn-ghost" type="button" onClick={() => navigate('/dashboard', { replace: true })}>
            Refuser
          </button>
        </div>
      </>
    );
  } else {
    body = <p className="rost-auth-sub">Acceptation de l’invitation…</p>;
  }

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card" style={{ textAlign: 'center' }}>
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>
        <h1 className="rost-auth-title">{isCoachLink ? 'Invitation gestionnaire' : 'Invitation'}</h1>
        {body}
      </div>
    </div>
  );
}
