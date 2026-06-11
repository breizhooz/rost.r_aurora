import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  adminListUsers, adminUpdateUserRights, getRecipeCountsByUser, checkHealth, getCrawlerQueue,
  deleteRecipesByUser, adminDeleteUser, getCrawlerTaskStatus, updateInstagramSession, getInstagramSession,
  importRecipes, getRecipeImportStatus,
} from '../api/endpoints';
import axios from 'axios';
import RostError, { fail, type RostFailure } from './RostError';
import { emitRefresh } from '../utils/liveRefresh';
import type { AdminUser, RecipeCountsByUser, ServiceHealth, UserRights, QueueSnapshot, QueueTask, TaskStatus, InstagramSessionInfo, RecipeImportReport } from '../types';

const QUEUE_STATE_LABELS: Record<string, string> = { active: 'En cours', reserved: 'Réservée', scheduled: 'Planifiée' };

const TASK_STATE_LABELS: Record<string, string> = {
  PENDING: 'Inconnue ou pas encore démarrée',
  STARTED: 'En cours',
  RETRY: 'A planté — relance programmée',
  FAILURE: 'Échec définitif',
  SUCCESS: 'Terminée avec succès',
  REVOKED: 'Annulée',
};

// Sections du « classeur » de l'admin : nav verticale à gauche, contenu à droite.
type AdminSection = 'utilisateurs' | 'import' | 'queue' | 'igsession' | 'igdiag' | 'systeme';
const ADMIN_SECTIONS: { id: AdminSection; label: string }[] = [
  { id: 'utilisateurs', label: 'Utilisateurs' },
  { id: 'import', label: 'Importer des recettes' },
  { id: 'queue', label: "File d'attente" },
  { id: 'igsession', label: 'Instagram — session' },
  { id: 'igdiag', label: 'Instagram — diagnostic' },
  { id: 'systeme', label: 'Statut système' },
];

// Libellés des rôles de compte (multicompte) pour la colonne « Rôle ».
const ROLE_LABEL_ADMIN: Record<string, string> = {
  OWNER: 'Propriétaire', ADMIN: 'Administrateur', COACH: 'Gestionnaire',
  EDITOR: 'Éditeur', CONTRIBUTOR: 'Contributeur', VIEWER: 'Lecteur',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('fr-FR'); } catch { return iso; }
}

function shortName(name: string | null): string {
  if (!name) return '—';
  return name.replace(/^tasks\./, '');
}
function fmtEta(eta: string | null): string {
  if (!eta) return '—';
  try { return new Date(eta).toLocaleTimeString('fr-FR'); } catch { return eta; }
}

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

// Extrait le message d'erreur d'une réponse API : forme métier {error:{message}}
// (LocalizedHTTPException) ou {detail}/{message} (FastAPI standard).
function apiErrorDetail(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const data = e.response?.data as
    | { error?: { message?: string }; detail?: string; message?: string }
    | undefined;
  return data?.error?.message ?? data?.detail ?? data?.message ?? null;
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`rost-toggle ${on ? 'is-on' : ''}`}
      onClick={onChange}
    >
      <span className="rost-toggle-knob" />
    </button>
  );
}

