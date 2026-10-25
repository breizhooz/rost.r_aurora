import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { useAuthContext } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { decodeAccessContext } from '../utils/accessContext';
import { apiErrorMessage } from '../utils/apiError';
import {
  getMe, requestPasswordReset, changePassword, setupTotp, confirmTotp, disableMfa,
  getAccountCoach, revokeAccountCoach,
  getConsents, setHealthConsent, exportMyData, deleteMyAccount,
} from '../api/endpoints';
// Corps et activité : stockés sur l'appareil ; préférences, exclusions et cibles
// calculées : profil serveur (sans donnée médicale). Cf. api/healthDoc.ts.
import {
  resetHealthDocCache, clearDeviceProfile,
  getMyProfile, getCalculations, getSportsProfile, getLifestyle, getNutritionPreferences,
  getExcludedFoods, createProfile, updateProfile, upsertSports, upsertLifestyle, upsertNutrition,
  addExcludedFood, deleteExcludedFood,
} from '../api/healthDoc';
import type {
  UserOut, ProfileResponse, CalculationResponse, SportsProfileResponse, LifestyleProfileResponse,
  NutritionPreferencesResponse, ExcludedFoodResponse, TotpSetupResponse, CoachInfo, ConsentResponse,
} from '../types';

// ── Sub-forms ───────────────────────────────────────────────────────────────
function ExcludedFoodForm({ onAdd, onCancel, addFn }: { onAdd: () => void; onCancel: () => void; addFn: (b: Record<string, unknown>) => Promise<unknown>; }) {
  const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  return (
    <form className="rost-inline-form" onSubmit={async (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); setLoading(true); setErr('');
      try { await addFn({ food_name: fd.get('food_name') }); onAdd(); }
      catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); } setLoading(false);
    }}>
      <div className="rost-form-grid">
        <input className="rost-form-input" name="food_name" placeholder="Aliment (ex: arachide, lactose)" required />
      </div>
      {err && <p className="rost-error">{err}</p>}
      <div className="rost-inline-actions"><button className="rost-add-btn" type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button><button className="rost-btn rost-btn-ghost" type="button" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}
function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}
function fmt(v: number | null | undefined, u = ''): string { return v == null ? '—' : `${v}${u}`; }
function fmtDate(d: string | null | undefined): string { if (!d) return '—'; try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; } }
function cap(s: string | null | undefined): string { if (!s) return '—'; return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '); }

type Tab = 'profil' | 'activite' | 'nutrition' | 'coach' | 'securite' | 'confidentialite';
// Onglets visibles dans la barre. « Sécurité » et « Confidentialité » n'y figurent
// pas : on y accède via le menu utilisateur (déroulant), cf. AuroraShell.
const TAB_LABELS: Record<Exclude<Tab, 'securite' | 'confidentialite'>, string> = { profil: 'Profil', activite: 'Activité', nutrition: 'Nutrition', coach: 'Mon gestionnaire' };

// Sections du « classeur » de l'onglet Profil : navigation verticale à gauche,
// contenu à droite. Test de ce layout ici avant de l'étendre aux autres onglets.
type ProfilSection = 'physique' | 'calculs';
const PROFIL_SECTIONS: { id: ProfilSection; label: string }[] = [
  { id: 'physique', label: 'Données physiques' },
  { id: 'calculs', label: 'Calculs métaboliques' },
];

type ActiviteSection = 'sportif' | 'modedevie';
const ACTIVITE_SECTIONS: { id: ActiviteSection; label: string }[] = [
  { id: 'sportif', label: 'Profil sportif' },
  { id: 'modedevie', label: 'Activité quotidienne' },
];

type NutritionSection = 'preferences' | 'exclus' | 'regles';
const NUTRITION_SECTIONS: { id: NutritionSection; label: string }[] = [
  { id: 'preferences', label: 'Préférences nutritionnelles' },
  { id: 'exclus', label: 'Aliments exclus' },
  { id: 'regles', label: 'Règles nutritionnelles' },
];

function Stat({ label, value, unit, cat }: { label: string; value: React.ReactNode; unit?: string; cat?: string }) {
  return (
    <div className="rost-pstat">
      <span className="rost-pstat-label">{label}</span>
      <span className="rost-pstat-val">{value}{unit && <em>{unit}</em>}</span>
      {cat && <span className="rost-pstat-cat">{cat}</span>}
    </div>
  );
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      className={`rost-toggle ${on ? 'is-on' : ''}`} onClick={onChange}>
      <span className="rost-toggle-knob" />
    </button>
  );
}

// Jauge IMC : piste colorée (vert = zone saine 18,5–25, rouge/orange aux extrêmes)
// avec un curseur positionné sur l'échelle 15→40. Remplace l'ancien libellé texte.
function BmiGauge({ bmi, category }: { bmi: number; category: string }) {
  const pct = Math.max(0, Math.min(100, ((bmi - 15) / (40 - 15)) * 100));
  return (
    <div className="rost-bmi-gauge">
      <div className="rost-bmi-track" role="img" aria-label={`IMC ${bmi.toFixed(1)} — ${category}`}>
        <span className="rost-bmi-marker" style={{ left: `${pct}%` }} />
      </div>
      <span className="rost-bmi-cat">{category}</span>
    </div>
  );
}

