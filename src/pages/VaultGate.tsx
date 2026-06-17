import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { KeyMaterialDTO } from '@nutri/e2e-core';
import { getKeyMaterial } from '../api/e2eKeys';
import { setHealthConsent } from '../api/endpoints';
import { isVaultUnlocked } from '../crypto/vault';
import { decodeAccessContext } from '../utils/accessContext';
import { apiErrorMessage } from '../utils/apiError';
import VaultUnlock from '../components/VaultUnlock';
import VaultCreate from '../components/VaultCreate';
import '../aurora/aurora.css';

type Phase =
  | { kind: 'checking' }
  | { kind: 'unlock'; material: KeyMaterialDTO }
  | { kind: 'create' }
  | { kind: 'recovery'; code: string }
  | { kind: 'consent' };

/**
 * Porte unique du coffre E2E, traversée après toute entrée en session (login
 * classique ou OAuth). Le coffre se déverrouille avec la **passphrase de
 * chiffrement**, distincte du mot de passe de connexion.
 *
 *  - coffre déjà ouvert (UK en sessionStorage, F5) → on file vers la cible ;
 *  - matériel de clés présent → saisie de la passphrase ({@link VaultUnlock}) ;
 *  - pas de matériel (1er passage : compte OAuth, ou compte d'avant l'E2E) →
 *    création de la passphrase ({@link VaultCreate}), affichage du code de
 *    récupération une seule fois, puis — si le consentement santé (art. 9) n'est
 *    pas encore posé (cas typique d'un compte OAuth, qui ne passe pas par
 *    l'inscription) — recueil explicite de ce consentement ({@link ConsentStep}).
 */
export default function VaultGate() {
  const navigate = useNavigate();
  const location = useLocation();
  // Cible finale une fois le coffre prêt : transmise par le flux d'auth (reprise
  // d'un parcours en attente, ex. lien d'invitation), sinon l'accueil.
  const home = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const goHome = () => navigate(home, { replace: true });

  // Coffre prêt (passphrase créée + code de récupération acquitté). Un compte
  // OAuth n'est jamais passé par l'écran d'inscription → aucun consentement santé
  // (art. 9) n'a été recueilli, et la 1re écriture santé serait rejetée (403). On
  // le recueille ici, proactivement, plutôt que de subir la redirection réactive
  // déclenchée par le garde-fou backend. Un compte qui l'a déjà (legacy migré)
  // file directement vers sa cible.
  const afterVaultReady = () => {
    if (decodeAccessContext().healthConsent) goHome();
    else setPhase({ kind: 'consent' });
  };

  useEffect(() => {
    let alive = true;
    if (isVaultUnlocked()) {
      navigate(home, { replace: true });
      return;
    }
    getKeyMaterial()
      .then((m) => {
        if (!alive) return;
        setPhase(m ? { kind: 'unlock', material: m } : { kind: 'create' });
      })
      .catch(() => {
        // Matériel indisponible : on n'enferme pas l'utilisateur, les écrans
        // chiffrés gèrent eux-mêmes l'état verrouillé.
        if (alive) navigate(home, { replace: true });
      });
    return () => {
      alive = false;
    };
  }, [navigate, home]);

  if (phase.kind === 'unlock') {
    return (
      <VaultUnlock
        material={phase.material}
        onUnlocked={() => navigate(home, { replace: true })}
      />
    );
  }

  if (phase.kind === 'create') {
    return <VaultCreate onCreated={(code) => setPhase({ kind: 'recovery', code })} />;
  }

  if (phase.kind === 'recovery') {
    return <RecoveryNotice code={phase.code} onDone={afterVaultReady} />;
  }

  if (phase.kind === 'consent') {
    return <ConsentStep onDone={goHome} />;
  }

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card" style={{ textAlign: 'center' }}>
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>
        <p className="rost-auth-sub">Connexion en cours…</p>
      </div>
    </div>
  );
}

