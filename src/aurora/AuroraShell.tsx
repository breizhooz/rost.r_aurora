import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useNotifications } from '../hooks/useNotifications';
import AuroraSearch from './AuroraSearch';
import AccountSwitcher from '../components/AccountSwitcher';
import ThemeSwitch from '../components/ThemeSwitch';
import './aurora.css';

export type AuroraScreen = 'dashboard' | 'journal' | 'semaine' | 'courses' | 'recettes' | 'hub' | 'profil' | 'comptes' | 'admin' | 'notifications';

// Nom « presque en entier » dérivé de l'email (UserOut n'expose pas de nom) :
// jean.dupont@ex.com → « Jean Dupont ».
function displayName(email?: string): string {
  if (!email) return '';
  return email.split('@')[0]
    .split(/[._-]/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function notifTimeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `il y a ${d}j`;
  if (h > 0) return `il y a ${h}h`;
  const m = Math.floor(diff / 60_000);
  return m > 0 ? `il y a ${m} min` : "à l'instant";
}

interface Props {
  screen: AuroraScreen;
  initials?: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

interface NavItem { screen: AuroraScreen; label: string; path: string; icon: React.ReactNode; }

const NAV: NavItem[] = [
  { screen: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { screen: 'journal', label: 'Journal', path: '/journal', icon: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" /> },
  { screen: 'semaine', label: 'Semaine', path: '/semaine', icon: <path d="M4 6h16v14H4zM4 6V4M8 3v4M16 3v4M20 6V4M4 10h16" /> },
  { screen: 'courses', label: 'Courses', path: '/courses', icon: <path d="M3 4h2l2 12h12l2-8H6M9 20a1 1 0 1 1 0 2a1 1 0 0 1 0-2zM17 20a1 1 0 1 1 0 2a1 1 0 0 1 0-2z" /> },
  { screen: 'recettes', label: 'Recettes', path: '/recettes', icon: <path d="M6 3v8a3 3 0 0 0 6 0V3M9 3v18M18 3c-1.5 1-2 3-2 6s.5 5 2 6v6" /> },
  { screen: 'hub', label: 'Le Hub', path: '/hub', icon: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z" /> },
  { screen: 'profil', label: 'Profil', path: '/profil', icon: <path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" /> },
];

const COMPTES_NAV: NavItem = {
  screen: 'comptes', label: 'Mes clients', path: '/comptes',
  icon: <path d="M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.8M18 20c0-2.4-1.4-4.2-3.5-4.8" />,
};

const ADMIN_NAV: NavItem = {
  screen: 'admin', label: 'Admin', path: '/admin',
  icon: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6zM9.5 12l1.8 1.8L15 10" />,
};

export default function AuroraShell({ screen, initials, title, subtitle, children }: Props) {
  const navigate = useNavigate();
  const { isAdmin, isCoach, user } = useCurrentUser();
  const userName = displayName(user?.email);
  const { logout: ctxLogout } = useAuthContext();
  const { active } = useAccount();
  // Bandeau persistant : visible uniquement quand on travaille sur le compte d'un
  // client (pas sur son propre compte), pour rappeler en permanence sur QUI on agit.
  const showContext = !!active && !active.is_default;
  const { items: notifs, unread, markSeen } = useNotifications();
  // « Mon équipe » : réservé aux coachs (capacité is_coach) et aux admins
  // plateforme. Un simple propriétaire de son compte (ex. un client) n'y a pas accès.
  const canManage = isCoach || isAdmin;
  const navItems = [
    ...NAV,
    ...(canManage ? [COMPTES_NAV] : []),
    ...(isAdmin ? [ADMIN_NAV] : []),
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // Rail latéral (desktop) : réduit aux icônes par défaut, déployable. L'état
  // « épinglé » (reste ouvert) est mémorisé d'une session à l'autre.
  const [railPinned, setRailPinned] = useState(() => {
    try { return localStorage.getItem('aurora.rail.pinned') === '1'; } catch { return false; }
  });
  const toggleRail = () => setRailPinned((v) => {
    const next = !v;
    try { localStorage.setItem('aurora.rail.pinned', next ? '1' : '0'); } catch { /* stockage indispo */ }
    return next;
  });

  const openNotif = () => { setNotifOpen((v) => { const next = !v; if (next) markSeen(); return next; }); };

  const go = (path: string) => { navigate(path); setMenuOpen(false); };

  const logout = async () => {
    await ctxLogout();
    navigate('/login');
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setUserMenuOpen(false); setNotifOpen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="aurora-root">
      <div className={`rost-app${menuOpen ? ' menu-open' : ''}${railPinned ? ' rail-pinned' : ''}`}>
        {menuOpen && <div className="rost-side-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={`rost-side${menuOpen ? ' is-open' : ''}${railPinned ? ' is-pinned' : ''}`}>
          <div className="rost-brand">
            <button className="rost-rail-emblem" aria-label="Déployer le menu" onClick={toggleRail}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
              </svg>
            </button>
            <img className="rost-brand-logo" src="/aurora/titre-sombre-logo.png" alt="Rost.r" />
            <button
              className="rost-rail-toggle"
              aria-label="Réduire le menu"
              onClick={toggleRail}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>

          <nav className="rost-nav">
            {navItems.map((item) => (
              <button
                key={item.screen}
                className="rost-nav-item"
                aria-selected={screen === item.screen}
                title={item.label}
                onClick={() => go(item.path)}
              >
                <svg className="rost-nav-ico" viewBox="0 0 24 24">{item.icon}</svg>
                <span className="rost-nav-label">{item.label}</span>
                <span className="rost-nav-dot" />
              </button>
            ))}
          </nav>

          <div className="rost-side-foot">
            <div className="rost-usermenu rost-foot-user">
              <button
                className="rost-foot-userbtn"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Menu utilisateur"
                title={userName || undefined}
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <span className="rost-avatar">{initials ?? '…'}</span>
                <span className="rost-foot-username">{userName}</span>
              </button>
              {userMenuOpen && (
                <>
                  <div className="rost-usermenu-backdrop" onClick={() => setUserMenuOpen(false)} />
                  <div className="rost-usermenu-dropdown" role="menu">
                    <button role="menuitem" onClick={() => { setUserMenuOpen(false); navigate('/profil'); }}>
                      <span aria-hidden="true">👤</span> Profil
                    </button>
                    <button role="menuitem" onClick={() => { setUserMenuOpen(false); navigate('/notifications'); }}>
                      <span aria-hidden="true">🔔</span> Notifications
                      {unread > 0 && <span className="rost-usermenu-badge">{unread > 9 ? '9+' : unread}</span>}
                    </button>
                    <button role="menuitem" onClick={() => { setUserMenuOpen(false); navigate('/profil?section=securite'); }}>
                      <span aria-hidden="true">🔒</span> Sécurité
                    </button>
                    <button role="menuitem" onClick={() => { setUserMenuOpen(false); navigate('/profil?section=confidentialite'); }}>
                      <span aria-hidden="true">🛡️</span> Confidentialité
                    </button>
                    <button role="menuitem" className="rost-usermenu-danger" onClick={logout}>
                      <span aria-hidden="true">⎋</span> Déconnexion
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="rost-main">
          <div className="rost-header">
            <div className="rost-header-left">
              <button className="rost-menu-toggle" aria-label="Ouvrir le menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
              </button>
              <div>
                {title && <h1>{title}</h1>}
                {subtitle && <div className="sub">{subtitle}</div>}
                {showContext && active && (
                  <div className="rost-context-chip" title={`Vous travaillez sur le compte de ${active.name}`}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.8M18 20c0-2.4-1.4-4.2-3.5-4.8" />
                    </svg>
                    <span className="rost-context-label">Client&nbsp;:</span>
                    <strong>{active.name}</strong>
                  </div>
                )}
              </div>
            </div>
            <div className="rost-header-right">
              <AuroraSearch />
              <AccountSwitcher />
              <span className="rost-themeswitch"><ThemeSwitch /></span>
              <div className="rost-notifmenu">
                <button
                  className="rost-bell"
                  aria-haspopup="menu"
                  aria-expanded={notifOpen}
                  aria-label={unread > 0 ? `Notifications, ${unread} non lue(s)` : 'Notifications'}
                  onClick={openNotif}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  {unread > 0 && <span className="rost-bell-badge">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {notifOpen && (
                  <>
                    <div className="rost-usermenu-backdrop" onClick={() => setNotifOpen(false)} />
                    <div className="rost-notif-dropdown" role="menu">
                      <div className="rost-notif-dropdown-head">Notifications</div>
                      {notifs.length === 0 ? (
                        <div className="rost-notif-dropdown-empty">Aucune notification.</div>
                      ) : (
                        notifs.slice(0, 5).map((n) => (
                          <button
                            key={n.slug}
                            role="menuitem"
                            className={`rost-notif-item${n.type === 'system' || n.type === 'macro_error' ? ' is-warning' : ''}`}
                            onClick={() => { setNotifOpen(false); navigate('/notifications'); }}
                          >
                            <span className="rost-notif-item-title">{n.title}</span>
                            <span className="rost-notif-item-text">{n.body}</span>
                            <span className="rost-notif-item-time">{notifTimeSince(n.created_at)}</span>
                          </button>
                        ))
                      )}
                      <button
                        role="menuitem"
                        className="rost-notif-seeall"
                        onClick={() => { setNotifOpen(false); navigate('/notifications'); }}
                      >
                        Voir toutes les notifications →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