export default function AuroraAdmin() {
  const { user, loading: userLoading, isAdmin } = useCurrentUser();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<RecipeCountsByUser>({});
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminSection, setAdminSection] = useState<AdminSection>('utilisateurs');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<RostFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<RostFailure | null>(null);
  const [deletingRecipesId, setDeletingRecipesId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [diagId, setDiagId] = useState('');
  const [diag, setDiag] = useState<TaskStatus | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<RostFailure | null>(null);
  const [igSession, setIgSession] = useState('');
  const [igSaving, setIgSaving] = useState(false);
  const [igError, setIgError] = useState<RostFailure | null>(null);
  const [igOk, setIgOk] = useState<string | null>(null);
  const [igInfo, setIgInfo] = useState<InstagramSessionInfo | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<RostFailure | null>(null);
  const [importReport, setImportReport] = useState<RecipeImportReport | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    Promise.all([
      adminListUsers(),
      getRecipeCountsByUser().catch(() => ({} as RecipeCountsByUser)),
      checkHealth(),
      getCrawlerQueue().catch(() => null),
      getInstagramSession().catch(() => null),
    ])
      .then(([u, c, h, q, ig]) => { if (active) { setUsers(u); setCounts(c); setHealth(h); setQueue(q); setIgInfo(ig); } })
      .catch((e) => { if (active) setError(fail('Impossible de charger les données admin.', e, 'service-user')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin]);

  async function runDiagnose(idArg?: string) {
    const id = (idArg ?? diagId).trim();
    if (!id) return;
    if (idArg) setDiagId(idArg);
    setDiagLoading(true); setDiag(null); setDiagError(null);
    try {
      setDiag(await getCrawlerTaskStatus(id));
    } catch (e) {
      setDiagError(fail("Impossible de récupérer l'état de cette tâche (worker/result backend injoignable ?).", e, 'service-crawler'));
    } finally {
      setDiagLoading(false);
    }
  }

  async function saveIgSession() {
    const sid = igSession.trim();
    if (!sid) return;
    setIgSaving(true); setIgError(null); setIgOk(null);
    try {
      const { username } = await updateInstagramSession(sid);
      setIgOk(`Session Instagram mise à jour — connecté en tant que @${username}.`);
      setIgSession('');
      setIgInfo(await getInstagramSession().catch(() => igInfo));
    } catch (e) {
      setIgError(fail(apiErrorDetail(e) ?? "Échec de la mise à jour de la session Instagram.", e, 'service-crawler'));
    } finally {
      setIgSaving(false);
    }
  }

  async function runImport() {
    if (!importFile) return;
    setImporting(true); setImportError(null); setImportReport(null);
    try {
      // 1) Upload + validation immédiate → la tâche est enfilée (réponse rapide).
      const { task_id } = await importRecipes(importFile);
      setImportFile(null);
      // 2) Polling : l'import est long (appel service-nutrition par recette).
      //    On suit jusqu'à ~5 min (100 × 3 s) avant d'abandonner le suivi UI.
      let resolved = false;
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        let st;
        try { st = await getRecipeImportStatus(task_id); } catch { continue; }
        if (!st.ready) continue;
        resolved = true;
        if (st.successful && st.result) {
          setImportReport(st.result);
          setCounts(await getRecipeCountsByUser().catch(() => counts));
          // Signale aux autres écrans (cloche + listes de recettes) de se rafraîchir.
          emitRefresh('recipes');
        } else {
          setImportError(fail(st.error ?? "L'import a échoué côté serveur.", null, 'service-recipe'));
        }
        // Le worker a créé une notif (succès ✅ ou échec ⚠️) → rafraîchir la cloche.
        emitRefresh('notifications');
        break;
      }
      if (!resolved) {
        setImportError(fail(
          "Import lancé mais toujours en cours après plusieurs minutes — vérifie la file d'attente puis le nombre de recettes.",
          null, 'service-recipe',
        ));
      }
    } catch (e) {
      setImportError(fail(apiErrorDetail(e) ?? "Échec de l'import du fichier de recettes.", e, 'service-recipe'));
    } finally {
      setImporting(false);
    }
  }

  async function refreshQueue() {
    setQueueLoading(true); setQueueError(null);
    try { setQueue(await getCrawlerQueue()); }
    catch (e) { setQueue(null); setQueueError(fail("File d'attente indisponible (worker injoignable).", e, 'service-crawler')); }
    finally { setQueueLoading(false); }
  }

  async function patch(target: AdminUser, next: { user_admin?: boolean; is_coach?: boolean; user_right?: UserRights }) {
    setSavingId(target.id); setError(null);
    try {
      const updated = await adminUpdateUserRights(target.id, next);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(fail("Échec de la mise à jour des droits.", e, 'service-user'));
    } finally {
      setSavingId(null);
    }
  }

  function toggleAdmin(u: AdminUser) { patch(u, { user_admin: !u.user_admin }); }
  // Capacité « coach » (accordée par un admin) : autorise à créer des liens de
  // coaching et à accéder à « Mon équipe ».
  function toggleCoach(u: AdminUser) { patch(u, { is_coach: !u.is_coach }); }

  // UserRights est un remplacement complet côté API → toujours renvoyer crawl ET uniq_link.
  function fullRights(u: AdminUser): UserRights {
    return {
      crawl: u.user_right.crawl ?? { instagram: false, web: false },
      uniq_link: u.user_right.uniq_link ?? { instagram: false, web: false },
    };
  }
  function toggleCrawl(u: AdminUser, source: 'instagram' | 'web') {
    const r = fullRights(u);
    patch(u, { user_right: { ...r, crawl: { ...r.crawl, [source]: !r.crawl[source] } } });
  }
  function toggleUniqLink(u: AdminUser, source: 'instagram' | 'web') {
    const r = fullRights(u);
    patch(u, { user_right: { ...r, uniq_link: { ...r.uniq_link, [source]: !r.uniq_link[source] } } });
  }

  async function removeUserRecipes(u: AdminUser) {
    if (!window.confirm(
      `Supprimer DÉFINITIVEMENT toutes les recettes de ${u.email} `
      + '(base de données + index de recherche) ? Cette action est irréversible.'
    )) return;
    setDeletingRecipesId(u.id); setError(null); setNotice(null);
    try {
      const { deleted } = await deleteRecipesByUser(u.id);
      setCounts((prev) => ({ ...prev, [u.id]: 0 }));
      setNotice(`${deleted} recette(s) de ${u.email} supprimée(s).`);
    } catch (e) {
      setError(fail(`Échec de la suppression des recettes de ${u.email}.`, e, 'service-recipe'));
    } finally {
      setDeletingRecipesId(null);
    }
  }

  async function removeAccount(u: AdminUser) {
    if (!window.confirm(
      `Supprimer DÉFINITIVEMENT le compte ${u.email} ainsi que toutes ses recettes `
      + '(base de données + index de recherche) ? Cette action est irréversible.'
    )) return;
    setDeletingId(u.id); setError(null); setNotice(null);
    try {
      // On purge d'abord les recettes (BDD + ES) pour ne pas laisser d'orphelins,
      // puis on supprime le compte côté service-user.
      await deleteRecipesByUser(u.id);
      await adminDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setCounts((prev) => { const next = { ...prev }; delete next[u.id]; return next; });
      setNotice(`Compte ${u.email} supprimé.`);
    } catch (e) {
      setError(fail(`Échec de la suppression du compte ${u.email}.`, e, 'service-user'));
    } finally {
      setDeletingId(null);
    }
  }

  if (!userLoading && !isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AuroraShell screen="admin" initials={user ? initials(user.email) : undefined}
      title="Admin" subtitle="Gestion des droits & santé du système">
      <div className="rost-page">
        <RostError failure={error} />
        {notice && <p className="rost-notice">{notice}</p>}

        <div className="rost-binder">
          <nav className="rost-binder-nav" aria-label="Sections de l'administration">
            {ADMIN_SECTIONS.map((s) => (
              <button key={s.id} type="button"
                className={`rost-binder-tab ${adminSection === s.id ? 'is-active' : ''}`}
                aria-current={adminSection === s.id}
                onClick={() => setAdminSection(s.id)}>{s.label}</button>
            ))}
          </nav>
          <div className="rost-binder-panel">

        {/* ── Utilisateurs ── */}
        {adminSection === 'utilisateurs' && (
        <article className="rost-card">
          <div className="rost-card-head"><span className="rost-card-title">Utilisateurs</span></div>
          {loading ? <div className="rost-skel" style={{ height: 200 }} />
            : users.length === 0 ? <p className="rost-empty">Aucun utilisateur.</p>
            : (
              <div className="rost-admin-table-wrap">
                <table className="rost-admin-table">
                  <thead>
                    <tr>
                      <th>Email</th><th>Recettes</th><th>Rôle</th><th>Admin</th><th>Gestionnaire</th>
                      <th>Crawl IG</th><th>Crawl Web</th>
                      <th>Lien IG</th><th>Lien Web</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const busy = savingId === u.id;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="rost-admin-user">{u.email}</div>
                            {!u.is_active && <span className="rost-chip rost-chip-ghost">inactif</span>}
                          </td>
                          <td className="rost-admin-num">{counts[u.id] ?? 0}</td>
                          <td>
                            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                              {(u.account_roles ?? []).length === 0
                                ? <span className="rost-chip rost-chip-ghost">—</span>
                                : u.account_roles.map((r) => <span key={r} className="rost-chip rost-chip-ghost">{ROLE_LABEL_ADMIN[r] ?? r}</span>)}
                            </span>
                          </td>
                          <td><Toggle on={u.user_admin} disabled={busy} onChange={() => toggleAdmin(u)} /></td>
                          <td><Toggle on={u.is_coach} disabled={busy} onChange={() => toggleCoach(u)} /></td>
                          <td><Toggle on={u.user_right.crawl.instagram} disabled={busy} onChange={() => toggleCrawl(u, 'instagram')} /></td>
                          <td><Toggle on={u.user_right.crawl.web} disabled={busy} onChange={() => toggleCrawl(u, 'web')} /></td>
                          <td><Toggle on={u.user_right.uniq_link?.instagram ?? false} disabled={busy} onChange={() => toggleUniqLink(u, 'instagram')} /></td>
                          <td><Toggle on={u.user_right.uniq_link?.web ?? false} disabled={busy} onChange={() => toggleUniqLink(u, 'web')} /></td>
                          <td>
                            <div className="rost-admin-actions">
                              <button
                                className="rost-btn rost-btn-danger"
                                disabled={deletingRecipesId === u.id || deletingId === u.id || (counts[u.id] ?? 0) === 0}
                                title="Supprimer toutes les recettes de cet utilisateur"
                                onClick={() => removeUserRecipes(u)}
                              >
                                {deletingRecipesId === u.id ? 'Suppression…' : 'Supprimer les recettes'}
                              </button>
                              <button
                                className="rost-btn rost-btn-danger"
                                disabled={busy || deletingId === u.id || deletingRecipesId === u.id || u.id === user?.id}
                                title={u.id === user?.id ? 'Vous ne pouvez pas supprimer votre propre compte' : 'Supprimer le compte et ses recettes'}
                                onClick={() => removeAccount(u)}
                              >
                                {deletingId === u.id ? 'Suppression…' : 'Supprimer le compte'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </article>
        )}

        {/* ── Import de recettes (fichier JSON) ── */}
        {adminSection === 'import' && (
        <article className="rost-card">
          <div className="rost-card-head"><span className="rost-card-title">Importer des recettes</span></div>
          <p className="rost-hint">
            Importez en masse des recettes et leur catalogue d'ingrédients depuis un fichier <strong>JSON</strong>
            (même format que <code>scripts/import_recipes.py</code> / <code>sample_recipes.json</code>). Les recettes
            sont attribuées au <code>created_by_user_id</code> indiqué dans le fichier, et les macros calculées via
            service-nutrition. L'import tourne en tâche de fond (Celery) et peut prendre plusieurs minutes pour un gros
            fichier — laisse cette page ouverte, le suivi se met à jour automatiquement.
          </p>
          <div className="rost-diag-form">
            <input
              className="rost-input"
              type="file"
              accept="application/json,.json"
              onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportReport(null); setImportError(null); }}
            />
            <button className="rost-btn" disabled={importing || !importFile} onClick={runImport}>
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
          <RostError failure={importError} />
          {importReport && (
            <p className="rost-notice">
              Import terminé : {importReport.recipes_created} recette(s) créée(s),{' '}
              {importReport.ingredients_upserted} ingrédient(s) ajouté(s)/mis à jour.
            </p>
          )}
        </article>
        )}

        {/* ── File d'attente (Celery) ── */}
        {adminSection === 'queue' && (
        <article className="rost-card">
          <div className="rost-card-head">
            <span className="rost-card-title">File d'attente</span>
            <button className="rost-btn" disabled={queueLoading} onClick={refreshQueue}>↻ Actualiser</button>
          </div>
          <RostError failure={queueError} />
          {loading ? <div className="rost-skel" style={{ height: 120 }} />
            : !queue ? <p className="rost-empty">File d'attente indisponible (worker injoignable).</p>
            : (() => {
              const tasks: (QueueTask & { state: string })[] = [
                ...queue.active.map((t) => ({ ...t, state: 'active' })),
                ...queue.reserved.map((t) => ({ ...t, state: 'reserved' })),
                ...queue.scheduled.map((t) => ({ ...t, state: 'scheduled' })),
              ];
              return (
                <>
                  <div className="rost-queue-counts">
                    <div className="rost-queue-stat"><span>{queue.counts.workers ?? 0}</span><em>Workers</em></div>
                    <div className="rost-queue-stat"><span>{queue.counts.active ?? 0}</span><em>En cours</em></div>
                    <div className="rost-queue-stat"><span>{queue.counts.reserved ?? 0}</span><em>Réservées</em></div>
                    <div className="rost-queue-stat"><span>{queue.counts.scheduled ?? 0}</span><em>Planifiées</em></div>
                  </div>
                  {queue.counts.workers === 0 && <p className="rost-error">Aucun worker connecté.</p>}
                  {tasks.length === 0 ? <p className="rost-empty">Aucune tâche en file.</p>
                    : (
                      <div className="rost-admin-table-wrap">
                        <table className="rost-admin-table">
                          <thead><tr><th>État</th><th>Tâche</th><th>ID</th><th>Args</th><th>Worker</th><th>ETA</th></tr></thead>
                          <tbody>
                            {tasks.map((t) => (
                              <tr key={`${t.state}-${t.id}`}>
                                <td><span className={`rost-chip rost-queue-${t.state}`}>{QUEUE_STATE_LABELS[t.state] ?? t.state}</span></td>
                                <td>{shortName(t.name)}</td>
                                <td>
                                  {t.id
                                    ? <button className="rost-id-btn" title={`Diagnostiquer ${t.id}`} onClick={() => runDiagnose(t.id!)}>{t.id.slice(0, 8)}…</button>
                                    : '—'}
                                </td>
                                <td className="rost-queue-args">{t.args ? JSON.stringify(t.args) : '—'}</td>
                                <td>{t.worker ?? '—'}</td>
                                <td>{fmtEta(t.eta)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </>
              );
            })()}
        </article>
        )}

        {/* ── Instagram — session (cookie sessionid) ── */}
        {adminSection === 'igsession' && (
        <article className="rost-card">
          <div className="rost-card-head"><span className="rost-card-title">Instagram — session</span></div>
          <div className="rost-ig-state">
            {igInfo?.configured ? (
              <>
                <span className="rost-dot on" />
                <span>
                  Session active{igInfo.username ? <> pour <strong>@{igInfo.username}</strong></> : ''}
                  {igInfo.updated_at && <> · enregistrée le {fmtDateTime(igInfo.updated_at)}</>}
                </span>
              </>
            ) : (
              <>
                <span className="rost-dot" />
                <span>Aucune session enregistrée.</span>
              </>
            )}
          </div>
          <p className="rost-hint">
            Quand le crawl renvoie une erreur 401/login, la session Instagram a expiré. Collez ici un nouveau cookie
            <strong> sessionid</strong> : connectez-vous sur instagram.com, puis DevTools (F12) → Application/Stockage →
            Cookies → <code>instagram.com</code> → <code>sessionid</code>. La valeur est validée puis enregistrée pour le worker de crawl.
          </p>
          <div className="rost-diag-form">
            <input
              className="rost-input"
              type="password"
              autoComplete="off"
              placeholder="Coller la valeur du cookie sessionid"
              value={igSession}
              onChange={(e) => setIgSession(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveIgSession(); }}
            />
            <button className="rost-btn" disabled={igSaving || !igSession.trim()} onClick={saveIgSession}>
              {igSaving ? 'Validation…' : 'Enregistrer la session'}
            </button>
          </div>
          <RostError failure={igError} />
          {igOk && <p className="rost-notice">{igOk}</p>}
        </article>
        )}

        {/* ── Instagram — diagnostic d'une tâche ── */}
        {adminSection === 'igdiag' && (
        <article className="rost-card">
          <div className="rost-card-head"><span className="rost-card-title">Instagram — diagnostic d'une tâche</span></div>
          <p className="rost-hint">
            Collez l'ID (requestId) d'une tâche — par ex. un crawl Instagram « planifié » dans la file ci-dessus —
            pour savoir son état et, si elle a planté, quand et pourquoi. Astuce : cliquez sur un ID dans la colonne « ID ».
          </p>
          <div className="rost-diag-form">
            <input
              className="rost-input"
              placeholder="requestId (ex. 3f2a9c14-…)"
              value={diagId}
              onChange={(e) => setDiagId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runDiagnose(); }}
            />
            <button className="rost-btn" disabled={diagLoading || !diagId.trim()} onClick={() => runDiagnose()}>
              {diagLoading ? 'Recherche…' : 'Diagnostiquer'}
            </button>
          </div>
          <RostError failure={diagError} />
          {diag && (
            <div className="rost-diag-result">
              <div><span className="rost-diag-label">État</span><span>{TASK_STATE_LABELS[diag.state] ?? diag.state}</span></div>
              <div><span className="rost-diag-label">Dernière exécution</span><span>{fmtDateTime(diag.finished_at)}</span></div>
              {diag.error && (
                <div><span className="rost-diag-label">Erreur</span><span className="rost-diag-err">{diag.error}</span></div>
              )}
              {!diag.known && (
                <p className="rost-empty">Cet ID est inconnu du backend, ou la tâche n'a pas encore démarré.</p>
              )}
            </div>
          )}
        </article>
        )}

        {/* ── Statut système ── */}
        {adminSection === 'systeme' && (
        <article className="rost-card">
          <div className="rost-card-head">
            <span className="rost-card-title">Statut système</span>
            <button className="rost-btn" onClick={() => checkHealth().then(setHealth)}>↻ Actualiser</button>
          </div>
          {loading ? <div className="rost-skel" style={{ height: 120 }} />
            : (
              <div className="rost-admin-health">
                {health.map((s) => (
                  <div className="rost-admin-health-item" key={s.name}>
                    <span className={`rost-dot ${s.status === 'ok' ? 'on' : ''}`} />
                    <span className="rost-admin-health-name">{s.name}</span>
                    <span className={`rost-admin-health-status s-${s.status}`}>{s.status === 'ok' ? 'opérationnel' : 'hors-ligne'}</span>
                  </div>
                ))}
              </div>
            )}
        </article>
        )}
          </div>
        </div>
      </div>
    </AuroraShell>
  );
}
