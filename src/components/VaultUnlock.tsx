import { useState } from 'react';
import { unlockWithPassword, type KeyMaterialDTO } from '@nutri/e2e-core';
import { setUserKey } from '../crypto/vault';
import '../aurora/aurora.css';

interface VaultUnlockProps {
  /** Matériel de clés (`GET /me/keys`) servant à dériver la Master Key. */
  material: KeyMaterialDTO;
  /** Appelé une fois la User Key dérivée et posée dans le coffre. */
  onUnlocked: () => void;
  /** Optionnel : continuer sans déverrouiller (les écrans chiffrés resteront vides). */
  onSkip?: () => void;
}

/**
 * Écran « déverrouille tes données chiffrées ».
 *
 * Le coffre E2E est verrouillé tant que la Master Key n'a pas été dérivée. On
 * demande la **passphrase de chiffrement** (distincte du mot de passe de
 * connexion) pour dériver la UK puis la poser en mémoire (cf. {@link setUserKey})
 * — sans jamais l'envoyer au serveur (zero-knowledge).
 */
export default function VaultUnlock({ material, onUnlocked, onSkip }: VaultUnlockProps) {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Passphrase fausse → unwrapKey échoue (tag AEAD invalide) → on relance.
      setUserKey(await unlockWithPassword(passphrase, material));
      onUnlocked();
    } catch {
      setError('Passphrase incorrecte. Réessaie pour déverrouiller tes données.');
      setLoading(false);
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        <h2 className="rost-auth-title">Déverrouille tes données</h2>
        <p className="rost-auth-sub">
          Tes menus et données de santé sont chiffrés de bout en bout. Saisis ta
          passphrase de chiffrement pour les déverrouiller sur cet appareil.
        </p>

        <form onSubmit={handleSubmit} className="rost-auth-form" noValidate>
          <label className="rost-form-group">
            <span>Passphrase de chiffrement</span>
            <input
              className="rost-form-input"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="••••••••••"
              autoComplete="off"
              autoFocus
              required
              disabled={loading}
            />
          </label>

          {error && <p className="rost-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="rost-add-btn rost-auth-submit"
            disabled={loading || !passphrase}
          >
            {loading ? 'Déverrouillage…' : 'Déverrouiller'}
          </button>

          {onSkip && (
            <button
              type="button"
              className="rost-btn rost-btn-ghost rost-auth-back"
              onClick={onSkip}
              disabled={loading}
            >
              Plus tard
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
