import axios from 'axios';

// Construit une recherche Loki prête à coller dans Grafana à partir d'une erreur
// d'appel API. Quand la réponse porte l'en-tête `X-Trace-Id` (posé par le
// RequestLoggingMiddleware backend), on cible la requête exacte via le label
// Loki `trace_id`. Sinon (service injoignable, pas de réponse HTTP) on retombe
// sur une recherche large scopée au service concerné.

const GRAFANA_BASE = 'https://grafana.localhost';
const LOKI_DATASOURCE_UID = 'loki';

export interface GrafanaHint {
  /** Requête LogQL à coller dans Grafana / Loki. */
  query: string;
  /** Deep-link vers l'Explore Grafana pré-rempli. */
  url: string;
  /** true si la requête cible un trace_id précis, false si repli par service. */
  hasTrace: boolean;
}

function traceIdFromError(e: unknown): string | undefined {
  if (!axios.isAxiosError(e)) return undefined;
  const raw = e.response?.headers?.['x-trace-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function exploreUrl(query: string): string {
  // Format `panes` de l'Explore Grafana (Grafana ≥ 10), fenêtre par défaut 1h.
  const panes = {
    nutri: {
      datasource: LOKI_DATASOURCE_UID,
      queries: [
        { refId: 'A', expr: query, datasource: { type: 'loki', uid: LOKI_DATASOURCE_UID } },
      ],
      range: { from: 'now-1h', to: 'now' },
    },
  };
  const params = new URLSearchParams({
    schemaVersion: '1',
    panes: JSON.stringify(panes),
    orgId: '1',
  });
  return `${GRAFANA_BASE}/explore?${params.toString()}`;
}

/**
 * Dérive la recherche Grafana à proposer pour une erreur survenue dans l'admin.
 * @param e      l'erreur capturée (idéalement une AxiosError).
 * @param service le service backend visé par l'appel (pour le repli sans trace).
 */
export function grafanaHint(e: unknown, service: string): GrafanaHint {
  const traceId = traceIdFromError(e);
  // `trace_id` et `level` sont tous deux des labels Loki (extraits par promtail),
  // donc directement utilisables dans le sélecteur de flux.
  const query = traceId
    ? `{trace_id="${traceId}"}`
    : `{service="${service}", level="error"}`;
  return { query, url: exploreUrl(query), hasTrace: Boolean(traceId) };
}
