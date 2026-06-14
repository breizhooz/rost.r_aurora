import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useAccount } from '../context/AccountContext';
import { decodeAccessContext } from '../utils/accessContext';
import { apiErrorMessage } from '../utils/apiError';
import {
  listInvitations,
  inviteMember,
  cancelInvitation,
  leaveAccount,
  listAudit,
} from '../api/endpoints';
import type { AuditEntry, Invitation } from '../types';
import './aurora.css';

/**
 * « Mes clients » — espace du gestionnaire (et de l'admin).
 *
 * Modèle simplifié (Admin / Gestionnaire / Client) : un gestionnaire invite des
 * clients, voit la liste des comptes qu'il gère, et peut couper un lien. Le
 * client, lui, n'a pas accès à cet écran (il révoque son gestionnaire depuis
 * Profil → Mon gestionnaire).
 */

type Section = 'clients' | 'invitations' | 'activite';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'clients', label: 'Mes clients' },
  { id: 'invitations', label: 'Inviter un client' },
  { id: 'activite', label: 'Activité' },
];

const AUDIT_LABEL: Record<string, string> = {
  'coach_link.created': 'Invitation client envoyée',
  'coach_link.accepted': 'Client a accepté',
  'invitation.created': 'Invitation envoyée',
  'invitation.accepted': 'Invitation acceptée',
  'invitation.cancelled': 'Invitation annulée',
  'member.left': 'Lien coupé',
  'member.revoked': 'Lien révoqué',
};

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}
function fmtDateTime(d: string): string {
  try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
}
function errMessage(err: unknown): string {
  return apiErrorMessage(err, err instanceof Error ? err.message : 'Une erreur est survenue');
}

