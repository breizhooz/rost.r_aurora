import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuroraData } from '../aurora/useAuroraData';
import styles from './Dashboard.module.css';

type Period = '3d' | 'week' | 'month';
const PERIOD_DAYS: Record<Period, number> = { '3d': 3, week: 7, month: 31 };
const PERIOD_LABEL: Record<Period, string> = { '3d': '3 jours', week: 'Semaine', month: 'Mois' };

function pct(v: number, g: number) { return g <= 0 ? 0 : Math.min(100, Math.round((v / g) * 100)); }

export default function JournalPage() {
  const { vm, loading } = useAuroraData();
  const [period, setPeriod] = useState<Period>('week');

  const entries = useMemo(() => {
    if (!vm) return [];
    const days = PERIOD_DAYS[period];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return vm.journal.filter((e) => {
      const ed = new Date(e.ts); ed.setHours(0, 0, 0, 0);
      const diff = Math.round((start.getTime() - ed.getTime()) / 86400000);
      return diff >= 0 && diff < days;
    });
  }, [vm, period]);

  const stats = vm ? [
    { l: 'Calories', v: vm.today.kcal, g: vm.goal.kcal, u: 'kcal' },
    { l: 'Protéines', v: vm.today.protein, g: vm.goal.protein, u: 'g' },
    { l: 'Glucides', v: vm.today.carbs, g: vm.goal.carbs, u: 'g' },
    { l: 'Lipides', v: vm.today.fat, g: vm.goal.fat, u: 'g' },
  ] : [];

  return (
    <Layout userEmail={vm?.user.email}>
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1>Journal alimentaire</h1>
          <p>{loading ? 'Chargement…' : `Repas planifiés — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}</p>
        </div>

        {/* Totaux du jour */}
        <div className={styles.topRow} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {(loading ? Array.from({ length: 4 }).map(() => null) : stats).map((s, i) => (
            <div className={styles.card} key={i}>
              <div className={styles.sectionLabel}>{s ? s.l : '—'}</div>
              {s && (
                <>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {s.v}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: 4 }}>{s.u}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Objectif {s.g} {s.u} · {pct(s.v, s.g)}%
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct(s.v, s.g)}%`, background: 'var(--accent)', borderRadius: 2 }} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Log des repas planifiés */}
        <div className={styles.card} style={{ marginTop: '1.5rem' }}>
          <div className={styles.sectionLabel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Repas planifiés</span>
            <span style={{ display: 'flex', gap: 6 }}>
              {(['3d', 'week', 'month'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: '0.7rem',
                    border: `1px solid ${period === p ? 'var(--accent)' : 'var(--border)'}`,
                    background: period === p ? 'var(--accent-dim)' : 'transparent',
                    color: period === p ? 'var(--accent)' : 'var(--text-secondary)',
                    textTransform: 'none', letterSpacing: 0,
                  }}
                >{PERIOD_LABEL[p]}</button>
              ))}
            </span>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Chargement…</p>
          ) : entries.length === 0 ? (
            <div className={styles.emptyState}>Aucun repas planifié sur cette période. Générez un menu depuis la page Menus.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {entries.map((j, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '180px 110px 1fr auto', gap: 16, alignItems: 'center',
                  padding: '14px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{j.when}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1,
                    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', padding: '4px 10px',
                    borderRadius: 999, textAlign: 'center', fontWeight: 600,
                  }}>{j.slot}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{j.title}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--accent)' }}>{j.kcal}</strong> kcal · {j.p}P {j.c}C {j.f}F
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}