/** Affichage unique du code de récupération après création de la passphrase. */
function RecoveryNotice({ code, onDone }: { code: string; onDone: () => void }) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* presse-papier indisponible : l'utilisateur recopie à la main */
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        <h2 className="rost-auth-title">Ton code de récupération</h2>
        <p className="rost-auth-sub">
          Si tu oublies ta passphrase, ce code est le <strong>seul</strong> moyen de récupérer
          tes données. Note-le et garde-le en lieu sûr : il ne sera plus jamais affiché.
        </p>
        <p className="rost-auth-sub">
          Avec ta passphrase <em>ou</em> ce code, tu retrouves tes données{' '}
          <strong>sur tous tes appareils</strong> (web et mobile). Nous ne pouvons ni les
          voir ni les régénérer à ta place.
        </p>

        <code
          style={{
            display: 'block',
            padding: '0.9rem 1rem',
            margin: '0.5rem 0 1rem',
            borderRadius: 10,
            background: 'rgba(127,127,127,0.12)',
            fontSize: '1.05rem',
            letterSpacing: '0.04em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            overflowWrap: 'anywhere',
            textAlign: 'center',
          }}
        >
          {code}
        </code>

        <button type="button" className="rost-btn rost-btn-ghost" onClick={copy}>
          {copied ? 'Copié ✓' : 'Copier le code'}
        </button>

        <label className="rost-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
          <span>J'ai noté mon code de récupération en lieu sûr.</span>
        </label>

        <button
          type="button"
          className="rost-add-btn rost-auth-submit"
          onClick={onDone}
          disabled={!acked}
        >
          Continuer
        </button>
      </div>
    </div>
  );
}

/**
 * Recueil du consentement santé (art. 9 RGPD) pour les comptes qui n'ont pas
 * traversé l'écran d'inscription — typiquement un compte OAuth. Le consentement
 * doit être *explicite* (case à cocher) et *librement donné* (art. 7) : on
 * propose donc aussi « Plus tard », auquel cas l'utilisateur entre dans l'appli
 * sans données de santé ; il sera invité à consentir au moment où il en saisira
 * (filet réactif côté intercepteur), ou via l'onglet Confidentialité.
 */
function ConsentStep({ onDone }: { onDone: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grant = async () => {
    if (!accepted || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Enregistre le consentement ET rafraîchit l'access token pour que le claim
      // health_consent s'applique immédiatement (sinon 403 jusqu'au prochain refresh).
      await setHealthConsent(true);
      onDone();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, "Impossible d'enregistrer ton consentement. Réessaie dans un instant."));
      setLoading(false);
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        <h2 className="rost-auth-title">Tes données de santé</h2>
        <p className="rost-auth-sub">
          Pour te proposer des menus adaptés, Rost.r traite des{' '}
          <strong>données de santé</strong> (poids, mensurations, objectifs, allergies…).
          La loi (art. 9 RGPD) exige ton <strong>consentement explicite</strong> pour cela.
        </p>
        <p className="rost-auth-sub">
          Tu peux le <strong>retirer à tout moment</strong> depuis l'onglet Confidentialité ; tes
          données déjà enregistrées restent alors accessibles et supprimables.{' '}
          <a href="/confidentialite" target="_blank" rel="noopener noreferrer">
            Politique de confidentialité
          </a>.
        </p>

        <label
          className="rost-form-group"
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={loading}
            style={{ marginTop: '0.25rem' }}
          />
          <span>
            J'accepte le traitement de mes données de santé (art. 9 RGPD) sur la base de mon
            consentement explicite.
          </span>
        </label>

        {error && <p className="rost-error" role="alert">{error}</p>}

        <button
          type="button"
          className="rost-add-btn rost-auth-submit"
          onClick={grant}
          disabled={!accepted || loading}
        >
          {loading ? 'Enregistrement…' : 'Donner mon consentement'}
        </button>

        <button
          type="button"
          className="rost-btn rost-btn-ghost"
          onClick={onDone}
          disabled={loading}
          style={{ marginTop: '0.5rem' }}
        >
          Plus tard
        </button>

        <p className="rost-auth-sub" style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>
          Sans consentement, tu peux utiliser Rost.r mais pas enregistrer de données de santé.
        </p>
      </div>
    </div>
  );
}
