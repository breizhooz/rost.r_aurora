import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { useAuthContext } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiError';
import {
  getMe,
  getMyProfile,
  getCalculations,
  getSportsProfile,
  getLifestyle,
  getNutritionPreferences,
  getBodyComposition,
  getBodyMeasurements,
  getPerformanceMetrics,
  getInjuries,
  getAllergies,
  getExcludedFoods,
  getConditions,
  getMedications,
  createProfile,
  updateProfile,
  upsertSports,
  upsertLifestyle,
  upsertNutrition,
  addBodyComposition,
  deleteBodyComposition,
  addBodyMeasurements,
  deleteBodyMeasurements,
  addPerformanceMetric,
  deletePerformanceMetric,
  addInjury,
  deleteInjury,
  addAllergy,
  deleteAllergy,
  addCondition,
  deleteCondition,
  addMedication,
  deleteMedication,
  addExcludedFood,
  deleteExcludedFood,
  requestPasswordReset,
  changePassword,
  setupTotp,
  confirmTotp,
  disableMfa,
} from '../api/endpoints';
import type {
  UserOut,
  ProfileResponse,
  CalculationResponse,
  SportsProfileResponse,
  LifestyleProfileResponse,
  NutritionPreferencesResponse,
  BodyCompositionResponse,
  BodyMeasurementsResponse,
  PerformanceMetricResponse,
  InjuryResponse,
  FoodAllergyResponse,
  ExcludedFoodResponse,
  MedicalConditionResponse,
  MedicationResponse,
  TotpSetupResponse,
} from '../types';
import styles from './ProfilePage.module.css';

// ── Inline sub-forms ──────────────────────────────────────────────────────────

