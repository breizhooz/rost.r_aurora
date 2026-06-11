import { useState } from 'react';
import { grafanaHint, type GrafanaHint } from '../utils/grafana';

export interface RostFailure {
  message: string;
  hint?: GrafanaHint;
}

/** Construit un échec affichable + la recherche Grafana associée à l'erreur. */
export function fail(message: string, e: unknown, service: string): RostFailure {
  return { message, hint: grafanaHint(e, service) };
}

/** Erreur de l'admin : message + recherche Loki prête à coller dans Grafana. */
export default function RostError({ failure }: { failure: RostFailure | null }) {
  const [copied, setCopied] = useState(false);
  if (!failure) return null;
  const { message, hint } = failure;

  async function copy() {
    if (!hint) return;
    try {
      await navigator.clipboard.writeText(hint.query);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible : l'utilisateur copie la requête à la main */
    }
  }

  return (
    <div className="rost-error-block">
      <p className="rost-error">{message}</p>
      {hint && (
        <div className="rost-grafana">
          <div className="rost-grafana-head">Recherche Grafana (Loki)</div>
          <div className="rost-grafana-row">
            <code className="rost-grafana-query">{hint.query}</code>
            <div className="rost-grafana-actions">
              <button type="button" className="rost-copy-btn" onClick={copy}>
                {copied ? '✓ Copié' : 'Copier'}
              </button>
              <a className="rost-grafana-link" href={hint.url} target="_blank" rel="noreferrer">
                ↗ Ouvrir dans Grafana
              </a>
            </div>
          </div>
          {!hint.hasTrace && (
            <p className="rost-grafana-note">
              Pas de trace_id (service injoignable) — recherche de repli par service ;
              ajustez la fenêtre temporelle dans Grafana.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
