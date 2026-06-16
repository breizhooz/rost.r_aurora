import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register as apiRegister, login as apiLogin, setHealthConsent } from '../api/endpoints';
// Profil/santé écrits dans le coffre chiffré (E2E) — le vault est déverrouillé
// juste avant (setUserKey après enrollAccount). Cf. api/healthDoc.ts.
import { createProfile, upsertSports, upsertLifestyle, upsertNutrition } from '../api/healthDoc';
import ThemeSwitch from '../components/ThemeSwitch';
import { enrollAccount } from '@nutri/e2e-core';
import { enrollKeyMaterial } from '../api/e2eKeys';
import { setUserKey } from '../crypto/vault';
import { useAuthContext } from '../context/AuthContext';
import { consumePostLoginRedirect } from '../utils/postLoginRedirect';
import { apiErrorMessage } from '../utils/apiError';
import '../aurora/aurora.css';

const STEPS = ['Compte', 'Physique', 'Sport', 'Mode de vie', 'Nutrition'];

type FD = {
  email: string; password: string;
  date_of_birth: string; biological_sex: string; height_cm: string; weight_kg: string; target_weight_kg: string;
  practice_level: string; sessions_per_week: string; avg_session_duration_min: string;
  profession_activity_level: string; stress_level: string; sleep_hours: string; chronotype: string; alcohol_frequency: string; is_smoker: string;
  diet_type: string; main_goal: string; meals_per_day: string; snacks_per_day: string; practices_if: string; fasting_window_hours: string; cooking_level: string; hydration_target_ml: string; budget_per_day_eur: string;
};

const INIT: FD = {
  email: '', password: '',
  date_of_birth: '', biological_sex: '', height_cm: '', weight_kg: '', target_weight_kg: '',
  practice_level: 'beginner', sessions_per_week: '3', avg_session_duration_min: '60',
  profession_activity_level: 'sedentary', stress_level: 'moderate', sleep_hours: '8', chronotype: 'intermediate', alcohol_frequency: 'never', is_smoker: 'false',
  diet_type: 'omnivore', main_goal: 'maintenance', meals_per_day: '3', snacks_per_day: '0', practices_if: 'false', fasting_window_hours: '', cooking_level: 'intermediate', hydration_target_ml: '2000', budget_per_day_eur: '',
};

function pwdChecks(p: string) {
  return {
    minLength:  p.length >= 8,
    hasUpper:   /[A-Z]/.test(p),
    hasDigit:   /\d/.test(p),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
  };
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const c = pwdChecks(password);
  const items = [
    { ok: c.minLength,  label: '8 caractères minimum' },
    { ok: c.hasUpper,   label: '1 lettre majuscule' },
    { ok: c.hasDigit,   label: '1 chiffre' },
    { ok: c.hasSpecial, label: '1 caractère spécial' },
  ];
  return (
    <div className="rost-reg-pwd">
      {items.map(i => (
        <div key={i.label} className={i.ok ? 'rost-reg-pwd-ok' : 'rost-reg-pwd-fail'}>
          <span>{i.ok ? '✓' : '○'}</span> {i.label}
        </div>
      ))}
    </div>
  );
}

