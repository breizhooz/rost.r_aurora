import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { KeyMaterialDTO } from '@nutri/e2e-core';
import { getKeyMaterial } from '../api/e2eKeys';
import { isVaultUnlocked } from '../crypto/vault';
import VaultUnlock from '../components/VaultUnlock';
import VaultCreate from '../components/VaultCreate';
import '../aurora/aurora.css';

type Phase =
  | { kind: 'checking' }
  | { kind: 'unlock'; material: KeyMaterialDTO }
  | { kind: 'create' }
  | { kind: 'recovery'; code: string };

/**
 * Porte unique du coffre E2E, traversée après toute entrée en session (login
 * classique ou OAuth). Le coffre se déverrouille avec la **passphrase de
 * chiffrement**, distincte du mot de passe de connexion.
 *
 *  - coffre déjà ouvert (UK en sessionStorage, F5) → on file vers la cible ;
 *  - matériel de clés présent → saisie de la passphrase ({@link VaultUnlock}) ;
 *  - pas de matériel (1er passage : compte OAuth, ou compte d'avant l'E2E) →
 *    création de la passphrase ({@link VaultCreate}) puis affichage du code de
 *    récupération une seule fois.
 */
export default function VaultGate() {
  const navigate = useNavigate();
  const location = useLocation();
  // Cible finale une fois le coffre prêt : transmise par le flux d'auth (reprise
  // d'un parcours en attente, ex. lien d'invitation), sinon l'accueil.
  const home = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

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
    return <RecoveryNotice code={phase.code} onDone={() => navigate(home, { replace: true })} />;
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
            wordBreak: 'break-all',
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