function InjuryForm({ onAdd, onCancel, addFn }: {
  onAdd: (slug: string) => void;
  onCancel: () => void;
  addFn: (body: Record<string, unknown>) => Promise<{ slug: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          const res = await addFn({
            body_part:   fd.get('body_part'),
            injury_type: fd.get('injury_type'),
            is_chronic:  fd.get('is_chronic') === 'true',
            is_current:  fd.get('is_current') === 'true',
            notes:       fd.get('notes') || null,
          });
          onAdd(res.slug);
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="body_part" placeholder="Partie du corps (ex: genou)" required />
          <input className={styles.inlineInput} name="injury_type" placeholder="Type (ex: tendinite)" required />
        </div>
        <div className={styles.inlineRow}>
          <select className={styles.inlineSelect} name="is_current">
            <option value="true">En cours</option>
            <option value="false">Résolue</option>
          </select>
          <select className={styles.inlineSelect} name="is_chronic">
            <option value="false">Aiguë</option>
            <option value="true">Chronique</option>
          </select>
          <input className={styles.inlineInput} name="notes" placeholder="Notes (optionnel)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function AllergyForm({ onAdd, onCancel, addFn }: {
  onAdd: () => void;
  onCancel: () => void;
  addFn: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          await addFn({ allergen: fd.get('allergen'), severity: fd.get('severity'), notes: fd.get('notes') || null });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="allergen" placeholder="Allergène (ex: gluten)" required />
          <select className={styles.inlineSelect} name="severity">
            <option value="intolerance">Intolérance</option>
            <option value="allergy">Allergie</option>
          </select>
          <input className={styles.inlineInput} name="notes" placeholder="Notes (optionnel)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function ConditionForm({ onAdd, onCancel, addFn }: {
  onAdd: () => void;
  onCancel: () => void;
  addFn: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          await addFn({
            condition_name: fd.get('condition_name'),
            category: fd.get('category'),
            is_current: fd.get('is_current') === 'true',
            notes: fd.get('notes') || null,
          });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="condition_name" placeholder="Nom de la condition" required />
          <select className={styles.inlineSelect} name="category">
            <option value="metabolic">Métabolique</option>
            <option value="digestive">Digestif</option>
            <option value="cardiovascular">Cardiovasculaire</option>
            <option value="hormonal">Hormonal</option>
            <option value="other">Autre</option>
          </select>
          <select className={styles.inlineSelect} name="is_current">
            <option value="true">En cours</option>
            <option value="false">Résolue</option>
          </select>
        </div>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="notes" placeholder="Notes (optionnel)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function MedicationForm({ onAdd, onCancel, addFn }: {
  onAdd: () => void;
  onCancel: () => void;
  addFn: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          await addFn({
            medication_name:     fd.get('medication_name'),
            impacts_metabolism:  fd.get('impacts_metabolism') === 'true',
            notes:               fd.get('notes') || null,
          });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="medication_name" placeholder="Nom du médicament" required />
          <select className={styles.inlineSelect} name="impacts_metabolism">
            <option value="false">Sans impact métabolique</option>
            <option value="true">Impact métabolique</option>
          </select>
          <input className={styles.inlineInput} name="notes" placeholder="Notes (optionnel)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function ExcludedFoodForm({ onAdd, onCancel, addFn }: {
  onAdd: () => void;
  onCancel: () => void;
  addFn: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          await addFn({ food_name: fd.get('food_name'), reason: fd.get('reason') || null });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="food_name" placeholder="Aliment (ex: lactose)" required />
          <input className={styles.inlineInput} name="reason" placeholder="Raison (optionnel)" />
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
      </form>
    </div>
  );
}

function BodyCompositionForm({ onAdd, onCancel }: {
  onAdd: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setLoading(true); setErr('');
        try {
          await addBodyComposition({
            measured_at:         fd.get('measured_at'),
            body_fat_percentage: fd.get('body_fat_percentage') ? Number(fd.get('body_fat_percentage')) : null,
            lean_mass_kg:        fd.get('lean_mass_kg')        ? Number(fd.get('lean_mass_kg'))        : null,
            bone_mass_kg:        fd.get('bone_mass_kg')        ? Number(fd.get('bone_mass_kg'))        : null,
            water_percentage:    fd.get('water_percentage')    ? Number(fd.get('water_percentage'))    : null,
          });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="measured_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          <input className={styles.inlineInput} name="body_fat_percentage" type="number" step="0.1" min="1" max="70" placeholder="% MG" />
          <input className={styles.inlineInput} name="lean_mass_kg" type="number" step="0.1" min="10" max="200" placeholder="Masse maigre (kg)" />
        </div>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="bone_mass_kg" type="number" step="0.1" min="0.5" max="20" placeholder="Masse osseuse (kg)" />
          <input className={styles.inlineInput} name="water_percentage" type="number" step="0.1" min="10" max="80" placeholder="% Eau" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function BodyMeasurementsForm({ onAdd, onCancel }: {
  onAdd: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const n = (k: string) => fd.get(k) ? Number(fd.get(k)) : null;
        setLoading(true); setErr('');
        try {
          await addBodyMeasurements({
            measured_at:    fd.get('measured_at'),
            waist_cm:       n('waist_cm'),
            hips_cm:        n('hips_cm'),
            chest_cm:       n('chest_cm'),
            shoulders_cm:   n('shoulders_cm'),
            left_arm_cm:    n('left_arm_cm'),
            right_arm_cm:   n('right_arm_cm'),
            left_thigh_cm:  n('left_thigh_cm'),
            right_thigh_cm: n('right_thigh_cm'),
          });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="measured_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          <input className={styles.inlineInput} name="waist_cm" type="number" step="0.1" min="40" max="200" placeholder="Tour de taille (cm)" />
          <input className={styles.inlineInput} name="hips_cm" type="number" step="0.1" min="40" max="200" placeholder="Hanches (cm)" />
          <input className={styles.inlineInput} name="chest_cm" type="number" step="0.1" min="40" max="200" placeholder="Poitrine (cm)" />
        </div>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="shoulders_cm" type="number" step="0.1" min="30" max="200" placeholder="Épaules (cm)" />
          <input className={styles.inlineInput} name="left_arm_cm" type="number" step="0.1" min="10" max="80" placeholder="Bras G (cm)" />
          <input className={styles.inlineInput} name="right_arm_cm" type="number" step="0.1" min="10" max="80" placeholder="Bras D (cm)" />
          <input className={styles.inlineInput} name="left_thigh_cm" type="number" step="0.1" min="20" max="120" placeholder="Cuisse G (cm)" />
          <input className={styles.inlineInput} name="right_thigh_cm" type="number" step="0.1" min="20" max="120" placeholder="Cuisse D (cm)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function PerformanceMetricForm({ onAdd, onCancel }: {
  onAdd: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className={styles.inlineForm}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const nf = (k: string) => fd.get(k) ? Number(fd.get(k)) : null;
        setLoading(true); setErr('');
        try {
          await addPerformanceMetric({
            measured_at:              fd.get('measured_at'),
            vo2max:                   nf('vo2max'),
            vma_kmh:                  nf('vma_kmh'),
            ftp_watts:                nf('ftp_watts'),
            one_rm_squat_kg:          nf('one_rm_squat_kg'),
            one_rm_bench_press_kg:    nf('one_rm_bench_press_kg'),
            one_rm_deadlift_kg:       nf('one_rm_deadlift_kg'),
            one_rm_overhead_press_kg: nf('one_rm_overhead_press_kg'),
          });
          onAdd();
        } catch (e2: unknown) { setErr(apiErrorMessage(e2, e2 instanceof Error ? e2.message : 'Erreur')); }
        setLoading(false);
      }}>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="measured_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          <input className={styles.inlineInput} name="vo2max" type="number" step="0.1" min="10" max="100" placeholder="VO₂max" />
          <input className={styles.inlineInput} name="vma_kmh" type="number" step="0.1" min="5" max="30" placeholder="VMA (km/h)" />
          <input className={styles.inlineInput} name="ftp_watts" type="number" min="50" max="600" placeholder="FTP (W)" />
        </div>
        <div className={styles.inlineRow}>
          <input className={styles.inlineInput} name="one_rm_squat_kg" type="number" step="0.5" min="10" max="500" placeholder="Squat 1RM (kg)" />
          <input className={styles.inlineInput} name="one_rm_bench_press_kg" type="number" step="0.5" min="10" max="400" placeholder="Bench 1RM (kg)" />
          <input className={styles.inlineInput} name="one_rm_deadlift_kg" type="number" step="0.5" min="10" max="600" placeholder="DL 1RM (kg)" />
          <input className={styles.inlineInput} name="one_rm_overhead_press_kg" type="number" step="0.5" min="10" max="300" placeholder="OHP 1RM (kg)" />
        </div>
        {err && <p className={styles.formErr}>{err}</p>}
        <div className={styles.inlineRow}>
          <button className={styles.inlineBtnAdd} type="submit" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
          <button className={styles.inlineBtnCancel} type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

function fmt(val: number | null | undefined, unit = ''): string {
  if (val == null) return '—';
  return `${val}${unit}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

type Tab = 'profil' | 'activite' | 'nutrition' | 'sante' | 'securite';
const TAB_LABELS: Record<Tab, string> = {
  profil:    'Profil',
  activite:  'Activité',
  nutrition: 'Nutrition',
  sante:     'Santé',
  securite:  'Sécurité',
};

export default function ProfilePage() {
  const { setSession } = useAuthContext();
  const [activeTab, setActiveTab] = useState<Tab>('profil');
  const [user,       setUser]       = useState<UserOut | null>(null);
  const [profile,    setProfile]    = useState<ProfileResponse | null>(null);
  const [calcs,      setCalcs]      = useState<CalculationResponse | null>(null);
  const [sports,     setSports]     = useState<SportsProfileResponse | null>(null);
  const [lifestyle,  setLifestyle]  = useState<LifestyleProfileResponse | null>(null);
  const [nutrition,  setNutrition]  = useState<NutritionPreferencesResponse | null>(null);
  const [compo,      setCompo]      = useState<BodyCompositionResponse[]>([]);
  const [measures,   setMeasures]   = useState<BodyMeasurementsResponse[]>([]);
  const [perf,       setPerf]       = useState<PerformanceMetricResponse[]>([]);
  const [injuries,    setInjuries]    = useState<InjuryResponse[]>([]);
  const [allergies,   setAllergies]   = useState<FoodAllergyResponse[]>([]);
  const [excluded,    setExcluded]    = useState<ExcludedFoodResponse[]>([]);
  const [conditions,  setConditions]  = useState<MedicalConditionResponse[]>([]);
  const [medications, setMedications] = useState<MedicationResponse[]>([]);

  const [loading, setLoading] = useState(true);

  // ── Sports tag input ──
  const [newSportsList,  setNewSportsList]  = useState<string[]>([]);
  const [newSportsInput, setNewSportsInput] = useState('');

  // ── Password reset (email) ──
  const [pwdResetSent,    setPwdResetSent]    = useState(false);
  const [pwdResetLoading, setPwdResetLoading] = useState(false);

  // ── Password change (authenticated form) ──
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew,     setPwdNew]     = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving,  setPwdSaving]  = useState(false);
  const [pwdErr,     setPwdErr]     = useState('');
  const [pwdOk,      setPwdOk]      = useState(false);

  // ── TOTP / 2FA ──
  const [totpSetup,    setTotpSetup]    = useState<TotpSetupResponse | null>(null);
  const [totpCode,     setTotpCode]     = useState('');
  const [totpLoading,  setTotpLoading]  = useState(false);
  const [totpErr,      setTotpErr]      = useState('');
  const [totpDone,     setTotpDone]     = useState(false);
  const [mfaEnabled,   setMfaEnabled]   = useState<boolean | null>(null);

  // ── Form saving states ──
  const [savingProfile,    setSavingProfile]    = useState(false);
  const [savingSports,     setSavingSports]     = useState(false);
  const [savingLifestyle,  setSavingLifestyle]  = useState(false);
  const [savingNutrition,  setSavingNutrition]  = useState(false);
  const [profileErr,       setProfileErr]       = useState('');
  const [sportsErr,        setSportsErr]        = useState('');
  const [lifestyleErr,     setLifestyleErr]     = useState('');
  const [nutritionErr,     setNutritionErr]     = useState('');

  // ── Add form toggles ──
  const [showAddInjury,    setShowAddInjury]    = useState(false);
  const [showAddAllergy,   setShowAddAllergy]   = useState(false);
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [showAddMedication,setShowAddMedication]= useState(false);
  const [showAddExcluded,  setShowAddExcluded]  = useState(false);
  const [showAddCompo,     setShowAddCompo]     = useState(false);
  const [showAddMeasures,  setShowAddMeasures]  = useState(false);
  const [showAddPerf,      setShowAddPerf]      = useState(false);

  // ── Edit mode toggles ──
  const [editingProfile,   setEditingProfile]   = useState(false);
  const [editingSports,    setEditingSports]    = useState(false);
  const [editingLifestyle, setEditingLifestyle] = useState(false);
  const [editingNutrition, setEditingNutrition] = useState(false);

  // ── Sports tag input (edit mode) ──
  const [editSportsList,  setEditSportsList]  = useState<string[]>([]);
  const [editSportsInput, setEditSportsInput] = useState('');

  useEffect(() => {
    Promise.all([
      getMe().then(u => { setUser(u); setMfaEnabled(u.two_factor_enabled); }),
      getMyProfile().then(setProfile),
      getCalculations().then(setCalcs),
      getSportsProfile().then(setSports),
      getLifestyle().then(setLifestyle),
      getNutritionPreferences().then(setNutrition),
      getBodyComposition().then(setCompo),
      getBodyMeasurements().then(setMeasures),
      getPerformanceMetrics().then(setPerf),
      getInjuries().then(setInjuries),
      getAllergies().then(setAllergies),
      getExcludedFoods().then(setExcluded),
      getConditions().then(setConditions),
      getMedications().then(setMedications),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <Layout userEmail={user?.email}>
      <main className={styles.main}>
        {/* ── Hero ── */}
        <div className={styles.hero}>
          {loading
            ? <Skeleton width="72px" height="72px" style={{ borderRadius: '50%' }} />
            : <div className={styles.heroAvatar}>{user ? initials(user.email) : '??'}</div>
          }
          <div className={styles.heroText}>
            {loading
              ? <><Skeleton height="28px" width="220px" style={{ marginBottom: 8 }} /><Skeleton height="14px" width="160px" /></>
              : <>
                  <h1>{user?.email?.split('@')[0] ?? '—'}</h1>
                  <p>{user?.email}</p>
                  {user?.is_active && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                      <div className={styles.heroStatus}>Compte actif</div>
                      {pwdResetSent ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontStyle: 'italic' }}>
                          ✓ Email de réinitialisation envoyé
                        </span>
                      ) : (
                        <button
                          className={styles.addBtn}
                          style={{ fontSize: '0.72rem' }}
                          disabled={pwdResetLoading}
                          onClick={async () => {
                            if (!user?.email) return;
                            setPwdResetLoading(true);
                            try { await requestPasswordReset(user.email); } catch { /* generic */ }
                            setPwdResetLoading(false);
                            setPwdResetSent(true);
                          }}
                        >
                          {pwdResetLoading ? '…' : 'Modifier mon mot de passe'}
                        </button>
                      )}
                    </div>
                  )}
                </>
            }
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className={styles.tabBar}>
          {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className={styles.grid}>

          {/* ══ PROFIL ══ */}
          {activeTab === 'profil' && <>

          {/* ── Profil de base ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Données physiques</div>
              {profile && !editingProfile && (
                <button className={styles.addBtn} onClick={() => setEditingProfile(true)}>Modifier</button>
              )}
            </div>
            {loading ? (
              <div className={styles.statGrid}>
                {[1,2,3,4].map(i => <Skeleton key={i} height="44px" />)}
              </div>
            ) : !profile ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingProfile(true); setProfileErr('');
                try {
                  const res = await createProfile({
                    height_cm:        fd.get('height_cm')        ? Number(fd.get('height_cm'))        : null,
                    weight_kg:        fd.get('weight_kg')        ? Number(fd.get('weight_kg'))        : null,
                    target_weight_kg: fd.get('target_weight_kg') ? Number(fd.get('target_weight_kg')) : null,
                    biological_sex:   fd.get('biological_sex') || null,
                    date_of_birth:    fd.get('date_of_birth')  || null,
                  });
                  setProfile(res);
                } catch (err: unknown) { setProfileErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingProfile(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Taille (cm)</label>
                    <input className={styles.formInput} name="height_cm" type="number" min="100" max="250" placeholder="178" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Poids (kg)</label>
                    <input className={styles.formInput} name="weight_kg" type="number" min="30" max="300" step="0.1" placeholder="75" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Poids cible (kg)</label>
                    <input className={styles.formInput} name="target_weight_kg" type="number" min="30" max="300" step="0.1" placeholder="70" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Sexe biologique</label>
                    <select className={styles.formSelect} name="biological_sex">
                      <option value="">— choisir —</option>
                      <option value="male">Masculin</option>
                      <option value="female">Féminin</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date de naissance</label>
                    <input className={styles.formInput} name="date_of_birth" type="date" />
                  </div>
                </div>
                {profileErr && <p className={styles.formErr}>{profileErr}</p>}
                <button className={styles.formBtn} type="submit" disabled={savingProfile}>
                  {savingProfile ? 'Enregistrement…' : 'Créer mon profil'}
                </button>
              </form>
            ) : editingProfile ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingProfile(true); setProfileErr('');
                try {
                  const res = await updateProfile({
                    height_cm:        fd.get('height_cm')        ? Number(fd.get('height_cm'))        : null,
                    weight_kg:        fd.get('weight_kg')        ? Number(fd.get('weight_kg'))        : null,
                    target_weight_kg: fd.get('target_weight_kg') ? Number(fd.get('target_weight_kg')) : null,
                    biological_sex:   fd.get('biological_sex') || null,
                    date_of_birth:    fd.get('date_of_birth')  || null,
                  });
                  setProfile(res);
                  setEditingProfile(false);
                } catch (err: unknown) { setProfileErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingProfile(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Taille (cm)</label>
                    <input className={styles.formInput} name="height_cm" type="number" min="100" max="250" defaultValue={profile.height_cm ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Poids (kg)</label>
                    <input className={styles.formInput} name="weight_kg" type="number" min="30" max="300" step="0.1" defaultValue={profile.weight_kg ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Poids cible (kg)</label>
                    <input className={styles.formInput} name="target_weight_kg" type="number" min="30" max="300" step="0.1" defaultValue={profile.target_weight_kg ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Sexe biologique</label>
                    <select className={styles.formSelect} name="biological_sex" defaultValue={profile.biological_sex ?? ''}>
                      <option value="">— choisir —</option>
                      <option value="male">Masculin</option>
                      <option value="female">Féminin</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date de naissance</label>
                    <input className={styles.formInput} name="date_of_birth" type="date" defaultValue={profile.date_of_birth ? String(profile.date_of_birth) : ''} />
                  </div>
                </div>
                {profileErr && <p className={styles.formErr}>{profileErr}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={styles.formBtn} type="submit" disabled={savingProfile}>
                    {savingProfile ? 'Enregistrement…' : 'Sauvegarder'}
                  </button>
                  <button className={styles.addBtn} type="button" onClick={() => { setEditingProfile(false); setProfileErr(''); }}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.statGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Taille</span>
                  <span className={styles.statValue}>
                    {fmt(profile.height_cm)}
                    {profile.height_cm && <span className={styles.statUnit}>cm</span>}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Poids</span>
                  <span className={styles.statValue}>
                    {fmt(profile.weight_kg)}
                    {profile.weight_kg && <span className={styles.statUnit}>kg</span>}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Objectif</span>
                  <span className={styles.statValue}>
                    {fmt(profile.target_weight_kg)}
                    {profile.target_weight_kg && <span className={styles.statUnit}>kg</span>}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Sexe</span>
                  <span className={styles.statValue} style={{ fontSize: '0.85rem' }}>
                    {capitalize(profile.biological_sex)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Naissance</span>
                  <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                    {fmtDate(profile.date_of_birth)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Profil créé</span>
                  <span className={styles.statValue} style={{ fontSize: '0.78rem' }}>
                    {fmtDate(profile.created_at)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Calculs métaboliques ── */}
          <div className={styles.card}>
            <div className={styles.sectionLabel}>Calculs métaboliques</div>
            {loading ? (
              <div className={styles.statGrid}>{[1,2,3,4].map(i => <Skeleton key={i} height="44px" />)}</div>
            ) : !calcs ? (
              <p className={styles.empty}>Complétez votre profil pour obtenir les calculs</p>
            ) : (
              <>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>IMC</span>
                    <span className={styles.statValue}>{calcs.bmi.toFixed(1)}</span>
                    <span className={styles.bmiCategory}>{calcs.bmi_category}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>MB (BMR)</span>
                    <span className={styles.statValue}>
                      {calcs.bmr_kcal}<span className={styles.statUnit}>kcal</span>
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>TDEE (maintenance)</span>
                    <span className={styles.statValue}>
                      {calcs.tdee_kcal}<span className={styles.statUnit}>kcal</span>
                    </span>
                  </div>
                  {calcs.target_calories_kcal != null && (
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Cible énergétique</span>
                      <span className={styles.statValue}>
                        {calcs.target_calories_kcal}<span className={styles.statUnit}>kcal</span>
                      </span>
                      <span
                        className={`${styles.adjustmentBadge} ${
                          calcs.energy_adjustment_pct < 0
                            ? styles.deficit
                            : calcs.energy_adjustment_pct > 0
                              ? styles.surplus
                              : styles.maintenance
                        }`}
                      >
                        {calcs.energy_adjustment_pct < 0
                          ? `${calcs.energy_adjustment_pct} % déficit`
                          : calcs.energy_adjustment_pct > 0
                            ? `+${calcs.energy_adjustment_pct} % surplus`
                            : 'maintien'}
                      </span>
                    </div>
                  )}
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>PAL</span>
                    <span className={styles.statValue}>{calcs.pal.toFixed(2)}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Poids idéal min</span>
                    <span className={styles.statValue}>
                      {calcs.ideal_weight_min_kg.toFixed(1)}<span className={styles.statUnit}>kg</span>
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Poids idéal max</span>
                    <span className={styles.statValue}>
                      {calcs.ideal_weight_max_kg.toFixed(1)}<span className={styles.statUnit}>kg</span>
                    </span>
                  </div>
                </div>
                {calcs.macros && (
                  <div className={styles.macros}>
                    <div className={styles.macroItem}>
                      <div className={styles.macroLabel}>Protéines</div>
                      <div className={styles.macroValue}>{calcs.macros.proteins_g}</div>
                      <div className={styles.macroUnit}>g/j</div>
                    </div>
                    <div className={styles.macroItem}>
                      <div className={styles.macroLabel}>Glucides</div>
                      <div className={styles.macroValue}>{calcs.macros.carbs_g}</div>
                      <div className={styles.macroUnit}>g/j</div>
                    </div>
                    <div className={styles.macroItem}>
                      <div className={styles.macroLabel}>Lipides</div>
                      <div className={styles.macroValue}>{calcs.macros.fats_g}</div>
                      <div className={styles.macroUnit}>g/j</div>
                    </div>
                  </div>
                )}
                {calcs.explanation && (
                  <p className={styles.objectiveExplanation}>{calcs.explanation}</p>
                )}
              </>
            )}
          </div>

          </>}

          {/* ══ ACTIVITÉ ══ */}
          {activeTab === 'activite' && <>

          {/* ── Profil sportif ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Profil sportif</div>
              {sports && !editingSports && (
                <button className={styles.addBtn} onClick={() => { setEditSportsList(sports.sports); setEditingSports(true); }}>Modifier</button>
              )}
            </div>
            {loading ? (
              <Skeleton height="100px" />
            ) : !sports ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingSports(true); setSportsErr('');
                try {
                  const res = await upsertSports({
                    sports:                   newSportsList,
                    practice_level:           fd.get('practice_level') || 'beginner',
                    sessions_per_week:        fd.get('sessions_per_week') ? Number(fd.get('sessions_per_week')) : 0,
                    avg_session_duration_min: fd.get('avg_session_duration_min') ? Number(fd.get('avg_session_duration_min')) : 0,
                    avg_intensity_rpe:        5,
                    resting_heart_rate_bpm:   null,
                  });
                  setSports(res);
                } catch (err: unknown) { setSportsErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingSports(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.gridFull}`} style={{ gridColumn: '1 / -1' }}>
                    <label className={styles.formLabel}>Sports pratiqués</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        className={styles.formInput}
                        type="text"
                        value={newSportsInput}
                        onChange={(e) => setNewSportsInput(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ',') && newSportsInput.trim()) {
                            e.preventDefault();
                            const s = newSportsInput.trim();
                            if (!newSportsList.includes(s)) setNewSportsList(prev => [...prev, s]);
                            setNewSportsInput('');
                          }
                        }}
                        placeholder="Ex : course à pied, natation… (Entrée pour ajouter)"
                      />
                      <button
                        type="button"
                        className={styles.formBtn}
                        style={{ padding: '0 0.9rem', margin: 0, flexShrink: 0 }}
                        onClick={() => {
                          const s = newSportsInput.trim();
                          if (s && !newSportsList.includes(s)) setNewSportsList(prev => [...prev, s]);
                          setNewSportsInput('');
                        }}
                        disabled={!newSportsInput.trim()}
                      >+</button>
                    </div>
                    {newSportsList.length > 0 && (
                      <div className={styles.tagList} style={{ marginTop: '0.5rem' }}>
                        {newSportsList.map(s => (
                          <span key={s} className={styles.tag} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={() => setNewSportsList(prev => prev.filter(x => x !== s))}>
                            {s} <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau de pratique</label>
                    <select className={styles.formSelect} name="practice_level">
                      <option value="beginner">Débutant</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="advanced">Avancé</option>
                      <option value="competitive">Compétiteur</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Sessions / semaine</label>
                    <input className={styles.formInput} name="sessions_per_week" type="number" min="0" max="21" placeholder="3" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Durée moy. (min)</label>
                    <input className={styles.formInput} name="avg_session_duration_min" type="number" min="0" max="300" placeholder="60" />
                  </div>
                </div>
                {sportsErr && <p className={styles.formErr}>{sportsErr}</p>}
                <button className={styles.formBtn} type="submit" disabled={savingSports}>
                  {savingSports ? 'Enregistrement…' : 'Créer mon profil sportif'}
                </button>
              </form>
            ) : editingSports ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingSports(true); setSportsErr('');
                try {
                  const res = await upsertSports({
                    sports:                   editSportsList,
                    practice_level:           fd.get('practice_level') || sports.practice_level,
                    sessions_per_week:        fd.get('sessions_per_week') ? Number(fd.get('sessions_per_week')) : sports.sessions_per_week,
                    avg_session_duration_min: fd.get('avg_session_duration_min') ? Number(fd.get('avg_session_duration_min')) : sports.avg_session_duration_min,
                    avg_intensity_rpe:        sports.avg_intensity_rpe,
                    resting_heart_rate_bpm:   sports.resting_heart_rate_bpm,
                  });
                  setSports(res);
                  setEditingSports(false);
                } catch (err: unknown) { setSportsErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingSports(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.gridFull}`} style={{ gridColumn: '1 / -1' }}>
                    <label className={styles.formLabel}>Sports pratiqués</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        className={styles.formInput}
                        type="text"
                        value={editSportsInput}
                        onChange={(e) => setEditSportsInput(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ',') && editSportsInput.trim()) {
                            e.preventDefault();
                            const s = editSportsInput.trim();
                            if (!editSportsList.includes(s)) setEditSportsList(prev => [...prev, s]);
                            setEditSportsInput('');
                          }
                        }}
                        placeholder="Ex : course à pied, natation… (Entrée pour ajouter)"
                      />
                      <button
                        type="button"
                        className={styles.formBtn}
                        style={{ padding: '0 0.9rem', margin: 0, flexShrink: 0 }}
                        onClick={() => {
                          const s = editSportsInput.trim();
                          if (s && !editSportsList.includes(s)) setEditSportsList(prev => [...prev, s]);
                          setEditSportsInput('');
                        }}
                        disabled={!editSportsInput.trim()}
                      >+</button>
                    </div>
                    {editSportsList.length > 0 && (
                      <div className={styles.tagList} style={{ marginTop: '0.5rem' }}>
                        {editSportsList.map(s => (
                          <span key={s} className={styles.tag} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={() => setEditSportsList(prev => prev.filter(x => x !== s))}>
                            {s} <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau de pratique</label>
                    <select className={styles.formSelect} name="practice_level" defaultValue={sports.practice_level}>
                      <option value="beginner">Débutant</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="advanced">Avancé</option>
                      <option value="competitive">Compétiteur</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Sessions / semaine</label>
                    <input className={styles.formInput} name="sessions_per_week" type="number" min="0" max="21" defaultValue={sports.sessions_per_week} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Durée moy. (min)</label>
                    <input className={styles.formInput} name="avg_session_duration_min" type="number" min="0" max="300" defaultValue={sports.avg_session_duration_min} />
                  </div>
                </div>
                {sportsErr && <p className={styles.formErr}>{sportsErr}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={styles.formBtn} type="submit" disabled={savingSports}>
                    {savingSports ? 'Enregistrement…' : 'Sauvegarder'}
                  </button>
                  <button className={styles.addBtn} type="button" onClick={() => { setEditingSports(false); setSportsErr(''); }}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Niveau</span>
                    <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                      {capitalize(sports.practice_level)}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Sessions/sem.</span>
                    <span className={styles.statValue}>{sports.sessions_per_week}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Durée moy.</span>
                    <span className={styles.statValue}>
                      {sports.avg_session_duration_min}<span className={styles.statUnit}>min</span>
                    </span>
                  </div>
                </div>
                {sports.sports.length > 0 && (
                  <div className={styles.tagList}>
                    {sports.sports.map(s => (
                      <span key={s} className={styles.tagNeutral}>{capitalize(s)}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Mode de vie ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Mode de vie</div>
              {lifestyle && !editingLifestyle && (
                <button className={styles.addBtn} onClick={() => setEditingLifestyle(true)}>Modifier</button>
              )}
            </div>
            {loading ? (
              <Skeleton height="100px" />
            ) : !lifestyle ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingLifestyle(true); setLifestyleErr('');
                try {
                  const res = await upsertLifestyle({
                    profession_activity_level: fd.get('profession_activity_level') || 'sedentary',
                    stress_level:              fd.get('stress_level') || 'moderate',
                    sleep_hours:               fd.get('sleep_hours') ? Number(fd.get('sleep_hours')) : null,
                    chronotype:                fd.get('chronotype') || 'intermediate',
                    alcohol_frequency:         fd.get('alcohol_frequency') || 'never',
                    is_smoker:                 fd.get('is_smoker') === 'true',
                    sedentary_hours_per_day:   null,
                  });
                  setLifestyle(res);
                } catch (err: unknown) { setLifestyleErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingLifestyle(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Activité professionnelle</label>
                    <select className={styles.formSelect} name="profession_activity_level">
                      <option value="sedentary">Sédentaire</option>
                      <option value="light">Légère</option>
                      <option value="moderate">Modérée</option>
                      <option value="heavy">Intense</option>
                      <option value="very_heavy">Très intense</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau de stress</label>
                    <select className={styles.formSelect} name="stress_level">
                      <option value="low">Faible</option>
                      <option value="moderate">Modéré</option>
                      <option value="high">Élevé</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Heures de sommeil</label>
                    <input className={styles.formInput} name="sleep_hours" type="number" min="3" max="14" step="0.5" placeholder="8" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Chronotype</label>
                    <select className={styles.formSelect} name="chronotype">
                      <option value="morning">Lève-tôt</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="evening">Couche-tard</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Alcool</label>
                    <select className={styles.formSelect} name="alcohol_frequency">
                      <option value="never">Jamais</option>
                      <option value="occasional">Occasionnel</option>
                      <option value="moderate">Modéré</option>
                      <option value="regular">Régulier</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fumeur</label>
                    <select className={styles.formSelect} name="is_smoker">
                      <option value="false">Non</option>
                      <option value="true">Oui</option>
                    </select>
                  </div>
                </div>
                {lifestyleErr && <p className={styles.formErr}>{lifestyleErr}</p>}
                <button className={styles.formBtn} type="submit" disabled={savingLifestyle}>
                  {savingLifestyle ? 'Enregistrement…' : 'Créer mon mode de vie'}
                </button>
              </form>
            ) : editingLifestyle ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingLifestyle(true); setLifestyleErr('');
                try {
                  const res = await upsertLifestyle({
                    profession_activity_level: fd.get('profession_activity_level') || lifestyle.profession_activity_level,
                    stress_level:              fd.get('stress_level') || lifestyle.stress_level,
                    sleep_hours:               fd.get('sleep_hours') ? Number(fd.get('sleep_hours')) : lifestyle.sleep_hours,
                    chronotype:                fd.get('chronotype') || lifestyle.chronotype,
                    alcohol_frequency:         fd.get('alcohol_frequency') || lifestyle.alcohol_frequency,
                    is_smoker:                 fd.get('is_smoker') === 'true',
                    sedentary_hours_per_day:   lifestyle.sedentary_hours_per_day,
                  });
                  setLifestyle(res);
                  setEditingLifestyle(false);
                } catch (err: unknown) { setLifestyleErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingLifestyle(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Activité professionnelle</label>
                    <select className={styles.formSelect} name="profession_activity_level" defaultValue={lifestyle.profession_activity_level ?? ''}>
                      <option value="sedentary">Sédentaire</option>
                      <option value="light">Légère</option>
                      <option value="moderate">Modérée</option>
                      <option value="heavy">Intense</option>
                      <option value="very_heavy">Très intense</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau de stress</label>
                    <select className={styles.formSelect} name="stress_level" defaultValue={lifestyle.stress_level ?? ''}>
                      <option value="low">Faible</option>
                      <option value="moderate">Modéré</option>
                      <option value="high">Élevé</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Heures de sommeil</label>
                    <input className={styles.formInput} name="sleep_hours" type="number" min="3" max="14" step="0.5" defaultValue={lifestyle.sleep_hours ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Chronotype</label>
                    <select className={styles.formSelect} name="chronotype" defaultValue={lifestyle.chronotype ?? ''}>
                      <option value="morning">Lève-tôt</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="evening">Couche-tard</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Alcool</label>
                    <select className={styles.formSelect} name="alcohol_frequency" defaultValue={lifestyle.alcohol_frequency ?? ''}>
                      <option value="never">Jamais</option>
                      <option value="occasional">Occasionnel</option>
                      <option value="moderate">Modéré</option>
                      <option value="regular">Régulier</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fumeur</label>
                    <select className={styles.formSelect} name="is_smoker" defaultValue={lifestyle.is_smoker ? 'true' : 'false'}>
                      <option value="false">Non</option>
                      <option value="true">Oui</option>
                    </select>
                  </div>
                </div>
                {lifestyleErr && <p className={styles.formErr}>{lifestyleErr}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={styles.formBtn} type="submit" disabled={savingLifestyle}>
                    {savingLifestyle ? 'Enregistrement…' : 'Sauvegarder'}
                  </button>
                  <button className={styles.addBtn} type="button" onClick={() => { setEditingLifestyle(false); setLifestyleErr(''); }}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.statGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Activité prof.</span>
                  <span className={styles.statValue} style={{ fontSize: '0.78rem' }}>
                    {capitalize(lifestyle.profession_activity_level)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Stress</span>
                  <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                    {capitalize(lifestyle.stress_level)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Sommeil</span>
                  <span className={styles.statValue}>
                    {fmt(lifestyle.sleep_hours)}{lifestyle.sleep_hours && <span className={styles.statUnit}>h</span>}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Chronotype</span>
                  <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                    {capitalize(lifestyle.chronotype)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Alcool</span>
                  <span className={styles.statValue} style={{ fontSize: '0.78rem' }}>
                    {capitalize(lifestyle.alcohol_frequency)}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Fumeur</span>
                  <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                    {lifestyle.is_smoker ? 'Oui' : 'Non'}
                  </span>
                </div>
              </div>
            )}
          </div>

          </>}

          {/* ══ NUTRITION ══ */}
          {activeTab === 'nutrition' && <>

          {/* ── Préférences nutritionnelles ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Préférences nutritionnelles</div>
              {nutrition && !editingNutrition && (
                <button className={styles.addBtn} onClick={() => setEditingNutrition(true)}>Modifier</button>
              )}
            </div>
            {loading ? (
              <Skeleton height="120px" />
            ) : !nutrition ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingNutrition(true); setNutritionErr('');
                try {
                  const res = await upsertNutrition({
                    diet_type:            fd.get('diet_type') || 'omnivore',
                    main_goal:            fd.get('main_goal') || 'maintenance',
                    meals_per_day:        fd.get('meals_per_day') ? Number(fd.get('meals_per_day')) : 3,
                    snacks_per_day:       fd.get('snacks_per_day') ? Number(fd.get('snacks_per_day')) : 0,
                    practices_if:         fd.get('practices_if') === 'true',
                    fasting_window_hours: fd.get('fasting_window_hours') ? Number(fd.get('fasting_window_hours')) : null,
                    cooking_level:        fd.get('cooking_level') || 'intermediate',
                    hydration_target_ml:  fd.get('hydration_target_ml') ? Number(fd.get('hydration_target_ml')) : null,
                    supplements:          [],
                    budget_per_day_eur:   fd.get('budget_per_day_eur') ? Number(fd.get('budget_per_day_eur')) : null,
                  });
                  setNutrition(res);
                } catch (err: unknown) { setNutritionErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingNutrition(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Régime alimentaire</label>
                    <select className={styles.formSelect} name="diet_type">
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
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Objectif principal</label>
                    <select className={styles.formSelect} name="main_goal">
                      <option value="weight_loss">Perte de poids</option>
                      <option value="muscle_gain">Prise de masse</option>
                      <option value="body_recomposition">Recomposition</option>
                      <option value="sports_performance">Performance sportive</option>
                      <option value="maintenance">Maintien</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Repas / jour</label>
                    <input className={styles.formInput} name="meals_per_day" type="number" min="1" max="10" placeholder="3" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Collations / jour</label>
                    <input className={styles.formInput} name="snacks_per_day" type="number" min="0" max="6" placeholder="1" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau en cuisine</label>
                    <select className={styles.formSelect} name="cooking_level">
                      <option value="beginner">Débutant</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="advanced">Expert</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Jeûne intermittent</label>
                    <select className={styles.formSelect} name="practices_if">
                      <option value="false">Non</option>
                      <option value="true">Oui</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fenêtre jeûne (h)</label>
                    <input className={styles.formInput} name="fasting_window_hours" type="number" min="8" max="24" placeholder="16" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Hydratation cible (ml)</label>
                    <input className={styles.formInput} name="hydration_target_ml" type="number" min="500" max="5000" step="100" placeholder="2000" />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Budget / jour (€)</label>
                    <input className={styles.formInput} name="budget_per_day_eur" type="number" min="0" max="100" step="0.5" placeholder="15" />
                  </div>
                </div>
                {nutritionErr && <p className={styles.formErr}>{nutritionErr}</p>}
                <button className={styles.formBtn} type="submit" disabled={savingNutrition}>
                  {savingNutrition ? 'Enregistrement…' : 'Créer mes préférences'}
                </button>
              </form>
            ) : editingNutrition ? (
              <form className={styles.form} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSavingNutrition(true); setNutritionErr('');
                try {
                  const res = await upsertNutrition({
                    diet_type:            fd.get('diet_type') || nutrition.diet_type,
                    main_goal:            fd.get('main_goal') || nutrition.main_goal,
                    meals_per_day:        fd.get('meals_per_day') ? Number(fd.get('meals_per_day')) : nutrition.meals_per_day,
                    snacks_per_day:       fd.get('snacks_per_day') ? Number(fd.get('snacks_per_day')) : nutrition.snacks_per_day,
                    practices_if:         fd.get('practices_if') === 'true',
                    fasting_window_hours: fd.get('fasting_window_hours') ? Number(fd.get('fasting_window_hours')) : nutrition.fasting_window_hours,
                    cooking_level:        fd.get('cooking_level') || nutrition.cooking_level,
                    hydration_target_ml:  fd.get('hydration_target_ml') ? Number(fd.get('hydration_target_ml')) : nutrition.hydration_target_ml,
                    supplements:          nutrition.supplements,
                    budget_per_day_eur:   fd.get('budget_per_day_eur') ? Number(fd.get('budget_per_day_eur')) : nutrition.budget_per_day_eur,
                  });
                  setNutrition(res);
                  setEditingNutrition(false);
                } catch (err: unknown) { setNutritionErr(apiErrorMessage(err, err instanceof Error ? err.message : 'Erreur')); }
                setSavingNutrition(false);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Régime alimentaire</label>
                    <select className={styles.formSelect} name="diet_type" defaultValue={nutrition.diet_type}>
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
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Objectif principal</label>
                    <select className={styles.formSelect} name="main_goal" defaultValue={nutrition.main_goal}>
                      <option value="weight_loss">Perte de poids</option>
                      <option value="muscle_gain">Prise de masse</option>
                      <option value="body_recomposition">Recomposition</option>
                      <option value="sports_performance">Performance sportive</option>
                      <option value="maintenance">Maintien</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Repas / jour</label>
                    <input className={styles.formInput} name="meals_per_day" type="number" min="1" max="10" defaultValue={nutrition.meals_per_day ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Collations / jour</label>
                    <input className={styles.formInput} name="snacks_per_day" type="number" min="0" max="6" defaultValue={nutrition.snacks_per_day ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Niveau en cuisine</label>
                    <select className={styles.formSelect} name="cooking_level" defaultValue={nutrition.cooking_level ?? ''}>
                      <option value="beginner">Débutant</option>
                      <option value="intermediate">Intermédiaire</option>
                      <option value="advanced">Expert</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Jeûne intermittent</label>
                    <select className={styles.formSelect} name="practices_if" defaultValue={nutrition.practices_if ? 'true' : 'false'}>
                      <option value="false">Non</option>
                      <option value="true">Oui</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fenêtre jeûne (h)</label>
                    <input className={styles.formInput} name="fasting_window_hours" type="number" min="8" max="24" defaultValue={nutrition.fasting_window_hours ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Hydratation cible (ml)</label>
                    <input className={styles.formInput} name="hydration_target_ml" type="number" min="500" max="5000" step="100" defaultValue={nutrition.hydration_target_ml ?? ''} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Budget / jour (€)</label>
                    <input className={styles.formInput} name="budget_per_day_eur" type="number" min="0" max="100" step="0.5" defaultValue={nutrition.budget_per_day_eur ?? ''} />
                  </div>
                </div>
                {nutritionErr && <p className={styles.formErr}>{nutritionErr}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={styles.formBtn} type="submit" disabled={savingNutrition}>
                    {savingNutrition ? 'Enregistrement…' : 'Sauvegarder'}
                  </button>
                  <button className={styles.addBtn} type="button" onClick={() => { setEditingNutrition(false); setNutritionErr(''); }}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Régime</span>
                    <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                      {capitalize(nutrition.diet_type)}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Objectif</span>
                    <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                      {capitalize(nutrition.main_goal)}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Repas/jour</span>
                    <span className={styles.statValue}>{fmt(nutrition.meals_per_day)}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Collations</span>
                    <span className={styles.statValue}>{fmt(nutrition.snacks_per_day)}</span>
                  </div>
                  {nutrition.hydration_target_ml && (
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Hydratation</span>
                      <span className={styles.statValue}>
                        {nutrition.hydration_target_ml}<span className={styles.statUnit}>ml</span>
                      </span>
                    </div>
                  )}
                  {nutrition.budget_per_day_eur && (
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Budget/jour</span>
                      <span className={styles.statValue}>
                        {nutrition.budget_per_day_eur}<span className={styles.statUnit}>€</span>
                      </span>
                    </div>
                  )}
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Jeûne IF</span>
                    <span className={styles.statValue} style={{ fontSize: '0.82rem' }}>
                      {nutrition.practices_if ? `Oui${nutrition.fasting_window_hours ? ` (${nutrition.fasting_window_hours}h)` : ''}` : 'Non'}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Cuisine</span>
                    <span className={styles.statValue} style={{ fontSize: '0.78rem' }}>
                      {capitalize(nutrition.cooking_level)}
                    </span>
                  </div>
                </div>
                {nutrition.supplements.length > 0 && (
                  <>
                    <div style={{ marginTop: '1rem', marginBottom: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                      Suppléments
                    </div>
                    <div className={styles.tagList}>
                      {nutrition.supplements.map(s => (
                        <span key={s} className={styles.tag}>{capitalize(s)}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Aliments exclus ── */}
          <div className={`${styles.card} ${styles.gridFull}`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Aliments exclus</div>
              <button className={styles.addBtn} onClick={() => setShowAddExcluded(v => !v)}>
                {showAddExcluded ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddExcluded && (
              <ExcludedFoodForm
                onAdd={async () => { const items = await getExcludedFoods(); setExcluded(items); setShowAddExcluded(false); }}
                onCancel={() => setShowAddExcluded(false)}
                addFn={addExcludedFood}
              />
            )}
            {!loading && excluded.length === 0 && !showAddExcluded ? (
              <p className={styles.empty}>Aucun aliment exclu</p>
            ) : (
              <div className={styles.tagList}>
                {excluded.map((f) => (
                  <span
                    key={f.id}
                    className={styles.tagRed}
                    title={f.reason ?? undefined}
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    onClick={async () => {
                      await deleteExcludedFood(f.slug);
                      setExcluded(prev => prev.filter(x => x.id !== f.id));
                    }}
                  >
                    {f.food_name} <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>✕</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          </>}

          {/* ══ SANTÉ ══ */}
          {activeTab === 'sante' && <>

          {/* ── Performance ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Métriques de performance</div>
              <button className={styles.addBtn} onClick={() => setShowAddPerf(v => !v)}>
                {showAddPerf ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddPerf && (
              <PerformanceMetricForm
                onAdd={async () => { const items = await getPerformanceMetrics(); setPerf(items); setShowAddPerf(false); }}
                onCancel={() => setShowAddPerf(false)}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : perf.length === 0 && !showAddPerf ? (
              <p className={styles.empty}>Aucune métrique enregistrée</p>
            ) : (
              <div className={styles.timeline}>
                {perf.slice(0, 5).map((p) => (
                  <div className={styles.timelineEntry} key={p.id}>
                    <span className={styles.timelineDate}>{fmtDate(p.measured_at)}</span>
                    <div className={styles.timelineData}>
                      {p.vo2max      && <span className={styles.timelineStat}>VO₂max <strong>{p.vo2max}</strong></span>}
                      {p.vma_kmh     && <span className={styles.timelineStat}>VMA <strong>{p.vma_kmh} km/h</strong></span>}
                      {p.ftp_watts   && <span className={styles.timelineStat}>FTP <strong>{p.ftp_watts}W</strong></span>}
                      {p.one_rm_squat_kg       && <span className={styles.timelineStat}>Squat <strong>{p.one_rm_squat_kg}kg</strong></span>}
                      {p.one_rm_bench_press_kg && <span className={styles.timelineStat}>Bench <strong>{p.one_rm_bench_press_kg}kg</strong></span>}
                      {p.one_rm_deadlift_kg    && <span className={styles.timelineStat}>DL <strong>{p.one_rm_deadlift_kg}kg</strong></span>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deletePerformanceMetric(p.slug);
                          setPerf(prev => prev.filter(x => x.id !== p.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Composition corporelle ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Composition corporelle</div>
              <button className={styles.addBtn} onClick={() => setShowAddCompo(v => !v)}>
                {showAddCompo ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddCompo && (
              <BodyCompositionForm
                onAdd={async () => { const items = await getBodyComposition(); setCompo(items); setShowAddCompo(false); }}
                onCancel={() => setShowAddCompo(false)}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : compo.length === 0 && !showAddCompo ? (
              <p className={styles.empty}>Aucune mesure enregistrée</p>
            ) : (
              <div className={styles.timeline}>
                {compo.slice(0, 5).map((c) => (
                  <div className={styles.timelineEntry} key={c.id}>
                    <span className={styles.timelineDate}>{fmtDate(c.measured_at)}</span>
                    <div className={styles.timelineData}>
                      {c.body_fat_percentage  != null && <span className={styles.timelineStat}>MG <strong>{c.body_fat_percentage}%</strong></span>}
                      {c.lean_mass_kg         != null && <span className={styles.timelineStat}>MM <strong>{c.lean_mass_kg}kg</strong></span>}
                      {c.bone_mass_kg         != null && <span className={styles.timelineStat}>Os <strong>{c.bone_mass_kg}kg</strong></span>}
                      {c.water_percentage     != null && <span className={styles.timelineStat}>Eau <strong>{c.water_percentage}%</strong></span>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteBodyComposition(c.slug);
                          setCompo(prev => prev.filter(x => x.id !== c.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Mensurations ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Mensurations</div>
              <button className={styles.addBtn} onClick={() => setShowAddMeasures(v => !v)}>
                {showAddMeasures ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddMeasures && (
              <BodyMeasurementsForm
                onAdd={async () => { const items = await getBodyMeasurements(); setMeasures(items); setShowAddMeasures(false); }}
                onCancel={() => setShowAddMeasures(false)}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : measures.length === 0 && !showAddMeasures ? (
              <p className={styles.empty}>Aucune mensuration enregistrée</p>
            ) : (
              <div className={styles.timeline}>
                {measures.slice(0, 3).map((m) => (
                  <div className={styles.timelineEntry} key={m.id}>
                    <span className={styles.timelineDate}>{fmtDate(m.measured_at)}</span>
                    <div className={styles.timelineData}>
                      {m.waist_cm     != null && <span className={styles.timelineStat}>Taille <strong>{m.waist_cm}cm</strong></span>}
                      {m.hips_cm      != null && <span className={styles.timelineStat}>Hanches <strong>{m.hips_cm}cm</strong></span>}
                      {m.chest_cm     != null && <span className={styles.timelineStat}>Poitrine <strong>{m.chest_cm}cm</strong></span>}
                      {m.shoulders_cm != null && <span className={styles.timelineStat}>Épaules <strong>{m.shoulders_cm}cm</strong></span>}
                      {m.left_arm_cm  != null && <span className={styles.timelineStat}>Bras G <strong>{m.left_arm_cm}cm</strong></span>}
                      {m.right_arm_cm != null && <span className={styles.timelineStat}>Bras D <strong>{m.right_arm_cm}cm</strong></span>}
                      {m.left_thigh_cm  != null && <span className={styles.timelineStat}>Cuisse G <strong>{m.left_thigh_cm}cm</strong></span>}
                      {m.right_thigh_cm != null && <span className={styles.timelineStat}>Cuisse D <strong>{m.right_thigh_cm}cm</strong></span>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteBodyMeasurements(m.slug);
                          setMeasures(prev => prev.filter(x => x.id !== m.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Blessures ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Blessures</div>
              <button className={styles.addBtn} onClick={() => setShowAddInjury(v => !v)}>
                {showAddInjury ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddInjury && (
              <InjuryForm
                onAdd={async (slug) => { const items = await getInjuries(); setInjuries(items); setShowAddInjury(false); void slug; }}
                onCancel={() => setShowAddInjury(false)}
                addFn={addInjury}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : injuries.length === 0 && !showAddInjury ? (
              <p className={styles.empty}>Aucune blessure déclarée</p>
            ) : (
              <div className={styles.itemList}>
                {injuries.map((inj) => (
                  <div className={styles.item} key={inj.id}>
                    <span className={inj.is_current ? styles.itemDotRed : styles.itemDot} />
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>
                        {capitalize(inj.body_part)} — {capitalize(inj.injury_type)}
                      </div>
                      <div className={styles.itemSub}>
                        {inj.is_chronic && 'Chronique · '}
                        {inj.is_current ? 'En cours' : 'Résolue'}
                        {inj.diagnosed_at && ` · depuis ${fmtDate(inj.diagnosed_at)}`}
                      </div>
                      {inj.notes && <div className={styles.itemSub} style={{ marginTop: 2 }}>{inj.notes}</div>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteInjury(inj.slug);
                          setInjuries(prev => prev.filter(x => x.id !== inj.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Allergies ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Allergies & intolérances</div>
              <button className={styles.addBtn} onClick={() => setShowAddAllergy(v => !v)}>
                {showAddAllergy ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddAllergy && (
              <AllergyForm
                onAdd={async () => { const items = await getAllergies(); setAllergies(items); setShowAddAllergy(false); }}
                onCancel={() => setShowAddAllergy(false)}
                addFn={addAllergy}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : allergies.length === 0 && !showAddAllergy ? (
              <p className={styles.empty}>Aucune allergie déclarée</p>
            ) : (
              <div className={styles.itemList}>
                {allergies.map((a) => (
                  <div className={styles.item} key={a.id}>
                    <span className={styles.itemDotRed} />
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>{capitalize(a.allergen)}</div>
                      <div className={styles.itemSub}>Sévérité : {capitalize(a.severity)}</div>
                      {a.notes && <div className={styles.itemSub}>{a.notes}</div>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteAllergy(a.slug);
                          setAllergies(prev => prev.filter(x => x.id !== a.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Conditions médicales ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Conditions médicales</div>
              <button className={styles.addBtn} onClick={() => setShowAddCondition(v => !v)}>
                {showAddCondition ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddCondition && (
              <ConditionForm
                onAdd={async () => { const items = await getConditions(); setConditions(items); setShowAddCondition(false); }}
                onCancel={() => setShowAddCondition(false)}
                addFn={addCondition}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : conditions.length === 0 && !showAddCondition ? (
              <p className={styles.empty}>Aucune condition médicale déclarée</p>
            ) : (
              <div className={styles.itemList}>
                {conditions.map((c) => (
                  <div className={styles.item} key={c.id}>
                    <span className={c.is_current ? styles.itemDotRed : styles.itemDot} />
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>{c.condition_name}</div>
                      <div className={styles.itemSub}>
                        {capitalize(c.category)} · {c.is_current ? 'En cours' : 'Résolue'}
                      </div>
                      {c.notes && <div className={styles.itemSub}>{c.notes}</div>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteCondition(c.slug);
                          setConditions(prev => prev.filter(x => x.id !== c.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Médicaments ── */}
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLabel}>Médicaments</div>
              <button className={styles.addBtn} onClick={() => setShowAddMedication(v => !v)}>
                {showAddMedication ? '✕' : '+ Ajouter'}
              </button>
            </div>
            {showAddMedication && (
              <MedicationForm
                onAdd={async () => { const items = await getMedications(); setMedications(items); setShowAddMedication(false); }}
                onCancel={() => setShowAddMedication(false)}
                addFn={addMedication}
              />
            )}
            {loading ? (
              <Skeleton height="80px" />
            ) : medications.length === 0 && !showAddMedication ? (
              <p className={styles.empty}>Aucun médicament déclaré</p>
            ) : (
              <div className={styles.itemList}>
                {medications.map((m) => (
                  <div className={styles.item} key={m.id}>
                    <span className={m.impacts_metabolism ? styles.itemDotRed : styles.itemDot} />
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitle}>{m.medication_name}</div>
                      {m.impacts_metabolism && (
                        <div className={styles.itemSub}>Impact métabolique</div>
                      )}
                      {m.notes && <div className={styles.itemSub}>{m.notes}</div>}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.deleteBtn}
                        title="Supprimer"
                        onClick={async () => {
                          await deleteMedication(m.slug);
                          setMedications(prev => prev.filter(x => x.id !== m.id));
                        }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          </>}

          {/* ══ SÉCURITÉ ══ */}
          {activeTab === 'securite' && <>

          {/* ── Changer le mot de passe ── */}
          <div className={`${styles.card} ${styles.gridFull}`}>
            <div className={styles.sectionLabel}>Changer le mot de passe</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 380 }}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Mot de passe actuel</label>
                <input
                  type="password"
                  className={styles.formInput}
                  value={pwdCurrent}
                  onChange={e => { setPwdCurrent(e.target.value); setPwdErr(''); setPwdOk(false); }}
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Nouveau mot de passe</label>
                <input
                  type="password"
                  className={styles.formInput}
                  value={pwdNew}
                  onChange={e => { setPwdNew(e.target.value); setPwdErr(''); setPwdOk(false); }}
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  className={styles.formInput}
                  value={pwdConfirm}
                  onChange={e => { setPwdConfirm(e.target.value); setPwdErr(''); setPwdOk(false); }}
                  autoComplete="new-password"
                />
              </div>
              {pwdErr && <p className={styles.formErr}>{pwdErr}</p>}
              {pwdOk  && <p className={styles.formOk}>✓ Mot de passe mis à jour avec succès.</p>}
              <button
                className={styles.formBtn}
                disabled={pwdSaving || !pwdCurrent || !pwdNew || !pwdConfirm}
                onClick={async () => {
                  if (pwdNew !== pwdConfirm) { setPwdErr('Les mots de passe ne correspondent pas.'); return; }
                  if (pwdNew.length < 8) { setPwdErr('Le mot de passe doit contenir au moins 8 caractères.'); return; }
                  setPwdSaving(true); setPwdErr(''); setPwdOk(false);
                  try {
                    await changePassword(pwdCurrent, pwdNew);
                    setPwdOk(true);
                    setPwdCurrent(''); setPwdNew(''); setPwdConfirm('');
                  } catch (e: unknown) {
                    setPwdErr(apiErrorMessage(e, 'Erreur lors du changement de mot de passe.'));
                  }
                  setPwdSaving(false);
                }}
              >
                {pwdSaving ? 'Enregistrement…' : 'Changer le mot de passe'}
              </button>
            </div>
          </div>

          {/* ── Sécurité / TOTP ── */}
          <div className={`${styles.card} ${styles.gridFull}`}>
            <div className={styles.sectionLabel}>Sécurité — Authentification à deux facteurs</div>
            {loading ? (
              <Skeleton height="60px" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Statut :
                  </span>
                  {mfaEnabled ? (
                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.65rem', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent-light)', border: '1px solid var(--accent-border)', fontWeight: 500 }}>
                      2FA activée (TOTP)
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.65rem', borderRadius: 20, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      2FA désactivée
                    </span>
                  )}
                </div>

                {/* Actions */}
                {mfaEnabled ? (
                  <button
                    className={styles.formBtn}
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}
                    onClick={async () => {
                      setTotpLoading(true); setTotpErr('');
                      try {
                        await disableMfa();
                        setMfaEnabled(false);
                        setTotpDone(false);
                      } catch (e: unknown) {
                        setTotpErr(apiErrorMessage(e, 'Erreur lors de la désactivation'));
                      }
                      setTotpLoading(false);
                    }}
                    disabled={totpLoading}
                  >
                    {totpLoading ? 'Désactivation…' : 'Désactiver la 2FA'}
                  </button>
                ) : !totpSetup ? (
                  <button
                    className={styles.formBtn}
                    onClick={async () => {
                      setTotpLoading(true); setTotpErr('');
                      try {
                        const data = await setupTotp();
                        setTotpSetup(data);
                      } catch (e: unknown) {
                        setTotpErr(apiErrorMessage(e, 'Erreur lors de la configuration TOTP'));
                      }
                      setTotpLoading(false);
                    }}
                    disabled={totpLoading}
                  >
                    {totpLoading ? 'Génération…' : 'Activer la 2FA (TOTP)'}
                  </button>
                ) : totpDone ? (
                  <div style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>
                    ✓ 2FA activée avec succès
                  </div>
                ) : (
                  /* QR code + confirmation */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 360 }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Scannez ce QR code avec votre application authenticator (Google Authenticator, Authy…), puis entrez le code affiché pour confirmer.
                    </p>
                    <img
                      src={`data:image/png;base64,${totpSetup.qr_code_base64}`}
                      alt="QR code TOTP"
                      style={{ width: 180, height: 180, imageRendering: 'pixelated', borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <details style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <summary style={{ cursor: 'pointer' }}>URI de provisionnement (manuel)</summary>
                      <code style={{ wordBreak: 'break-all', display: 'block', marginTop: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {totpSetup.provisioning_uri}
                      </code>
                    </details>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        className={styles.formInput}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Code 6 chiffres"
                        style={{ letterSpacing: '0.2em', maxWidth: 160 }}
                      />
                      <button
                        className={styles.formBtn}
                        onClick={async () => {
                          setTotpLoading(true); setTotpErr('');
                          try {
                            const tokens = await confirmTotp(totpCode);
                            setSession(tokens.access_token);
                            setMfaEnabled(true);
                            setTotpSetup(null);
                            setTotpCode('');
                            setTotpDone(true);
                          } catch (e: unknown) {
                            setTotpErr(apiErrorMessage(e, 'Code invalide'));
                          }
                          setTotpLoading(false);
                        }}
                        disabled={totpLoading || totpCode.length !== 6}
                      >
                        {totpLoading ? '…' : 'Confirmer'}
                      </button>
                      <button
                        className={styles.addBtn}
                        onClick={() => { setTotpSetup(null); setTotpCode(''); setTotpErr(''); }}
                        type="button"
                      >Annuler</button>
                    </div>
                  </div>
                )}

                {totpErr && <p className={styles.formErr}>{totpErr}</p>}
              </div>
            )}
          </div>

          </>}

        </div>
      </main>
    </Layout>
  );
}