export default function Register() {
  const [step, setStep]             = useState(0);
  const [fd, setFd]                 = useState<FD>(INIT);
  const [sportsList, setSportsList] = useState<string[]>([]);
  const [sportsInput, setSportsInput] = useState('');
  const [skipped, setSkipped]       = useState<Set<number>>(new Set());
  // RGPD : acceptation de la politique de confidentialité (mention art. 9 — données
  // de santé) obligatoire avant de créer le compte.
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  // E2E : passphrase de chiffrement, DISTINCTE du mot de passe de connexion. C'est
  // elle qui scelle le coffre (zero-knowledge) ; le serveur ne la voit jamais.
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  // E2E : code de récupération à afficher UNE fois après l'inscription des clés,
  // + destination de redirection une fois le code acquitté.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string>('/dashboard');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const navigate = useNavigate();
  const { status, setSession } = useAuthContext();
  // Vrai pendant l'inscription : la session devient active (setSession) avant la
  // fin du parcours, on ne veut donc PAS que le bounce auto ci-dessous parte sur
  // /dashboard et écrase la redirection finale (ex. retour vers /accept-invite).
  const submitting = useRef(false);

  useEffect(() => {
    // Visiteur déjà connecté arrivant sur /register → on le sort, en honorant un
    // éventuel parcours en attente (lien d'invitation). Ignoré pendant l'inscription.
    if (status === 'authenticated' && !submitting.current) {
      navigate(consumePostLoginRedirect() ?? '/dashboard', { replace: true });
    }
  }, [status, navigate]);

  const upd = (k: keyof FD) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFd(prev => ({ ...prev, [k]: e.target.value }));

  const next = () => { setError(null); setStep(s => s + 1); };
  const prev = () => { setError(null); setStep(s => s - 1); };

  const checks = pwdChecks(fd.password);
  const isPwdStrong = checks.minLength && checks.hasUpper && checks.hasDigit && checks.hasSpecial;
  const PASSPHRASE_MIN = 10;
  const isPassphraseValid = passphrase.length >= PASSPHRASE_MIN && passphrase === passphraseConfirm;
  const isStep0Valid = fd.email.trim() !== '' && fd.password !== '' && isPwdStrong
    && isPassphraseValid && acceptedPolicy;

  const addSport = () => {
    const s = sportsInput.trim();
    if (s && !sportsList.includes(s)) setSportsList(prev => [...prev, s]);
    setSportsInput('');
  };

  const submitForm = async (currentSkipped: Set<number>) => {
    setLoading(true); setError(null);
    submitting.current = true;
    try {
      await apiRegister(fd.email, fd.password);
      const loginResult = await apiLogin(fd.email, fd.password);
      if (!('access_token' in loginResult)) throw new Error('Réponse inattendue du serveur');
      setSession(loginResult.access_token);

      // E2E : génère la User Key + code de récupération à partir de la PASSPHRASE
      // de chiffrement (≠ mot de passe de connexion), enveloppe et inscrit le
      // matériel de clés ; garde la UK en mémoire (coffre).
      const enrollment = await enrollAccount(passphrase);
      await enrollKeyMaterial(enrollment.payload);
      setUserKey(enrollment.userKey);

      // RGPD (art. 9) : la case « traitement de mes données de santé » est cochée
      // (obligatoire à l'inscription) → on enregistre ce consentement explicite
      // AVANT d'écrire le profil. Sinon le garde-fou `require_health_consent`
      // rejette l'écriture du blob santé (403) et le profil saisi serait perdu
      // (l'utilisateur se le verrait redemander ensuite). setHealthConsent
      // rafraîchit aussi l'access token pour que le claim health_consent s'applique.
      await setHealthConsent(true);

      await createProfile({
        date_of_birth:    currentSkipped.has(1) ? null : (fd.date_of_birth || null),
        biological_sex:   currentSkipped.has(1) ? null : (fd.biological_sex || null),
        height_cm:        currentSkipped.has(1) ? null : (fd.height_cm ? Number(fd.height_cm) : null),
        weight_kg:        currentSkipped.has(1) ? null : (fd.weight_kg ? Number(fd.weight_kg) : null),
        target_weight_kg: currentSkipped.has(1) ? null : (fd.target_weight_kg ? Number(fd.target_weight_kg) : null),
      });

      if (!currentSkipped.has(2)) {
        await upsertSports({
          sports:                   sportsList,
          practice_level:           fd.practice_level,
          sessions_per_week:        Number(fd.sessions_per_week),
          avg_session_duration_min: Number(fd.avg_session_duration_min),
          avg_intensity_rpe:        5,
          resting_heart_rate_bpm:   null,
        });
      }

      if (!currentSkipped.has(3)) {
        await upsertLifestyle({
          profession_activity_level: fd.profession_activity_level,
          stress_level:              fd.stress_level,
          sleep_hours:               fd.sleep_hours ? Number(fd.sleep_hours) : null,
          chronotype:                fd.chronotype,
          alcohol_frequency:         fd.alcohol_frequency,
          is_smoker:                 fd.is_smoker === 'true',
          sedentary_hours_per_day:   null,
        });
      }

      if (!currentSkipped.has(4)) {
        await upsertNutrition({
          diet_type:            fd.diet_type,
          main_goal:            fd.main_goal,
          meals_per_day:        Number(fd.meals_per_day),
          snacks_per_day:       Number(fd.snacks_per_day),
          practices_if:         fd.practices_if === 'true',
          fasting_window_hours: fd.fasting_window_hours ? Number(fd.fasting_window_hours) : null,
          cooking_level:        fd.cooking_level,
          hydration_target_ml:  fd.hydration_target_ml ? Number(fd.hydration_target_ml) : null,
          budget_per_day_eur:   fd.budget_per_day_eur  ? Number(fd.budget_per_day_eur)  : null,
          supplements:          [],
        });
      }

      // Inscription terminée : on affiche d'abord le code de récupération (une
      // fois), puis on reprend un éventuel parcours en attente. `submitting.current`
      // reste à true → le bounce auto ne court-circuite pas cet écran.
      setPendingRedirect(consumePostLoginRedirect() ?? '/dashboard');
      setRecoveryCode(enrollment.recoveryCode);
    } catch (err: unknown) {
      submitting.current = false;
      setError(apiErrorMessage(err, 'Erreur lors de la création du compte'));
    } finally {
      setLoading(false);
    }
  };

  const skip = async () => {
    const newSkipped = new Set(skipped).add(step);
    setSkipped(newSkipped);
    setError(null);
    if (step === STEPS.length - 1) {
      await submitForm(newSkipped);
    } else {
      setStep(s => s + 1);
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    await submitForm(skipped);
  };

  const cardWidth = step === 0 ? 380 : 500;

  // Écran « code de récupération » : affiché une seule fois après l'inscription.
  // Sans ce code, une réinitialisation de mot de passe = perte définitive des
  // données chiffrées (zero-knowledge).
  if (recoveryCode) {
    return (
      <div className="aurora-root rost-auth">
        <div className="rost-auth-theme"><ThemeSwitch floating /></div>
        <div className="rost-auth-card" style={{ maxWidth: 460 }}>
          <h2 className="rost-auth-title">Votre code de récupération</h2>
          <p className="rost-auth-sub">Notez-le et conservez-le en lieu sûr</p>
          <div className="rost-notice" role="alert" style={{ marginTop: 12 }}>
            ⚠️ Vos données de santé sont chiffrées de bout en bout. <strong>Ce code est
            le seul moyen de les récupérer si vous oubliez votre passphrase de chiffrement.</strong>{' '}
            Il ne vous sera plus jamais affiché et nous ne pouvons pas le régénérer.
            <br />
            Avec votre passphrase <em>ou</em> ce code, vous retrouvez vos données{' '}
            <strong>sur tous vos appareils</strong> (web et mobile).
          </div>
          <pre
            style={{
              fontSize: 18, letterSpacing: '0.15em', textAlign: 'center',
              padding: '16px 8px', margin: '16px 0', borderRadius: 8,
              border: '1px solid var(--rule)', userSelect: 'all',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere',
            }}
          >{recoveryCode}</pre>
          <button
            type="button"
            className="rost-add-btn rost-auth-submit"
            onClick={() => navigate(pendingRedirect, { replace: true })}
          >
            J’ai noté mon code de récupération
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-root rost-auth">
      <div className="rost-auth-theme"><ThemeSwitch floating /></div>

      <div className="rost-auth-card rost-reg-card" style={{ maxWidth: cardWidth }}>
        <div className="rost-auth-brand">
          <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
        </div>

          {/* Stepper */}
          <div className="rost-reg-stepper">
            <div className="rost-reg-stepper-line" />
            {STEPS.map((label, i) => (
              <div className="rost-reg-step" key={i}>
                <div className={[
                  'rost-reg-stepnum',
                  i === step ? 'is-active' : '',
                  i < step   ? 'is-done'   : '',
                ].join(' ')}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={['rost-reg-steplabel', i === step ? 'is-active' : ''].join(' ')}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={onFormSubmit} className="rost-auth-form rost-reg-form" noValidate>

            {/* ── Step 0 : Compte ── */}
            {step === 0 && <>
              <div className="rost-reg-header">
                <h2>Créer un compte</h2>
                <p>Rejoignez Rost.r et planifiez votre nutrition</p>
              </div>

              <div className="rost-reg-field">
                <label htmlFor="email">Adresse email</label>
                <input id="email" type="email" value={fd.email} onChange={upd('email')}
                  placeholder="vous@exemple.com" autoComplete="email" required disabled={loading} />
              </div>

              <div className="rost-reg-field">
                <label htmlFor="password">Mot de passe</label>
                <input id="password" type="password" value={fd.password} onChange={upd('password')}
                  placeholder="••••••••" autoComplete="new-password" required disabled={loading} />
                <PasswordStrength password={fd.password} />
              </div>

              <div className="rost-reg-field">
                <label htmlFor="passphrase">Passphrase de chiffrement</label>
                <input id="passphrase" type="password" value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={`${PASSPHRASE_MIN} caractères minimum`} autoComplete="off"
                  required disabled={loading} />
                <p className="rost-reg-hint" style={{ fontSize: 12, lineHeight: 1.4, marginTop: 4, opacity: 0.8 }}>
                  Protège vos menus et données de santé. <strong>Différente</strong> du mot de passe
                  ci-dessus, elle n’est jamais transmise : nous ne pouvons ni la voir ni la réinitialiser.
                </p>
              </div>

              <div className="rost-reg-field">
                <label htmlFor="passphrase2">Confirmer la passphrase</label>
                <input id="passphrase2" type="password" value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  placeholder="••••••••••" autoComplete="off" required disabled={loading} />
                {passphraseConfirm.length > 0 && passphrase !== passphraseConfirm && (
                  <p className="rost-error" style={{ marginTop: 4 }}>Les deux passphrases ne correspondent pas.</p>
                )}
              </div>

              <label className="rost-reg-consent" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                <input type="checkbox" checked={acceptedPolicy} disabled={loading}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)} style={{ marginTop: 2 }} required />
                <span>
                  J’ai lu et j’accepte la{' '}
                  <Link to="/confidentialite" target="_blank" rel="noopener noreferrer">politique de confidentialité</Link>,
                  y compris le traitement de mes <strong>données de santé</strong> (art. 9 RGPD) sur la
                  base de mon consentement explicite, que je peux retirer à tout moment.
                </span>
              </label>
            </>}

            {/* ── Step 1 : Données physiques ── */}
            {step === 1 && <>
              <div className="rost-reg-header">
                <h2>Données physiques</h2>
                <p>Vos informations corporelles (optionnel)</p>
              </div>

              <div className="rost-reg-grid">
                <div className="rost-reg-field rost-reg-full">
                  <label>Date de naissance</label>
                  <input type="date" value={fd.date_of_birth} onChange={upd('date_of_birth')} disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Sexe biologique</label>
                  <select value={fd.biological_sex} onChange={upd('biological_sex')} disabled={loading}>
                    <option value="">— choisir —</option>
                    <option value="male">Masculin</option>
                    <option value="female">Féminin</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Taille (cm)</label>
                  <input type="number" value={fd.height_cm} onChange={upd('height_cm')}
                    placeholder="178" min="100" max="250" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Poids actuel (kg)</label>
                  <input type="number" value={fd.weight_kg} onChange={upd('weight_kg')}
                    placeholder="75" min="30" max="300" step="0.1" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Poids cible (kg)</label>
                  <input type="number" value={fd.target_weight_kg} onChange={upd('target_weight_kg')}
                    placeholder="70" min="30" max="300" step="0.1" disabled={loading} />
                </div>
              </div>
            </>}

            {/* ── Step 2 : Profil sportif ── */}
            {step === 2 && <>
              <div className="rost-reg-header">
                <h2>Profil sportif</h2>
                <p>Décrivez votre pratique sportive (optionnel)</p>
              </div>

              <div className="rost-reg-grid">
                <div className="rost-reg-field rost-reg-full">
                  <label>Sports pratiqués</label>
                  <div className="rost-reg-taginput">
                    <input
                      type="text"
                      value={sportsInput}
                      onChange={(e) => setSportsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && sportsInput.trim()) {
                          e.preventDefault();
                          addSport();
                        }
                      }}
                      placeholder="Ex : course à pied, natation… (Entrée pour ajouter)"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="rost-reg-tagadd"
                      onClick={addSport}
                      disabled={!sportsInput.trim() || loading}
                    >+</button>
                  </div>
                  {sportsList.length > 0 && (
                    <div className="rost-reg-taglist">
                      {sportsList.map(s => (
                        <span key={s} className="rost-reg-tag">
                          {s}
                          <button
                            type="button"
                            className="rost-reg-tagx"
                            onClick={() => setSportsList(prev => prev.filter(x => x !== s))}
                          >✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rost-reg-field rost-reg-full">
                  <label>Niveau de pratique</label>
                  <select value={fd.practice_level} onChange={upd('practice_level')} disabled={loading}>
                    <option value="beginner">Débutant</option>
                    <option value="intermediate">Intermédiaire</option>
                    <option value="advanced">Avancé</option>
                    <option value="competitive">Compétiteur</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Sessions / semaine</label>
                  <input type="number" value={fd.sessions_per_week} onChange={upd('sessions_per_week')}
                    placeholder="3" min="0" max="21" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Durée moy. (min)</label>
                  <input type="number" value={fd.avg_session_duration_min} onChange={upd('avg_session_duration_min')}
                    placeholder="60" min="0" max="300" disabled={loading} />
                </div>
              </div>
            </>}

            {/* ── Step 3 : Mode de vie ── */}
            {step === 3 && <>
              <div className="rost-reg-header">
                <h2>Mode de vie</h2>
                <p>Vos habitudes quotidiennes (optionnel)</p>
              </div>

              <div className="rost-reg-grid">
                <div className="rost-reg-field">
                  <label>Activité professionnelle</label>
                  <select value={fd.profession_activity_level} onChange={upd('profession_activity_level')} disabled={loading}>
                    <option value="sedentary">Sédentaire</option>
                    <option value="light">Légère</option>
                    <option value="moderate">Modérée</option>
                    <option value="heavy">Intense</option>
                    <option value="very_heavy">Très intense</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Niveau de stress</label>
                  <select value={fd.stress_level} onChange={upd('stress_level')} disabled={loading}>
                    <option value="low">Faible</option>
                    <option value="moderate">Modéré</option>
                    <option value="high">Élevé</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Heures de sommeil</label>
                  <input type="number" value={fd.sleep_hours} onChange={upd('sleep_hours')}
                    placeholder="8" min="3" max="14" step="0.5" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Chronotype</label>
                  <select value={fd.chronotype} onChange={upd('chronotype')} disabled={loading}>
                    <option value="morning">Lève-tôt</option>
                    <option value="intermediate">Intermédiaire</option>
                    <option value="evening">Couche-tard</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Fréquence alcool</label>
                  <select value={fd.alcohol_frequency} onChange={upd('alcohol_frequency')} disabled={loading}>
                    <option value="never">Jamais</option>
                    <option value="occasional">Occasionnel</option>
                    <option value="moderate">Modéré</option>
                    <option value="regular">Régulier</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Fumeur</label>
                  <select value={fd.is_smoker} onChange={upd('is_smoker')} disabled={loading}>
                    <option value="false">Non</option>
                    <option value="true">Oui</option>
                  </select>
                </div>
              </div>
            </>}

            {/* ── Step 4 : Nutrition ── */}
            {step === 4 && <>
              <div className="rost-reg-header">
                <h2>Nutrition</h2>
                <p>Vos préférences et objectifs alimentaires (optionnel)</p>
              </div>

              <div className="rost-reg-grid">
                <div className="rost-reg-field">
                  <label>Régime alimentaire</label>
                  <select value={fd.diet_type} onChange={upd('diet_type')} disabled={loading}>
                    <option value="omnivore">Omnivore</option>
                    <option value="vegetarian">Végétarien</option>
                    <option value="vegan">Vegan</option>
                    <option value="pescatarian">Pescatarien</option>
                    <option value="keto">Keto</option>
                    <option value="halal">Halal</option>
                    <option value="kosher">Kasher</option>
                    <option value="no_pork">Sans porc</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Objectif principal</label>
                  <select value={fd.main_goal} onChange={upd('main_goal')} disabled={loading}>
                    <option value="weight_loss">Perte de poids</option>
                    <option value="muscle_gain">Prise de masse</option>
                    <option value="body_recomposition">Recomposition</option>
                    <option value="sports_performance">Performance sportive</option>
                    <option value="maintenance">Maintien</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Repas / jour</label>
                  <input type="number" value={fd.meals_per_day} onChange={upd('meals_per_day')}
                    placeholder="3" min="1" max="10" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Collations / jour</label>
                  <input type="number" value={fd.snacks_per_day} onChange={upd('snacks_per_day')}
                    placeholder="0" min="0" max="6" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Niveau en cuisine</label>
                  <select value={fd.cooking_level} onChange={upd('cooking_level')} disabled={loading}>
                    <option value="beginner">Débutant</option>
                    <option value="intermediate">Intermédiaire</option>
                    <option value="advanced">Expert</option>
                  </select>
                </div>
                <div className="rost-reg-field">
                  <label>Jeûne intermittent</label>
                  <select value={fd.practices_if} onChange={upd('practices_if')} disabled={loading}>
                    <option value="false">Non</option>
                    <option value="true">Oui</option>
                  </select>
                </div>
                {fd.practices_if === 'true' && (
                  <div className="rost-reg-field">
                    <label>Fenêtre jeûne (h)</label>
                    <input type="number" value={fd.fasting_window_hours} onChange={upd('fasting_window_hours')}
                      placeholder="16" min="8" max="24" disabled={loading} />
                  </div>
                )}
                <div className="rost-reg-field">
                  <label>Hydratation cible (ml)</label>
                  <input type="number" value={fd.hydration_target_ml} onChange={upd('hydration_target_ml')}
                    placeholder="2000" min="500" max="5000" step="100" disabled={loading} />
                </div>
                <div className="rost-reg-field">
                  <label>Budget / jour (€)</label>
                  <input type="number" value={fd.budget_per_day_eur} onChange={upd('budget_per_day_eur')}
                    placeholder="15" min="0" max="100" step="0.5" disabled={loading} />
                </div>
              </div>
            </>}

            {error && (
              <div className="rost-error" role="alert">{error}</div>
            )}

            <div className={step > 0 ? 'rost-reg-navbtns' : undefined}>
              {step > 0 && (
                <button type="button" className="rost-btn rost-btn-ghost" onClick={prev} disabled={loading}>
                  ← Précédent
                </button>
              )}
              <button
                type="submit"
                className="rost-add-btn"
                style={{ flex: 1 }}
                disabled={loading || (step === 0 && !isStep0Valid)}
              >
                {loading && step === STEPS.length - 1
                  ? <>Création…</>
                  : step === STEPS.length - 1
                    ? 'Créer mon compte'
                    : 'Suivant →'
                }
              </button>
            </div>

            {step > 0 && (
              <p style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="rost-reg-skip"
                  onClick={skip}
                  disabled={loading}
                >
                  {step === STEPS.length - 1 ? 'Passer et terminer →' : 'Passer cette étape →'}
                </button>
              </p>
            )}

            {step === 0 && (
              <p className="rost-reg-switch">
                Déjà un compte ?{' '}
                <Link to="/login">Se connecter</Link>
              </p>
            )}
          </form>
      </div>
    </div>
  );
}

