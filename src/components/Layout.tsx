import { useNavigate } from 'react-router-dom';
import SearchBar from './SearchBar';
import TabNav from './TabNav';
import ThemeSwitch from './ThemeSwitch';
import { useAuthContext } from '../context/AuthContext';
import styles from './Layout.module.css';

interface Props {
  children: React.ReactNode;
  userEmail?: string | null;
}

function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}

export default function Layout({ children, userEmail }: Props) {
  const navigate = useNavigate();
  const { logout: ctxLogout } = useAuthContext();

  const logout = async () => {
    await ctxLogout();
    navigate('/login');
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.nav}>
        <div className={styles.navLeft}>
          <div className={styles.navLogo} onClick={() => navigate('/old/dashboard')} role="link" tabIndex={0}>
            <LeafSvg />
            <span>NutriPlanner</span>
          </div>
        </div>

        <div className={styles.navCenter}>
          <SearchBar />
        </div>

        <div className={styles.navRight}>
          <button
            onClick={() => navigate('/dashboard')}
            title="Revenir à l'interface Aurora"
            style={{
              cursor: 'pointer',
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px solid #FF6B00',
              background: 'transparent',
              color: '#FF6B00',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            ✦ Aurora
          </button>
          <ThemeSwitch />
          <button
            className={styles.avatarBtn}
            onClick={() => navigate('/old/profile')}
            title="Voir le profil"
          >
            <span className={styles.avatar}>
              {userEmail ? initials(userEmail) : '…'}
            </span>
            {userEmail && (
              <span className={styles.avatarEmail}>{userEmail}</span>
            )}
          </button>
          <button className={styles.logoutBtn} onClick={logout}>
            Déconnexion
          </button>
        </div>
      </nav>

      <TabNav />

      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}

function LeafSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C12 2 4 7.5 4 14a8 8 0 0016 0C20 7.5 12 2 12 2Z"
        fill="currentColor" opacity="0.25" />
      <path d="M12 2C12 2 4 7.5 4 14a8 8 0 0016 0C20 7.5 12 2 12 2Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 22V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
