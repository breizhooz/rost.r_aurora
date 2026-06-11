import { useTheme } from '../context/ThemeContext';
import styles from './ThemeSwitch.module.css';

interface Props {
  floating?: boolean;
}

export default function ThemeSwitch({ floating }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const cls = [
    styles.root,
    isLight ? styles.isLight : '',
    floating ? styles.floating : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      onClick={toggleTheme}
      aria-label={isLight ? 'Passer en mode sombre' : 'Passer en mode clair'}
      title={isLight ? 'Mode sombre' : 'Mode clair'}
      type="button"
    >
      <SunIcon />
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
      <MoonIcon />
    </button>
  );
}

function SunIcon() {
  return (
    <svg className={styles.sun} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className={styles.moon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill="currentColor" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
