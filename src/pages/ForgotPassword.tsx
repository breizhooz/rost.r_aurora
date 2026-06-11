import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api/endpoints';
import ThemeSwitch from '../components/ThemeSwitch';
import '../aurora/aurora.css';

export default function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email);
    } catch {
      // always show generic message (security: no user enumeration)
    } finally {
      setLoading(false);
      setDone(true);
    }
  };

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-theme"><ThemeSwitch floating /></div>

      <div className="rost-auth-card">
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

        <h2 className="rost-auth-title">Mot de passe oublié</h2>
        <p className="rost-auth-sub">Saisissez votre adresse pour recevoir un lien</p>

        {done ? (
          <div className="rost-auth-form">
            <p className="rost-notice" role="status">
              Si un compte existe avec cette adresse, un lien de réinitialisation a été envoyé. Vérifiez votre boîte de réception.
            </p>
            <div className="rost-auth-links">
              <Link to="/login">← Retour à la connexion</Link>
            </div>
          </div>
        ) : (
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

            <button type="submit" className="rost-add-btn rost-auth-submit" disabled={loading || !email.trim()}>
              {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
            </button>

            <div className="rost-auth-links">
              <Link to="/login">← Retour à la connexion</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