export default function AuroraProfil() {
  const { setSession, logout } = useAuthContext();
  const { isAdmin } = useCurrentUser();
  const { activeId, active } = useAccount();
  // Droit d'écriture sur le profil du *compte actif* (RBAC). OWNER/ADMIN (et
  // l'admin plateforme) ont profile:write ; EDITOR/VIEWER non → lecture seule.
  const canWriteProfile = useMemo(() => {
    const ctx = decodeAccessContext();
    return ctx.userAdmin || ctx.scopes.includes('profile:write');
  }, [activeId]);
  const [searchParams] = useSearchParams();
  // Onglet « Mon coach » : le coach actif du compte (le client peut le révoquer).
  const [coachInfo, setCoachInfo] = useState<CoachInfo | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachRevoking, setCoachRevoking] = useState(false);
  const [coachMsg, setCoachMsg] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('profil');
  const [profilSection, setProfilSection] = useState<ProfilSection>('physique');
  const [activiteSection, setActiviteSection] = useState<ActiviteSection>('sportif');
  const [nutritionSection, setNutritionSection] = useState<NutritionSection>('preferences');
  const [user, setUser] = useState<UserOut | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [calcs, setCalcs] = useState<CalculationResponse | null>(null);
  const [sports, setSports] = useState<SportsProfileResponse | null>(null);
  const [lifestyle, setLifestyle] = useState<LifestyleProfileResponse | null>(null);
  const [nutrition, setNutrition] = useState<NutritionPreferencesResponse | null>(null);
  const [excluded, setExcluded] = useState<ExcludedFoodResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSportsList, setNewSportsList] = useState<string[]>([]);
  const [newSportsInput, setNewSportsInput] = useState('');
  const [pwdResetSent, setPwdResetSent] = useState(false);
  const [pwdResetLoading, setPwdResetLoading] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState(''); const [pwdNew, setPwdNew] = useState(''); const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false); const [pwdErr, setPwdErr] = useState(''); const [pwdOk, setPwdOk] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState(''); const [totpLoading, setTotpLoading] = useState(false);
  const [totpErr, setTotpErr] = useState(''); const [totpDone, setTotpDone] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false); const [savingSports, setSavingSports] = useState(false);
  const [savingLifestyle, setSavingLifestyle] = useState(false); const [savingNutrition, setSavingNutrition] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [profileErr, setProfileErr] = useState(''); const [sportsErr, setSportsErr] = useState('');
  const [lifestyleErr, setLifestyleErr] = useState(''); const [nutritionErr, setNutritionErr] = useState('');
  const [showAddExcluded, setShowAddExcluded] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false); const [editingSports, setEditingSports] = useState(false);
  const [editingLifestyle, setEditingLifestyle] = useState(false); const [editingNutrition, setEditingNutrition] = useState(false);
  const [editSportsList, setEditSportsList] = useState<string[]>([]); const [editSportsInput, setEditSportsInput] = useState('');
  // ── RGPD (Confidentialité) ──
  // Vérité « token » (claim health_consent) : c'est ce que le backend applique au
  // garde-fou santé. La liste `consents` est la vérité « base » (historique/date).
  const [healthConsentGranted, setHealthConsentGranted] = useState<boolean>(() => decodeAccessContext().healthConsent);
  const [consents, setConsents] = useState<ConsentResponse[] | null>(null);
  const [consentBusy, setConsentBusy] = useState(false); const [consentErr, setConsentErr] = useState('');
  const [exporting, setExporting] = useState(false); const [exportErr, setExportErr] = useState('');
  const [deleteText, setDeleteText] = useState(''); const [deleting, setDeleting] = useState(false); const [deleteErr, setDeleteErr] = useState('');

  useEffect(() => {
    resetHealthDocCache(); // recharge le profil serveur à chaque montage de la page
    Promise.all([
      getMe().then((u) => { setUser(u); setMfaEnabled(u.two_factor_enabled); }),
      getMyProfile().then(setProfile), getCalculations().then(setCalcs), getSportsProfile().then(setSports),
      getLifestyle().then(setLifestyle), getNutritionPreferences().then(setNutrition),
      getExcludedFoods().then(setExcluded),
    ]).finally(() => setLoading(false));
  }, []);

  // Ouverture des sections Sécurité / Confidentialité depuis le menu utilisateur
  // (/profil?section=securite ou ?section=confidentialite). Le 403 « consentement
  // santé requis » redirige aussi vers ?section=confidentialite&consent=required.
  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'securite') setActiveTab('securite');
    if (section === 'confidentialite') setActiveTab('confidentialite');
  }, [searchParams]);

  // Charge l'historique des consentements à l'ouverture de l'onglet Confidentialité.
  useEffect(() => {
    if (activeTab !== 'confidentialite' || consents !== null) return;
    getConsents().then(setConsents).catch(() => setConsents([]));
  }, [activeTab, consents]);

  // Charge le coach du compte actif à l'ouverture de l'onglet « Mon coach ».
  useEffect(() => {
    if (activeTab !== 'coach' || !activeId) return;
    setCoachLoading(true); setCoachMsg('');
    getAccountCoach(activeId)
      .then(setCoachInfo)
      .catch(() => setCoachInfo({ membership_id: null, email: null }))
      .finally(() => setCoachLoading(false));
  }, [activeTab, activeId]);

  const revokeCoach = async () => {
    if (!activeId || coachRevoking) return;
    if (!window.confirm('Couper le lien avec votre gestionnaire ? Il perdra l’accès à votre compte.')) return;
    setCoachRevoking(true); setCoachMsg('');
    try {
      await revokeAccountCoach(activeId);
      setCoachInfo({ membership_id: null, email: null });
      setCoachMsg('✓ Lien coupé. Votre gestionnaire n’a plus accès à votre compte.');
    } catch {
      setCoachMsg('Échec. Réessayez.');
    } finally {
      setCoachRevoking(false);
    }
  };

  // Octroi/retrait du consentement santé : enregistre + rafraîchit le token (le
  // claim health_consent est recalculé au refresh), puis recharge l'historique.
  const toggleHealthConsent = async (granted: boolean) => {
    if (consentBusy) return;
    if (!granted && !window.confirm('Retirer votre consentement ? Vous ne pourrez plus modifier votre objectif, vos préférences ni vos cibles nutritionnelles tant qu’il n’est pas redonné. Les données déjà enregistrées sont conservées.')) return;
    setConsentBusy(true); setConsentErr('');
    try {
      await setHealthConsent(granted);
      setHealthConsentGranted(decodeAccessContext().healthConsent);
      setConsents(await getConsents());
    } catch (e: unknown) {
      setConsentErr(apiErrorMessage(e, 'Erreur lors de l’enregistrement du consentement.'));
    } finally {
      setConsentBusy(false);
    }
  };

  // Portabilité (art. 20) : télécharge l'export agrégé en JSON.
  const downloadExport = async () => {
    if (exporting) return;
    setExporting(true); setExportErr('');
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rostr-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportErr(apiErrorMessage(e, 'Échec de l’export. Réessayez.'));
    } finally {
      setExporting(false);
    }
  };

  // Effacement (art. 17) : suppression définitive + propagation cross-service côté
  // backend. Confirmation forte (saisie de SUPPRIMER) puis déconnexion.
  const deleteAccount = async () => {
    if (deleting || !user) return;
    setDeleting(true); setDeleteErr('');
    try {
      await deleteMyAccount(user.id);
      clearDeviceProfile();
      await logout();
      window.location.assign('/login');
    } catch (e: unknown) {
      setDeleteErr(apiErrorMessage(e, 'Échec de la suppression. Réessayez.'));
      setDeleting(false);
    }
  };

  const toggleRules = async () => {
    if (!profile || savingRules) return;
    setSavingRules(true);
    try { setProfile(await updateProfile({ nutrition_rules_enabled: !profile.nutrition_rules_enabled })); }
    catch { /* ignore */ } finally { setSavingRules(false); }
  };

  const [rulesVariety, setRulesVariety] = useState(10);
  useEffect(() => { if (nutrition) setRulesVariety(Math.round(nutrition.rules_variety_pct * 100)); }, [nutrition]);

  const saveRules = async (patch: Record<string, unknown>) => {
    if (!nutrition) return;
    const body = {
      diet_type: nutrition.diet_type, main_goal: nutrition.main_goal,
      meals_per_day: nutrition.meals_per_day, snacks_per_day: nutrition.snacks_per_day,
      practices_if: nutrition.practices_if, fasting_window_hours: nutrition.fasting_window_hours,
      cooking_level: nutrition.cooking_level, budget_per_day_eur: nutrition.budget_per_day_eur,
      rules_variety_pct: nutrition.rules_variety_pct,
      rules_override_calories: nutrition.rules_override_calories, rules_override_proteines: nutrition.rules_override_proteines,
      ...patch,
    };
    try { setNutrition(await upsertNutrition(body)); } catch { /* ignore */ }
  };

  return (
    <AuroraShell screen="profil" initials={user ? initials(user.email) : undefined}
      title="Profil" subtitle={active?.name ?? user?.email}>
      <div className="rost-page">
        {!canWriteProfile && (
          <div className="rost-readonly-banner" role="status">
            🔒 Lecture seule — votre rôle sur ce compte ne permet pas de modifier le profil.
          </div>
        )}
        {canWriteProfile && !healthConsentGranted && (
          <div className="rost-readonly-banner" role="status">
            🩺 Votre consentement (art. 9 RGPD) est requis pour enregistrer votre objectif, vos
            préférences et vos cibles nutritionnelles. Vos données physiques restent sur cet appareil.{' '}
            <button type="button" className="rost-link-btn" onClick={() => setActiveTab('confidentialite')}>
              Gérer mon consentement
            </button>
          </div>
        )}
        {user && (
          <div className="rost-profil-account">
            {isAdmin && <span className="rost-chip">Compte actif</span>}
            {pwdResetSent
              ? <span className="rost-profil-ok">✓ Email de réinitialisation envoyé</span>
              : <button className="rost-btn" disabled={pwdResetLoading} onClick={async () => {
                  if (!user?.email) return; setPwdResetLoading(true);
                  try { await requestPasswordReset(user.email); } catch { /* generic */ }
                  setPwdResetLoading(false); setPwdResetSent(true);
                }}>{pwdResetLoading ? '…' : 'Réinitialiser le mot de passe par email'}</button>}
          </div>
        )}

        <div className="rost-tabbar">
          {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((t) => (
            <button key={t} className={`rost-tab ${activeTab === t ? 'is-active' : ''}`} onClick={() => setActiveTab(t)}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        <div className="rost-profil-grid">
          {/* ══ PROFIL ══ */}
          {activeTab === 'profil' && (
            <div className="rost-binder rost-grid-full">
              <nav className="rost-binder-nav" aria-label="Sections du profil">
                {PROFIL_SECTIONS.map((s) => (
                  <button key={s.id} type="button"
                    className={`rost-binder-tab ${profilSection === s.id ? 'is-active' : ''}`}
                    aria-current={profilSection === s.id}
                    onClick={() => setProfilSection(s.id)}>{s.label}</button>
                ))}
              </nav>
              <div className="rost-binder-panel">
                {profilSection === 'physique' && (
                  <article className="rost-card">
                    <div className="rost-card-head">
                      <span className="rost-card-title">Données physiques</span>
                    </div>
                    <p className="rost-card-intro">
                      📱 Conservées <strong>sur cet appareil</strong> uniquement : le calcul se fait ici et seules
                      vos cibles (calories, macros) sont envoyées pour générer vos menus.
                    </p>
              {loading ? <div className="rost-skel" style={{ height: 120 }} />
                : !profile ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingProfile(true); setProfileErr('');
                    try { setProfile(await createProfile({ height_cm: fd.get('height_cm') ? Number(fd.get('height_cm')) : null, weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null, target_weight_kg: fd.get('target_weight_kg') ? Number(fd.get('target_weight_kg')) : null, biological_sex: fd.get('biological_sex') || null, date_of_birth: fd.get('date_of_birth') || null })); }
                    catch (err: unknown) { setProfileErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingProfile(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Taille (cm)</span><input className="rost-form-input" name="height_cm" type="number" min="100" max="250" placeholder="178" /></label>
                      <label className="rost-form-group"><span>Poids (kg)</span><input className="rost-form-input" name="weight_kg" type="number" min="30" max="300" step="0.1" placeholder="75" /></label>
                      <label className="rost-form-group"><span>Poids cible (kg)</span><input className="rost-form-input" name="target_weight_kg" type="number" min="30" max="300" step="0.1" placeholder="70" /></label>
                      <label className="rost-form-group"><span>Sexe biologique</span><select className="rost-form-select" name="biological_sex"><option value="">— choisir —</option><option value="male">Masculin</option><option value="female">Féminin</option><option value="other">Autre</option></select></label>
                      <label className="rost-form-group"><span>Date de naissance</span><input className="rost-form-input" name="date_of_birth" type="date" /></label>
                    </div>
                    {profileErr && <p className="rost-error">{profileErr}</p>}
                    <button className="rost-add-btn" type="submit" disabled={savingProfile}>{savingProfile ? 'Enregistrement…' : 'Créer mon profil'}</button>
                  </form>
                ) : editingProfile ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingProfile(true); setProfileErr('');
                    try { setProfile(await updateProfile({ height_cm: fd.get('height_cm') ? Number(fd.get('height_cm')) : null, weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null, target_weight_kg: fd.get('target_weight_kg') ? Number(fd.get('target_weight_kg')) : null, biological_sex: fd.get('biological_sex') || null, date_of_birth: fd.get('date_of_birth') || null })); setEditingProfile(false); }
                    catch (err: unknown) { setProfileErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingProfile(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Taille (cm)</span><input className="rost-form-input" name="height_cm" type="number" min="100" max="250" defaultValue={profile.height_cm ?? ''} /></label>
                      <label className="rost-form-group"><span>Poids (kg)</span><input className="rost-form-input" name="weight_kg" type="number" min="30" max="300" step="0.1" defaultValue={profile.weight_kg ?? ''} /></label>
                      <label className="rost-form-group"><span>Poids cible (kg)</span><input className="rost-form-input" name="target_weight_kg" type="number" min="30" max="300" step="0.1" defaultValue={profile.target_weight_kg ?? ''} /></label>
                      <label className="rost-form-group"><span>Sexe biologique</span><select className="rost-form-select" name="biological_sex" defaultValue={profile.biological_sex ?? ''}><option value="">— choisir —</option><option value="male">Masculin</option><option value="female">Féminin</option><option value="other">Autre</option></select></label>
                      <label className="rost-form-group"><span>Date de naissance</span><input className="rost-form-input" name="date_of_birth" type="date" defaultValue={profile.date_of_birth ? String(profile.date_of_birth) : ''} /></label>
                    </div>
                    {profileErr && <p className="rost-error">{profileErr}</p>}
                    <div className="rost-inline-actions"><button className="rost-add-btn" type="submit" disabled={savingProfile}>{savingProfile ? 'Enregistrement…' : 'Sauvegarder'}</button><button className="rost-btn rost-btn-ghost" type="button" onClick={() => { setEditingProfile(false); setProfileErr(''); }}>Annuler</button></div>
                  </form>
                ) : (
                  <>
                    <div className="rost-pstats">
                      <Stat label="Taille" value={fmt(profile.height_cm)} unit={profile.height_cm ? ' cm' : ''} />
                      <Stat label="Poids" value={fmt(profile.weight_kg)} unit={profile.weight_kg ? ' kg' : ''} />
                      <Stat label="Objectif" value={fmt(profile.target_weight_kg)} unit={profile.target_weight_kg ? ' kg' : ''} />
                      <Stat label="Sexe" value={cap(profile.biological_sex)} />
                      <Stat label="Naissance" value={fmtDate(profile.date_of_birth)} />
                    </div>
                    {canWriteProfile && <div className="rost-card-foot"><button className="rost-btn" onClick={() => setEditingProfile(true)}>Modifier</button></div>}
                  </>
                )}
                  </article>
                )}
                {profilSection === 'calculs' && (
                  <article className="rost-card">
                    <div className="rost-card-head"><span className="rost-card-title">Calculs métaboliques</span></div>
              {loading ? <div className="rost-skel" style={{ height: 120 }} />
                : !calcs ? <p className="rost-empty">Complétez votre profil pour obtenir les calculs</p>
                : (
                  <>
                    <div className="rost-pstats">
                      <div className="rost-pstat">
                        <span className="rost-pstat-label">IMC</span>
                        <span className="rost-pstat-val">{calcs.bmi.toFixed(1)}</span>
                        <BmiGauge bmi={calcs.bmi} category={calcs.bmi_category} />
                      </div>
                      <Stat label="MB (BMR)" value={calcs.bmr_kcal} unit=" kcal" />
                      <Stat label="TDEE" value={calcs.tdee_kcal} unit=" kcal" />
                      <Stat label="PAL" value={calcs.pal.toFixed(2)} />
                      <Stat label="Poids idéal min" value={calcs.ideal_weight_min_kg.toFixed(1)} unit=" kg" />
                      <Stat label="Poids idéal max" value={calcs.ideal_weight_max_kg.toFixed(1)} unit=" kg" />
                      {calcs.target_calories_kcal != null && (
                        <Stat
                          label="Cible énergétique"
                          value={calcs.target_calories_kcal}
                          unit=" kcal"
                          cat={calcs.energy_adjustment_pct === 0
                            ? 'maintien'
                            : `${calcs.energy_adjustment_pct > 0 ? '+' : ''}${calcs.energy_adjustment_pct}% vs TDEE`}
                        />
                      )}
                    </div>
                    {calcs.macros && (
                      <div className="rost-pmacros">
                        <div className="rost-pmacro"><span>{calcs.macros.proteins_g}</span><em>Protéines g/j</em></div>
                        <div className="rost-pmacro"><span>{calcs.macros.carbs_g}</span><em>Glucides g/j</em></div>
                        <div className="rost-pmacro"><span>{calcs.macros.fats_g}</span><em>Lipides g/j</em></div>
                      </div>
                    )}
                    {calcs.explanation && (
                      <p className="rost-explain">{calcs.explanation}</p>
                    )}
                  </>
                )}
                  </article>
                )}
              </div>
            </div>
          )}

          {/* ══ ACTIVITÉ ══ */}
          {activeTab === 'activite' && (
            <div className="rost-binder rost-grid-full">
              <nav className="rost-binder-nav" aria-label="Sections de l'activité">
                {ACTIVITE_SECTIONS.map((s) => (
                  <button key={s.id} type="button"
                    className={`rost-binder-tab ${activiteSection === s.id ? 'is-active' : ''}`}
                    aria-current={activiteSection === s.id}
                    onClick={() => setActiviteSection(s.id)}>{s.label}</button>
                ))}
              </nav>
              <div className="rost-binder-panel">
                {activiteSection === 'sportif' && (
                  <article className="rost-card">
                    <div className="rost-card-head">
                      <span className="rost-card-title">Profil sportif</span>
                    </div>
              {loading ? <div className="rost-skel" style={{ height: 120 }} />
                : !sports ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingSports(true); setSportsErr('');
                    try { setSports(await upsertSports({ sports: newSportsList, practice_level: fd.get('practice_level') || 'beginner', sessions_per_week: fd.get('sessions_per_week') ? Number(fd.get('sessions_per_week')) : 0, avg_session_duration_min: fd.get('avg_session_duration_min') ? Number(fd.get('avg_session_duration_min')) : 0, avg_intensity_rpe: 5 })); }
                    catch (err: unknown) { setSportsErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingSports(false);
                  }}>
                    <div className="rost-form-group rost-grid-full">
                      <span>Sports pratiqués</span>
                      <div className="rost-tag-input">
                        <input className="rost-form-input" type="text" value={newSportsInput} onChange={(e) => setNewSportsInput(e.target.value)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ',') && newSportsInput.trim()) { e.preventDefault(); const s = newSportsInput.trim(); if (!newSportsList.includes(s)) setNewSportsList((p) => [...p, s]); setNewSportsInput(''); } }} placeholder="Ex : course à pied… (Entrée)" />
                        <button type="button" className="rost-add-btn" onClick={() => { const s = newSportsInput.trim(); if (s && !newSportsList.includes(s)) setNewSportsList((p) => [...p, s]); setNewSportsInput(''); }} disabled={!newSportsInput.trim()}>+</button>
                      </div>
                      {newSportsList.length > 0 && <div className="rost-chips" style={{ marginTop: 8 }}>{newSportsList.map((s) => <span key={s} className="rost-chip" style={{ cursor: 'pointer' }} onClick={() => setNewSportsList((p) => p.filter((x) => x !== s))}>{s} ✕</span>)}</div>}
                    </div>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Niveau</span><select className="rost-form-select" name="practice_level"><option value="beginner">Débutant</option><option value="intermediate">Intermédiaire</option><option value="advanced">Avancé</option><option value="competitive">Compétiteur</option></select></label>
                      <label className="rost-form-group"><span>Sessions / sem.</span><input className="rost-form-input" name="sessions_per_week" type="number" min="0" max="21" placeholder="3" /></label>
                      <label className="rost-form-group"><span>Durée moy. (min)</span><input className="rost-form-input" name="avg_session_duration_min" type="number" min="0" max="300" placeholder="60" /></label>
                    </div>
                    {sportsErr && <p className="rost-error">{sportsErr}</p>}
                    <button className="rost-add-btn" type="submit" disabled={savingSports}>{savingSports ? 'Enregistrement…' : 'Créer mon profil sportif'}</button>
                  </form>
                ) : editingSports ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingSports(true); setSportsErr('');
                    try { setSports(await upsertSports({ sports: editSportsList, practice_level: fd.get('practice_level') || sports.practice_level, sessions_per_week: fd.get('sessions_per_week') ? Number(fd.get('sessions_per_week')) : sports.sessions_per_week, avg_session_duration_min: fd.get('avg_session_duration_min') ? Number(fd.get('avg_session_duration_min')) : sports.avg_session_duration_min, avg_intensity_rpe: sports.avg_intensity_rpe })); setEditingSports(false); }
                    catch (err: unknown) { setSportsErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingSports(false);
                  }}>
                    <div className="rost-form-group rost-grid-full">
                      <span>Sports pratiqués</span>
                      <div className="rost-tag-input">
                        <input className="rost-form-input" type="text" value={editSportsInput} onChange={(e) => setEditSportsInput(e.target.value)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ',') && editSportsInput.trim()) { e.preventDefault(); const s = editSportsInput.trim(); if (!editSportsList.includes(s)) setEditSportsList((p) => [...p, s]); setEditSportsInput(''); } }} placeholder="Ex : course à pied… (Entrée)" />
                        <button type="button" className="rost-add-btn" onClick={() => { const s = editSportsInput.trim(); if (s && !editSportsList.includes(s)) setEditSportsList((p) => [...p, s]); setEditSportsInput(''); }} disabled={!editSportsInput.trim()}>+</button>
                      </div>
                      {editSportsList.length > 0 && <div className="rost-chips" style={{ marginTop: 8 }}>{editSportsList.map((s) => <span key={s} className="rost-chip" style={{ cursor: 'pointer' }} onClick={() => setEditSportsList((p) => p.filter((x) => x !== s))}>{s} ✕</span>)}</div>}
                    </div>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Niveau</span><select className="rost-form-select" name="practice_level" defaultValue={sports.practice_level}><option value="beginner">Débutant</option><option value="intermediate">Intermédiaire</option><option value="advanced">Avancé</option><option value="competitive">Compétiteur</option></select></label>
                      <label className="rost-form-group"><span>Sessions / sem.</span><input className="rost-form-input" name="sessions_per_week" type="number" min="0" max="21" defaultValue={sports.sessions_per_week} /></label>
                      <label className="rost-form-group"><span>Durée moy. (min)</span><input className="rost-form-input" name="avg_session_duration_min" type="number" min="0" max="300" defaultValue={sports.avg_session_duration_min} /></label>
                    </div>
                    {sportsErr && <p className="rost-error">{sportsErr}</p>}
                    <div className="rost-inline-actions"><button className="rost-add-btn" type="submit" disabled={savingSports}>{savingSports ? 'Enregistrement…' : 'Sauvegarder'}</button><button className="rost-btn rost-btn-ghost" type="button" onClick={() => { setEditingSports(false); setSportsErr(''); }}>Annuler</button></div>
                  </form>
                ) : (
                  <>
                    <div className="rost-pstats">
                      <Stat label="Niveau" value={cap(sports.practice_level)} />
                      <Stat label="Sessions/sem." value={sports.sessions_per_week} />
                      <Stat label="Durée moy." value={sports.avg_session_duration_min} unit=" min" />
                    </div>
                    {sports.sports.length > 0 && <div className="rost-chips">{sports.sports.map((s) => <span key={s} className="rost-chip rost-chip-ghost">{cap(s)}</span>)}</div>}
                    {canWriteProfile && <div className="rost-card-foot"><button className="rost-btn" onClick={() => { setEditSportsList(sports.sports); setEditingSports(true); }}>Modifier</button></div>}
                  </>
                )}
                  </article>
                )}
                {activiteSection === 'modedevie' && (
                  <article className="rost-card">
                    <div className="rost-card-head">
                      <span className="rost-card-title">Activité quotidienne</span>
                    </div>
              {loading ? <div className="rost-skel" style={{ height: 120 }} />
                : !lifestyle ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingLifestyle(true); setLifestyleErr('');
                    try { setLifestyle(await upsertLifestyle({ profession_activity_level: fd.get('profession_activity_level') || 'sedentary', sedentary_hours_per_day: fd.get('sedentary_hours_per_day') ? Number(fd.get('sedentary_hours_per_day')) : null })); }
                    catch (err: unknown) { setLifestyleErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingLifestyle(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Activité prof.</span><select className="rost-form-select" name="profession_activity_level"><option value="sedentary">Sédentaire</option><option value="light">Légère</option><option value="moderate">Modérée</option><option value="heavy">Intense</option><option value="very_heavy">Très intense</option></select></label>
                      <label className="rost-form-group"><span>Heures assis / jour</span><input className="rost-form-input" name="sedentary_hours_per_day" type="number" min="0" max="24" step="0.5" placeholder="8" /></label>
                    </div>
                    {lifestyleErr && <p className="rost-error">{lifestyleErr}</p>}
                    <button className="rost-add-btn" type="submit" disabled={savingLifestyle}>{savingLifestyle ? 'Enregistrement…' : 'Enregistrer mon activité'}</button>
                  </form>
                ) : editingLifestyle ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingLifestyle(true); setLifestyleErr('');
                    try { setLifestyle(await upsertLifestyle({ profession_activity_level: fd.get('profession_activity_level') || lifestyle.profession_activity_level, sedentary_hours_per_day: fd.get('sedentary_hours_per_day') ? Number(fd.get('sedentary_hours_per_day')) : null })); setEditingLifestyle(false); }
                    catch (err: unknown) { setLifestyleErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingLifestyle(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Activité prof.</span><select className="rost-form-select" name="profession_activity_level" defaultValue={lifestyle.profession_activity_level ?? ''}><option value="sedentary">Sédentaire</option><option value="light">Légère</option><option value="moderate">Modérée</option><option value="heavy">Intense</option><option value="very_heavy">Très intense</option></select></label>
                      <label className="rost-form-group"><span>Heures assis / jour</span><input className="rost-form-input" name="sedentary_hours_per_day" type="number" min="0" max="24" step="0.5" defaultValue={lifestyle.sedentary_hours_per_day ?? ''} /></label>
                    </div>
                    {lifestyleErr && <p className="rost-error">{lifestyleErr}</p>}
                    <div className="rost-inline-actions"><button className="rost-add-btn" type="submit" disabled={savingLifestyle}>{savingLifestyle ? 'Enregistrement…' : 'Sauvegarder'}</button><button className="rost-btn rost-btn-ghost" type="button" onClick={() => { setEditingLifestyle(false); setLifestyleErr(''); }}>Annuler</button></div>
                  </form>
                ) : (
                  <>
                    <div className="rost-pstats">
                      <Stat label="Activité prof." value={cap(lifestyle.profession_activity_level)} />
                      <Stat label="Heures assis" value={fmt(lifestyle.sedentary_hours_per_day)} unit={lifestyle.sedentary_hours_per_day != null ? ' h/j' : ''} />
                    </div>
                    {canWriteProfile && <div className="rost-card-foot"><button className="rost-btn" onClick={() => setEditingLifestyle(true)}>Modifier</button></div>}
                  </>
                )}
                  </article>
                )}
              </div>
            </div>
          )}

          {/* ══ NUTRITION ══ */}
          {activeTab === 'nutrition' && (
            <div className="rost-binder rost-grid-full">
              <nav className="rost-binder-nav" aria-label="Sections de la nutrition">
                {NUTRITION_SECTIONS.map((s) => (
                  <button key={s.id} type="button"
                    className={`rost-binder-tab ${nutritionSection === s.id ? 'is-active' : ''}`}
                    aria-current={nutritionSection === s.id}
                    onClick={() => setNutritionSection(s.id)}>{s.label}</button>
                ))}
              </nav>
              <div className="rost-binder-panel">
                {nutritionSection === 'preferences' && (
                  <article className="rost-card">
                    <div className="rost-card-head">
                      <span className="rost-card-title">Préférences nutritionnelles</span>
                    </div>
              {loading ? <div className="rost-skel" style={{ height: 120 }} />
                : !nutrition ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingNutrition(true); setNutritionErr('');
                    try { setNutrition(await upsertNutrition({ diet_type: fd.get('diet_type') || 'omnivore', main_goal: fd.get('main_goal') || 'maintenance', meals_per_day: fd.get('meals_per_day') ? Number(fd.get('meals_per_day')) : 3, snacks_per_day: fd.get('snacks_per_day') ? Number(fd.get('snacks_per_day')) : 0, practices_if: fd.get('practices_if') === 'true', fasting_window_hours: fd.get('fasting_window_hours') ? Number(fd.get('fasting_window_hours')) : null, cooking_level: fd.get('cooking_level') || 'intermediate', budget_per_day_eur: fd.get('budget_per_day_eur') ? Number(fd.get('budget_per_day_eur')) : null })); }
                    catch (err: unknown) { setNutritionErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingNutrition(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Régime</span><select className="rost-form-select" name="diet_type"><option value="omnivore">Omnivore</option><option value="vegetarian">Végétarien</option><option value="vegan">Vegan</option><option value="pescatarian">Pescatarien</option><option value="keto">Keto</option><option value="halal">Halal</option><option value="kosher">Kasher</option><option value="no_pork">Sans porc</option><option value="other">Autre</option></select></label>
                      <label className="rost-form-group"><span>Objectif</span><select className="rost-form-select" name="main_goal"><option value="weight_loss">Perte de poids</option><option value="muscle_gain">Prise de masse</option><option value="body_recomposition">Recomposition</option><option value="sports_performance">Performance</option><option value="maintenance">Maintien</option></select></label>
                      <label className="rost-form-group"><span>Repas / jour</span><input className="rost-form-input" name="meals_per_day" type="number" min="1" max="10" placeholder="3" /></label>
                      <label className="rost-form-group"><span>Collations / jour</span><input className="rost-form-input" name="snacks_per_day" type="number" min="0" max="6" placeholder="1" /></label>
                      <label className="rost-form-group"><span>Niveau cuisine</span><select className="rost-form-select" name="cooking_level"><option value="beginner">Débutant</option><option value="intermediate">Intermédiaire</option><option value="advanced">Expert</option></select></label>
                      <label className="rost-form-group"><span>Jeûne IF</span><select className="rost-form-select" name="practices_if"><option value="false">Non</option><option value="true">Oui</option></select></label>
                      <label className="rost-form-group"><span>Fenêtre jeûne (h)</span><input className="rost-form-input" name="fasting_window_hours" type="number" min="8" max="24" placeholder="16" /></label>
                      <label className="rost-form-group"><span>Budget / jour (€)</span><input className="rost-form-input" name="budget_per_day_eur" type="number" min="0" max="100" step="0.5" placeholder="15" /></label>
                    </div>
                    {nutritionErr && <p className="rost-error">{nutritionErr}</p>}
                    <button className="rost-add-btn" type="submit" disabled={savingNutrition}>{savingNutrition ? 'Enregistrement…' : 'Créer mes préférences'}</button>
                  </form>
                ) : editingNutrition ? (
                  <form className="rost-form" onSubmit={async (e) => {
                    e.preventDefault(); const fd = new FormData(e.currentTarget); setSavingNutrition(true); setNutritionErr('');
                    try { setNutrition(await upsertNutrition({ diet_type: fd.get('diet_type') || nutrition.diet_type, main_goal: fd.get('main_goal') || nutrition.main_goal, meals_per_day: fd.get('meals_per_day') ? Number(fd.get('meals_per_day')) : nutrition.meals_per_day, snacks_per_day: fd.get('snacks_per_day') ? Number(fd.get('snacks_per_day')) : nutrition.snacks_per_day, practices_if: fd.get('practices_if') === 'true', fasting_window_hours: fd.get('fasting_window_hours') ? Number(fd.get('fasting_window_hours')) : nutrition.fasting_window_hours, cooking_level: fd.get('cooking_level') || nutrition.cooking_level, budget_per_day_eur: fd.get('budget_per_day_eur') ? Number(fd.get('budget_per_day_eur')) : nutrition.budget_per_day_eur })); setEditingNutrition(false); }
                    catch (err: unknown) { setNutritionErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); } setSavingNutrition(false);
                  }}>
                    <div className="rost-form-grid">
                      <label className="rost-form-group"><span>Régime</span><select className="rost-form-select" name="diet_type" defaultValue={nutrition.diet_type}><option value="omnivore">Omnivore</option><option value="vegetarian">Végétarien</option><option value="vegan">Vegan</option><option value="pescatarian">Pescatarien</option><option value="keto">Keto</option><option value="halal">Halal</option><option value="kosher">Kasher</option><option value="no_pork">Sans porc</option><option value="other">Autre</option></select></label>
                      <label className="rost-form-group"><span>Objectif</span><select className="rost-form-select" name="main_goal" defaultValue={nutrition.main_goal}><option value="weight_loss">Perte de poids</option><option value="muscle_gain">Prise de masse</option><option value="body_recomposition">Recomposition</option><option value="sports_performance">Performance</option><option value="maintenance">Maintien</option></select></label>
                      <label className="rost-form-group"><span>Repas / jour</span><input className="rost-form-input" name="meals_per_day" type="number" min="1" max="10" defaultValue={nutrition.meals_per_day ?? ''} /></label>
                      <label className="rost-form-group"><span>Collations / jour</span><input className="rost-form-input" name="snacks_per_day" type="number" min="0" max="6" defaultValue={nutrition.snacks_per_day ?? ''} /></label>
                      <label className="rost-form-group"><span>Niveau cuisine</span><select className="rost-form-select" name="cooking_level" defaultValue={nutrition.cooking_level ?? ''}><option value="beginner">Débutant</option><option value="intermediate">Intermédiaire</option><option value="advanced">Expert</option></select></label>
                      <label className="rost-form-group"><span>Jeûne IF</span><select className="rost-form-select" name="practices_if" defaultValue={nutrition.practices_if ? 'true' : 'false'}><option value="false">Non</option><option value="true">Oui</option></select></label>
                      <label className="rost-form-group"><span>Fenêtre jeûne (h)</span><input className="rost-form-input" name="fasting_window_hours" type="number" min="8" max="24" defaultValue={nutrition.fasting_window_hours ?? ''} /></label>
                      <label className="rost-form-group"><span>Budget / jour (€)</span><input className="rost-form-input" name="budget_per_day_eur" type="number" min="0" max="100" step="0.5" defaultValue={nutrition.budget_per_day_eur ?? ''} /></label>
                    </div>
                    {nutritionErr && <p className="rost-error">{nutritionErr}</p>}
                    <div className="rost-inline-actions"><button className="rost-add-btn" type="submit" disabled={savingNutrition}>{savingNutrition ? 'Enregistrement…' : 'Sauvegarder'}</button><button className="rost-btn rost-btn-ghost" type="button" onClick={() => { setEditingNutrition(false); setNutritionErr(''); }}>Annuler</button></div>
                  </form>
                ) : (
                  <>
                    <div className="rost-pstats">
                      <Stat label="Régime" value={cap(nutrition.diet_type)} />
                      <Stat label="Objectif" value={cap(nutrition.main_goal)} />
                      <Stat label="Repas/jour" value={fmt(nutrition.meals_per_day)} />
                      <Stat label="Collations" value={fmt(nutrition.snacks_per_day)} />
                      {nutrition.budget_per_day_eur != null && <Stat label="Budget/jour" value={nutrition.budget_per_day_eur} unit=" €" />}
                      <Stat label="Jeûne IF" value={nutrition.practices_if ? `Oui${nutrition.fasting_window_hours ? ` (${nutrition.fasting_window_hours}h)` : ''}` : 'Non'} />
                      <Stat label="Cuisine" value={cap(nutrition.cooking_level)} />
                    </div>
                    {canWriteProfile && <div className="rost-card-foot"><button className="rost-btn" onClick={() => setEditingNutrition(true)}>Modifier</button></div>}
                  </>
                )}
                  </article>
                )}
                {nutritionSection === 'exclus' && (
                  <article className="rost-card">
                    <div className="rost-card-head">
                      <span className="rost-card-title">Aliments exclus</span>
                      <button className="rost-btn" onClick={() => setShowAddExcluded((v) => !v)}>{showAddExcluded ? '✕' : '+ Ajouter'}</button>
                    </div>
              <p className="rost-card-intro">
                Aliments et allergènes à écarter de vos recettes et menus (ex : arachide, gluten, lactose).
                Cliquez sur un aliment pour le retirer.
              </p>
              {showAddExcluded && <ExcludedFoodForm onAdd={async () => { setExcluded(await getExcludedFoods()); setShowAddExcluded(false); }} onCancel={() => setShowAddExcluded(false)} addFn={addExcludedFood} />}
              {!loading && excluded.length === 0 && !showAddExcluded ? <p className="rost-empty">Aucun aliment exclu</p>
                : <div className="rost-chips">{excluded.map((f) => <span key={f.id} className="rost-chip rost-chip-red" style={{ cursor: 'pointer' }} onClick={async () => { await deleteExcludedFood(f.slug); setExcluded((p) => p.filter((x) => x.id !== f.id)); }}>{f.food_name} ✕</span>)}</div>}
                  </article>
                )}
                {nutritionSection === 'regles' && (
                  <article className="rost-card">
                    <div className="rost-card-head"><span className="rost-card-title">Règles nutritionnelles</span></div>
              <p className="rost-card-intro">
                Ces réglages pilotent la façon dont l’algorithme <strong>trie les recettes</strong> (page Recettes)
                et <strong>génère vos menus</strong> de la semaine, à partir de vos cibles caloriques et protéiques.
              </p>

              {/* Rappel du calcul métabolique (cf. onglet Profil → Calculs métaboliques). */}
              {calcs && (calcs.target_calories_kcal != null || calcs.macros) && (
                <div className="rost-metabo-recall">
                  <span className="rost-metabo-recall-head">Rappel — votre cible métabolique</span>
                  <div className="rost-metabo-recall-stats">
                    <div>
                      <span>{calcs.target_calories_kcal ?? calcs.tdee_kcal}</span>
                      <em>kcal / jour{calcs.energy_adjustment_pct ? ` · ${calcs.energy_adjustment_pct > 0 ? '+' : ''}${calcs.energy_adjustment_pct}% vs TDEE` : ''}</em>
                    </div>
                    {calcs.macros && <div><span>{calcs.macros.proteins_g}</span><em>g protéines</em></div>}
                    {calcs.macros && <div><span>{calcs.macros.carbs_g}</span><em>g glucides</em></div>}
                    {calcs.macros && <div><span>{calcs.macros.fats_g}</span><em>g lipides</em></div>}
                  </div>
                  {calcs.explanation && <p className="rost-metabo-recall-text">{calcs.explanation}</p>}
                </div>
              )}

              <div className="rost-rules-bar">
                <div className="rost-rules-text">
                  <span className="rost-rules-title">Activer les règles</span>
                  <span className="rost-rules-sub">Quand c’est activé, vos recettes et menus sont triés selon les leviers ci-dessous.</span>
                </div>
                {profile
                  ? <Toggle on={profile.nutrition_rules_enabled} disabled={savingRules} onChange={toggleRules} />
                  : <span className="rost-empty">Créez d’abord votre profil.</span>}
              </div>

              {profile?.nutrition_rules_enabled && (
                nutrition ? (
                  <div className="rost-rules-fields">
                    <div className="rost-rule-field">
                      <div className="rost-rule-field-head">
                        <span className="rost-adjust-label">Variété · ±{rulesVariety}%</span>
                        <input type="range" min={5} max={30} step={1} className="rost-adjust-slider"
                          value={rulesVariety}
                          onChange={(e) => setRulesVariety(Number(e.target.value))}
                          onMouseUp={() => saveRules({ rules_variety_pct: rulesVariety / 100 })}
                          onTouchEnd={() => saveRules({ rules_variety_pct: rulesVariety / 100 })}
                          onBlur={() => saveRules({ rules_variety_pct: rulesVariety / 100 })} />
                      </div>
                      <p className="rost-rule-help">
                        Marge d’aléatoire autour de vos cibles pour éviter de toujours revoir les mêmes recettes.
                        Plus le pourcentage est élevé, plus les suggestions sont variées (mais moins strictes sur les cibles).
                      </p>
                    </div>

                    <div className="rost-rule-field">
                      <div className="rost-rule-field-head">
                        <span className="rost-adjust-label">Calories cibles <em className="rost-rule-unit">/ jour</em></span>
                        <input type="number" min={0} placeholder="auto (TDEE)" className="rost-adjust-input"
                          defaultValue={nutrition.rules_override_calories ?? ''}
                          onBlur={(e) => saveRules({ rules_override_calories: e.target.value ? Number(e.target.value) : null })} />
                      </div>
                      <p className="rost-rule-help">
                        Cible <strong>par jour</strong> (et par personne). Remplace la dépense énergétique calculée (TDEE).
                        Laissez vide pour utiliser la valeur automatique.
                      </p>
                    </div>

                    <div className="rost-rule-field">
                      <div className="rost-rule-field-head">
                        <span className="rost-adjust-label">Protéines cibles <em className="rost-rule-unit">g / jour</em></span>
                        <input type="number" min={0} placeholder="auto" className="rost-adjust-input"
                          defaultValue={nutrition.rules_override_proteines ?? ''}
                          onBlur={(e) => saveRules({ rules_override_proteines: e.target.value ? Number(e.target.value) : null })} />
                      </div>
                      <p className="rost-rule-help">
                        Cible <strong>par jour</strong> (et par personne), en grammes. Laissez vide pour la cible automatique
                        déduite de votre profil.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rost-empty rost-empty-block">Renseignez vos préférences nutritionnelles (onglet Nutrition) pour régler vos cibles.</div>
                )
              )}
                  </article>
                )}
              </div>
            </div>
          )}

          {/* ══ MON GESTIONNAIRE ══ */}
          {activeTab === 'coach' && (
            <article className="rost-card rost-grid-full">
              <div className="rost-card-head"><span className="rost-card-title">Mon gestionnaire</span></div>
              <p className="rost-card-intro">
                Si un gestionnaire suit votre compte, il apparaît ici. Vous restez <strong>propriétaire</strong>
                {' '}de vos données et pouvez <strong>couper le lien</strong> quand vous le souhaitez.
              </p>
              {coachLoading ? (
                <div className="rost-skel" style={{ height: 80 }} />
              ) : !coachInfo?.email ? (
                <p className="rost-empty">Aucun gestionnaire ne suit votre compte actuellement.</p>
              ) : (
                <div className="rost-member-list">
                  <div className="rost-member-row">
                    <div className="rost-member-id">
                      <span className="rost-member-avatar" aria-hidden="true">{initials(coachInfo.email)}</span>
                      <div className="rost-member-meta">
                        <span className="rost-member-email">{coachInfo.email}</span>
                        <span className="rost-member-substatus">Votre gestionnaire — il alimente vos recettes, votre menu et vos objectifs.</span>
                      </div>
                    </div>
                    <div className="rost-member-actions">
                      <button className="rost-btn rost-btn-danger" type="button" disabled={coachRevoking} onClick={revokeCoach}>
                        {coachRevoking ? '…' : 'Couper le lien'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {coachMsg && <p className="rost-auth-sub" style={{ marginTop: 12 }}>{coachMsg}</p>}
            </article>
          )}

          {/* ══ SÉCURITÉ ══ */}
          {activeTab === 'securite' && <>
            <article className="rost-card rost-grid-full">
              <div className="rost-card-head"><span className="rost-card-title">Changer le mot de passe</span></div>
              <div className="rost-form" style={{ maxWidth: 420 }}>
                <label className="rost-form-group"><span>Mot de passe actuel</span><input type="password" className="rost-form-input" value={pwdCurrent} onChange={(e) => { setPwdCurrent(e.target.value); setPwdErr(''); setPwdOk(false); }} autoComplete="current-password" /></label>
                <label className="rost-form-group"><span>Nouveau mot de passe</span><input type="password" className="rost-form-input" value={pwdNew} onChange={(e) => { setPwdNew(e.target.value); setPwdErr(''); setPwdOk(false); }} autoComplete="new-password" /></label>
                <label className="rost-form-group"><span>Confirmer</span><input type="password" className="rost-form-input" value={pwdConfirm} onChange={(e) => { setPwdConfirm(e.target.value); setPwdErr(''); setPwdOk(false); }} autoComplete="new-password" /></label>
                {pwdErr && <p className="rost-error">{pwdErr}</p>}
                {pwdOk && <p className="rost-profil-ok">✓ Mot de passe mis à jour.</p>}
                <button className="rost-add-btn" disabled={pwdSaving || !pwdCurrent || !pwdNew || !pwdConfirm} onClick={async () => {
                  if (pwdNew !== pwdConfirm) { setPwdErr('Les mots de passe ne correspondent pas.'); return; }
                  if (pwdNew.length < 8) { setPwdErr('Au moins 8 caractères.'); return; }
                  setPwdSaving(true); setPwdErr(''); setPwdOk(false);
                  try {
                    await changePassword(pwdCurrent, pwdNew);
                    setPwdOk(true); setPwdCurrent(''); setPwdNew(''); setPwdConfirm('');
                  }
                  catch (e: unknown) { setPwdErr(apiErrorMessage(e, 'Erreur lors du changement.')); }
                  setPwdSaving(false);
                }}>{pwdSaving ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
              </div>
            </article>

            <article className="rost-card rost-grid-full">
              <div className="rost-card-head"><span className="rost-card-title">2FA — Authentification à deux facteurs</span></div>
              {loading ? <div className="rost-skel" style={{ height: 60 }} />
                : (
                  <div className="rost-form">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span className="rost-pstat-label">Statut :</span>
                      <span className={`rost-chip ${mfaEnabled ? '' : 'rost-chip-ghost'}`}>{mfaEnabled ? '2FA activée (TOTP)' : '2FA désactivée'}</span>
                    </div>
                    {mfaEnabled ? (
                      <button className="rost-btn rost-btn-ghost" disabled={totpLoading} onClick={async () => {
                        setTotpLoading(true); setTotpErr('');
                        try { await disableMfa(); setMfaEnabled(false); setTotpDone(false); }
                        catch (e: unknown) { setTotpErr(apiErrorMessage(e, 'Erreur lors de la désactivation')); }
                        setTotpLoading(false);
                      }}>{totpLoading ? 'Désactivation…' : 'Désactiver la 2FA'}</button>
                    ) : !totpSetup ? (
                      <button className="rost-add-btn" disabled={totpLoading} onClick={async () => {
                        setTotpLoading(true); setTotpErr('');
                        try { setTotpSetup(await setupTotp()); }
                        catch (e: unknown) { setTotpErr(apiErrorMessage(e, 'Erreur lors de la configuration TOTP')); }
                        setTotpLoading(false);
                      }}>{totpLoading ? 'Génération…' : 'Activer la 2FA (TOTP)'}</button>
                    ) : totpDone ? (
                      <div className="rost-profil-ok">✓ 2FA activée avec succès</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
                        <p className="rost-rd-text">Scannez ce QR code avec votre app authenticator, puis entrez le code.</p>
                        <img src={`data:image/png;base64,${totpSetup.qr_code_base64}`} alt="QR code TOTP" style={{ width: 180, height: 180, imageRendering: 'pixelated', borderRadius: 8, border: '1px solid var(--rule)' }} />
                        <details style={{ fontSize: 11, color: 'var(--dim)' }}><summary style={{ cursor: 'pointer' }}>URI de provisionnement</summary><code style={{ wordBreak: 'break-all', display: 'block', marginTop: 6, fontSize: 10 }}>{totpSetup.provisioning_uri}</code></details>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input className="rost-form-input" type="text" inputMode="numeric" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} placeholder="Code 6 chiffres" style={{ letterSpacing: '0.2em', maxWidth: 160 }} />
                          <button className="rost-add-btn" disabled={totpLoading || totpCode.length !== 6} onClick={async () => {
                            setTotpLoading(true); setTotpErr('');
                            try { const tokens = await confirmTotp(totpCode); setSession(tokens.access_token); setMfaEnabled(true); setTotpSetup(null); setTotpCode(''); setTotpDone(true); }
                            catch (e: unknown) { setTotpErr(apiErrorMessage(e, 'Code invalide')); }
                            setTotpLoading(false);
                          }}>{totpLoading ? '…' : 'Confirmer'}</button>
                          <button className="rost-btn rost-btn-ghost" type="button" onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpErr(''); }}>Annuler</button>
                        </div>
                      </div>
                    )}
                    {totpErr && <p className="rost-error">{totpErr}</p>}
                  </div>
                )}
            </article>
          </>}

          {/* ══ CONFIDENTIALITÉ (RGPD) ══ */}
          {activeTab === 'confidentialite' && (() => {
            const healthRecord = consents?.find((c) => c.consent_type === 'health_data');
            return <>
              {/* Consentement santé (art. 9) */}
              <article className="rost-card rost-grid-full">
                <div className="rost-card-head"><span className="rost-card-title">Consentement — objectif et cibles nutritionnelles (art. 9)</span></div>
                <div className="rost-form">
                  <p className="rost-rd-text">
                    Votre objectif, vos préférences, vos aliments exclus et vos cibles nutritionnelles
                    peuvent révéler des informations liées à la santé : leur enregistrement nécessite
                    votre consentement explicite. Poids, taille, âge et sexe ne quittent jamais cet
                    appareil. Vous pouvez retirer ce consentement à tout moment ; les données déjà
                    enregistrées restent consultables et supprimables.{' '}
                    <a href="/confidentialite" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="rost-pstat-label">Statut :</span>
                    <span className={`rost-chip ${healthConsentGranted ? '' : 'rost-chip-ghost'}`}>
                      {healthConsentGranted ? 'Consentement actif' : 'Consentement non donné'}
                    </span>
                    {healthRecord && (
                      <span className="rost-pstat-label">
                        (dernière mise à jour : {new Date(healthRecord.created_at).toLocaleDateString('fr-FR')}, version {healthRecord.version})
                      </span>
                    )}
                  </div>
                  {healthConsentGranted ? (
                    <button className="rost-btn rost-btn-ghost" disabled={consentBusy} onClick={() => toggleHealthConsent(false)}>
                      {consentBusy ? '…' : 'Retirer mon consentement'}
                    </button>
                  ) : (
                    <button className="rost-add-btn" disabled={consentBusy} onClick={() => toggleHealthConsent(true)}>
                      {consentBusy ? '…' : 'Donner mon consentement'}
                    </button>
                  )}
                  {consentErr && <p className="rost-error">{consentErr}</p>}
                </div>
              </article>

              {/* Portabilité (art. 20) */}
              <article className="rost-card rost-grid-full">
                <div className="rost-card-head"><span className="rost-card-title">Exporter mes données (art. 20)</span></div>
                <div className="rost-form">
                  <p className="rost-rd-text">
                    Téléchargez l’ensemble de vos données personnelles conservées par nos services
                    (identité, profil nutritionnel, menus, notifications) dans un fichier JSON portable.
                    Vos données physiques, stockées sur cet appareil, n’en font pas partie.
                  </p>
                  <button className="rost-add-btn" disabled={exporting} onClick={downloadExport} style={{ maxWidth: 280 }}>
                    {exporting ? 'Préparation…' : 'Télécharger mes données (JSON)'}
                  </button>
                  {exportErr && <p className="rost-error">{exportErr}</p>}
                </div>
              </article>

              {/* Effacement (art. 17) */}
              <article className="rost-card rost-grid-full">
                <div className="rost-card-head"><span className="rost-card-title">Supprimer mon compte (art. 17)</span></div>
                <div className="rost-form" style={{ maxWidth: 480 }}>
                  <p className="rost-rd-text">
                    ⚠️ Cette action est <strong>irréversible</strong>. Votre compte et toutes vos
                    données (profil nutritionnel, menus, notifications) seront supprimés définitivement
                    et la suppression est <strong>propagée à tous les services</strong>. Pour
                    confirmer, saisissez <strong>SUPPRIMER</strong> ci-dessous.
                  </p>
                  <input className="rost-form-input" value={deleteText} placeholder="SUPPRIMER"
                    onChange={(e) => { setDeleteText(e.target.value); setDeleteErr(''); }} style={{ maxWidth: 240 }} />
                  <button className="rost-btn rost-btn-danger" disabled={deleting || deleteText !== 'SUPPRIMER'} onClick={deleteAccount}>
                    {deleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}
                  </button>
                  {deleteErr && <p className="rost-error">{deleteErr}</p>}
                </div>
              </article>
            </>;
          })()}
        </div>
      </div>
    </AuroraShell>
  );
}
