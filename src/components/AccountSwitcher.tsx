import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../context/AccountContext';

/**
 * Sélecteur « Travailler sur : Moi / mes clients » (modèle gestionnaire→clients).
 *
 * Pour un gestionnaire (ou admin), liste son propre compte (« Moi ») + les
 * comptes clients qu'il gère (rôle délégué). Choisir une entrée bascule le
 * contexte : recettes, menus, dashboard et journal reflètent alors ce compte.
 * Masqué pour un client (un seul compte accessible : le sien).
 */
export default function AccountSwitcher() {
  const navigate = useNavigate();
  const { accounts, activeId, active, switchTo } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Entrées du sélecteur : mon compte (« Moi ») + mes comptes clients (gérés).
  const entries = accounts.filter((a) => a.is_default || a.role === 'COACH');
  const label = (a: { is_default: boolean; name: string }) => (a.is_default ? 'Moi' : a.name);

  const select = async (id: string) => {
    if (busy) return;
    setOpen(false);
    if (id === activeId) {
      navigate('/dashboard');
      return;
    }
    setBusy(true);
    try {
      await switchTo(id);
      navigate('/dashboard');
    } catch {
      /* on garde le compte courant si le switch échoue */
    } finally {
      setBusy(false);
    }
  };

  // Pas de sélecteur si on n'a qu'un compte (cas client) ou liste indisponible.
  if (entries.length <= 1 || !active) return null;

  return (
    <div className="rost-usermenu">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Travailler sur : ${label(active)}. Changer`}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 220,
          padding: '7px 12px',
          borderRadius: 999,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          color: 'var(--ink)',
          cursor: busy ? 'wait' : 'pointer',
          font: 'inherit',
          fontSize: 13,
        }}
      >
        <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>Sur&nbsp;:</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
          {label(active)}
        </span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="rost-usermenu-backdrop" onClick={() => setOpen(false)} />
          <div className="rost-usermenu-dropdown" role="menu" aria-label="Travailler sur">
            <div
              style={{
                padding: '6px 12px 8px',
                fontSize: 11,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                opacity: 0.6,
                color: 'var(--ink)',
              }}
            >
              Travailler sur
            </div>
            {entries.map((a) => (
              <button
                key={a.id}
                role="menuitemradio"
                aria-checked={a.id === activeId}
                onClick={() => select(a.id)}
              >
                <span aria-hidden="true">{a.id === activeId ? '●' : '○'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label(a)}
                </span>
                {!a.is_default && (
                  <span className="rost-usermenu-badge" style={{ background: 'transparent', color: 'var(--rost-accent)', fontWeight: 700 }}>
                    client
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
