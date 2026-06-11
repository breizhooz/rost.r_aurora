import { NavLink } from 'react-router-dom';
import styles from './TabNav.module.css';

const TABS = [
  { label: 'Tableau de bord', path: '/old/dashboard' },
  { label: 'Journal',         path: '/old/journal' },
  { label: 'Menus',           path: '/old/menus' },
  { label: 'Courses',         path: '/old/courses' },
  { label: 'Recettes',        path: '/old/recettes' },
  { label: 'Le Hub',          path: '/old/hub' },
  { label: 'Profil',          path: '/old/profile' },
];

export default function TabNav() {
  return (
    <nav className={styles.tabNav}>
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.active : ''}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
