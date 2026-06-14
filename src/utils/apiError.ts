// Extraction unifiée du message d'erreur d'une réponse API.
//
// Le backend enveloppe TOUTES ses erreurs en `{ error: { code, message } }`
// (cf. nutri_shared/errors/handlers.py). On lit donc `error.message` en priorité,
// avec repli sur `detail` (forme FastAPI par défaut) puis `message` (sécurité),
// et enfin le message générique fourni par l'appelant.

interface ApiErrorData {
  error?: { message?: unknown };
  detail?: unknown;
  message?: unknown;
}

/** Message d'erreur depuis le `data` d'une réponse (sans l'enveloppe Axios). */
export function errorMessageFromData(data: unknown): string | null {
  const d = data as ApiErrorData | undefined;
  if (typeof d?.error?.message === 'string') return d.error.message;
  if (typeof d?.detail === 'string') return d.detail;
  if (typeof d?.message === 'string') return d.message;
  return null;
}

/** Message d'erreur depuis une erreur Axios, avec repli générique. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return errorMessageFromData(data) ?? fallback;
}
