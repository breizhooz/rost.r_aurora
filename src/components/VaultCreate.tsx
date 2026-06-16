import { useState } from 'react';
import { enrollAccount } from '@nutri/e2e-core';
import { enrollKeyMaterial } from '../api/e2eKeys';
import { setUserKey } from '../crypto/vault';
import '../aurora/aurora.css';

interface VaultCreateProps {
  /** Appelé après l'inscription des clés ; remonte le code de récupération à afficher UNE fois. */
  onCreated: (recoveryCode: string) => void;
}

const MIN_LEN = 10;

/**
 * Création de la **passphrase de chiffrement** (E2E).
 *
 * Distincte du mot de passe du compte : c'est le secret qui scelle le coffre et
 * que le serveur ne voit jamais (zero-knowledge). On l'établit une fois — à la
 * première entrée d'un compte sans matériel de clés (typiquement après un login
 * OAuth, ou un compte créé avant l'E2E). Génère la User Key + un code de
 * récupération, enveloppe et inscrit le matériel, puis ouvre le coffre.
 */
export default function VaultCreate({ onCreated }: VaultCreateProps) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_LEN;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const canSubmit = passphrase.length >= MIN_LEN && confirm === passphrase && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const enrollment = await enrollAccount(passphrase);
      await enrollKeyMaterial(enrollment.payload);
      setUserKey(enrollment.userKey);
      onCreated(enrollment.recoveryCode);
    } catch {
      setError("Impossible d'initialiser le chiffrement. Réessaie dans un instant.");
      setLoading(false);
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        <h2 className="rost-auth-title">Protège tes données</h2>
        <p className="rost-auth-sub">
          Choisis une <strong>passphrase de chiffrement</strong>. Elle protège tes menus et
          données de santé : nous ne pouvons pas la voir ni la réinitialiser. Garde-la
          précieusement — elle est différente de ton mot de passe de connexion.
        </p>
        <p className="rost-auth-sub">
          C'est elle qui te permet de <strong>retrouver tes données sur tous tes appareils</strong>
          {' '}(web et mobile) : la même passphrase rouvre le même coffre, partout.
        </p>

        <form onSubmit={handleSubmit} className="rost-auth-form" noValidate>
          <label className="rost-form-group">
            <span>Passphrase de chiffrement</span>
            <input
              className="rost-form-input"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={`${MIN_LEN} caractères minimum`}
              autoComplete="new-password"
              autoFocus
              required
              disabled={loading}
            />
          </label>
          {tooShort && <p className="rost-error">Au moins {MIN_LEN} caractères.</p>}

          <label className="rost-form-group">
            <span>Confirme la passphrase</span>
            <input
              className="rost-form-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••"
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </label>
          {mismatch && <p className="rost-error">Les deux saisies ne correspondent pas.</p>}

          {error && <p className="rost-error" role="alert">{error}</p>}

          <button type="submit" className="rost-add-btn rost-auth-submit" disabled={!canSubmit}>
            {loading ? 'Initialisation…' : 'Activer le chiffrement'}
          </button>
        </form>
      </div>
    </div>
  );
}