export default function AuroraComptes() {
  const navigate = useNavigate();
  const { user, isAdmin, isCoach } = useCurrentUser();
  const { activeId, accounts, switchTo, reloadAccounts } = useAccount();
  // Comptes clients que l'identité gère (rôle délégué sur le compte du client).
  const clientAccounts = accounts.filter((a) => a.role === 'COACH');
  // Contexte du compte actif (le gestionnaire invite/journalise depuis SON compte).
  const ctx = useMemo(() => decodeAccessContext(), [activeId]);
  const accountId = ctx.actAccount;

  const [section, setSection] = useState<Section>('clients');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [inv, a] = await Promise.all([
        listInvitations(accountId),
        listAudit(accountId),
      ]);
      setInvitations(inv);
      setAudit(a);
      setError('');
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { void reload(); }, [reload]);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || inviting || !accountId) return;
    setInviting(true);
    setInviteErr('');
    try {
      // Lien de gestion (le rôle est imposé côté backend).
      await inviteMember(accountId, inviteEmail.trim(), 'VIEWER', 'coach_link');
      setInviteEmail('');
      void reload();
    } catch (err) { setInviteErr(errMessage(err)); }
    finally { setInviting(false); }
  };

  const onCancelInvite = async (inv: Invitation) => {
    if (!accountId) return;
    setError('');
    try {
      await cancelInvitation(accountId, inv.id);
      setInvitations((prev) => prev.filter((x) => x.id !== inv.id));
    } catch (err) { setError(errMessage(err)); }
  };

  const onOpenClient = async (id: string) => {
    try {
      await switchTo(id);
      navigate('/dashboard');
    } catch (err) { setError(errMessage(err)); }
  };

  const onLeaveClient = async (id: string, name: string) => {
    if (!window.confirm(`Couper le lien avec ${name} ? Vous perdrez l'accès à son compte.`)) return;
    setLeavingId(id);
    setError('');
    try {
      await leaveAccount(id);
      await reloadAccounts();
    } catch (err) { setError(errMessage(err)); }
    finally { setLeavingId(null); }
  };

  const inviteLink = (inv: Invitation): string =>
    `${window.location.origin}/accept-invite?token=${inv.token}`;

  const copyLink = async (inv: Invitation) => {
    try {
      await navigator.clipboard.writeText(inviteLink(inv));
      setCopied(inv.id);
      setTimeout(() => setCopied((c) => (c === inv.id ? null : c)), 1800);
    } catch { /* presse-papiers indisponible */ }
  };

  return (
    <AuroraShell screen="comptes" initials={user ? initials(user.email) : undefined}
      title="Mes clients" subtitle="Gérez les comptes que vous suivez">
      <div className="rost-page">
        {!(isCoach || isAdmin) ? (
          <article className="rost-card">
            <p className="rost-card-intro">
              Cet espace est réservé aux <strong>gestionnaires</strong> et aux <strong>administrateurs</strong>.
              Si un gestionnaire vous suit, retrouvez-le dans <strong>Profil → Mon gestionnaire</strong>.
            </p>
          </article>
        ) : (
          <div className="rost-binder rost-grid-full">
            <nav className="rost-binder-nav" aria-label="Sections">
              {SECTIONS.map((s) => (
                <button key={s.id} type="button"
                  className={`rost-binder-tab ${section === s.id ? 'is-active' : ''}`}
                  aria-current={section === s.id}
                  onClick={() => setSection(s.id)}>{s.label}</button>
              ))}
            </nav>
            <div className="rost-binder-panel">
              {error && <p className="rost-error">{error}</p>}

              {/* ══ MES CLIENTS ══ */}
              {section === 'clients' && (
                <article className="rost-card">
                  <div className="rost-card-head"><span className="rost-card-title">Mes clients</span></div>
                  <p className="rost-card-intro">
                    Les comptes que vous gérez : vous y poussez des recettes et y générez le menu.
                    Sélectionnez « Travailler sur » en haut pour basculer sur un client. Pour en
                    ajouter, allez dans
                    <button type="button" className="rost-role-hint-link" onClick={() => setSection('invitations')}> Inviter un client</button>.
                  </p>
                  {clientAccounts.length === 0 ? (
                    <p className="rost-empty">Aucun client pour l’instant.</p>
                  ) : (
                    <div className="rost-member-list">
                      {clientAccounts.map((c) => (
                        <div className="rost-member-row" key={c.id}>
                          <div className="rost-member-id">
                            <span className="rost-member-avatar" aria-hidden="true">{initials(c.name)}</span>
                            <div className="rost-member-meta">
                              <span className="rost-member-email">{c.name}</span>
                              <span className="rost-member-substatus">Vous gérez ce compte</span>
                            </div>
                          </div>
                          <div className="rost-member-actions">
                            <button className="rost-btn" type="button" onClick={() => onOpenClient(c.id)}>
                              Ouvrir
                            </button>
                            <button className="rost-btn rost-btn-danger" type="button"
                              disabled={leavingId === c.id}
                              onClick={() => onLeaveClient(c.id, c.name)}>
                              {leavingId === c.id ? '…' : 'Couper le lien'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}

              {/* ══ INVITER UN CLIENT ══ */}
              {section === 'invitations' && (
                <article className="rost-card">
                  <div className="rost-card-head"><span className="rost-card-title">Inviter un client</span></div>
                  <form className="rost-form" onSubmit={onInvite}>
                    <p className="rost-card-intro">
                      Saisissez l’email du client. Il recevra un lien ; en l’acceptant, il vous
                      accorde l’accès à <strong>son</strong> compte. Vous pourrez alors y pousser des
                      recettes et générer son menu. Il reste propriétaire de ses données et peut
                      retirer votre accès à tout moment.
                    </p>
                    <div className="rost-form-grid">
                      <label className="rost-form-group">
                        <span>Email du client</span>
                        <input className="rost-form-input" type="email" required
                          placeholder="prenom@exemple.fr" value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)} />
                      </label>
                    </div>
                    {inviteErr && <p className="rost-error">{inviteErr}</p>}
                    <button className="rost-add-btn" type="submit" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? 'Envoi…' : 'Inviter ce client'}
                    </button>
                  </form>

                  <div className="rost-card-head" style={{ marginTop: 24 }}>
                    <span className="rost-card-title">Invitations en attente</span>
                  </div>
                  {loading ? <div className="rost-skel" style={{ height: 80 }} />
                    : invitations.length === 0 ? <p className="rost-empty">Aucune invitation en attente.</p>
                    : (
                    <div className="rost-member-list">
                      {invitations.map((inv) => (
                        <div className="rost-member-row" key={inv.id}>
                          <div className="rost-member-id">
                            <div className="rost-member-meta">
                              <span className="rost-member-email">{inv.email}</span>
                              <span className="rost-member-substatus">
                                expire le {fmtDateTime(inv.expires_at)}
                              </span>
                            </div>
                          </div>
                          <div className="rost-member-actions">
                            <button className="rost-btn rost-btn-ghost" type="button" onClick={() => copyLink(inv)}>
                              {copied === inv.id ? '✓ Copié' : 'Copier le lien'}
                            </button>
                            <button className="rost-btn rost-btn-danger" type="button" onClick={() => onCancelInvite(inv)}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}

              {/* ══ ACTIVITÉ ══ */}
              {section === 'activite' && (
                <article className="rost-card">
                  <div className="rost-card-head"><span className="rost-card-title">Journal d’activité</span></div>
                  {loading ? <div className="rost-skel" style={{ height: 120 }} />
                    : audit.length === 0 ? <p className="rost-empty">Aucune activité enregistrée.</p>
                    : (
                    <div className="rost-timeline">
                      {audit.map((e) => (
                        <div className="rost-tl-entry" key={e.id}>
                          <span className="rost-tl-date">{fmtDateTime(e.created_at)}</span>
                          <div className="rost-tl-data">
                            <span className="rost-tl-stat">{AUDIT_LABEL[e.action] ?? e.action}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}
            </div>
          </div>
        )}
      </div>
    </AuroraShell>
  );
}
