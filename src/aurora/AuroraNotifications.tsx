import { useEffect } from 'react';
import AuroraShell from './AuroraShell';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useNotifications } from '../hooks/useNotifications';
import type { NotificationItem } from '../types';

function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `il y a ${d}j`;
  if (h > 0) return `il y a ${h}h`;
  const m = Math.floor(diff / 60_000);
  if (m > 0) return `il y a ${m} min`;
  return "à l'instant";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Type de notif → ton visuel (warning pour les blocages/erreurs, info sinon).
function isWarning(type: string): boolean {
  return type === 'system' || type === 'macro_error';
}

function notifIcon(type: string): string {
  if (isWarning(type)) return '⚠️';
  if (type === 'recipe_import_done') return '✅';
  return '🔔';
}

function NotifRow({ n }: { n: NotificationItem }) {
  return (
    <div className={`rost-notif-card${isWarning(n.type) ? ' is-warning' : ''}`}>
      <span className="rost-notif-ico" aria-hidden="true">{notifIcon(n.type)}</span>
      <div className="rost-notif-body">
        <div className="rost-notif-title">{n.title}</div>
        <div className="rost-notif-text">{n.body}</div>
        <div className="rost-notif-meta" title={formatDate(n.created_at)}>{timeSince(n.created_at)} · {formatDate(n.created_at)}</div>
      </div>
    </div>
  );
}

export default function AuroraNotifications() {
  const { user } = useCurrentUser();
  const { items, loading, markSeen } = useNotifications();

  // Visiter la page = tout marquer comme vu (le badge de la cloche se vide).
  useEffect(() => { markSeen(); }, [markSeen]);

  return (
    <AuroraShell
      screen="notifications"
      initials={user ? initials(user.email) : undefined}
      title="Notifications"
      subtitle={items.length ? `${items.length} notification${items.length > 1 ? 's' : ''}` : undefined}
    >
      <div className="rost-card" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="rost-rd-text" style={{ color: 'var(--dim)' }}>Chargement…</p>
        ) : items.length === 0 ? (
          <div className="rost-empty">
            <span className="rost-notif-ico" aria-hidden="true">🔔</span>
            <p>Aucune notification pour le moment.</p>
          </div>
        ) : (
          <div className="rost-notif-list">
            {items.map((n) => <NotifRow key={n.slug} n={n} />)}
          </div>
        )}
      </div>
    </AuroraShell>
  );
}
