// Décodage *en lecture seule* (non vérifié) de l'access token de contexte gardé
// en mémoire (SEC-05). Le backend reste l'autorité : ce décodage sert uniquement
// à piloter l'UI (compte actif, rôle, scopes) — afficher/masquer un écran, pré-
// remplir l'account_id. Ne jamais s'en servir pour une décision de sécurité.

import { getAccessToken } from '../api/tokenStore';
import type { AccountRole } from '../types';

export interface AccessContext {
  /** Identité connectée (sujet du JWT). */
  sub: string | null;
  /** Compte actif porté par le token de contexte. */
  actAccount: string | null;
  /** Rôle de l'identité sur le compte actif. */
  role: AccountRole | null;
  /** Scopes effectifs sur le compte actif. */
  scopes: string[];
  /** Admin de plateforme (SAV) : court-circuite les scopes côté backend. */
  userAdmin: boolean;
}

const EMPTY: AccessContext = {
  sub: null,
  actAccount: null,
  role: null,
  scopes: [],
  userAdmin: false,
};

function base64UrlDecode(part: string): string {
  const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

/** Décode le payload du token courant (ou d'un token fourni). */
export function decodeAccessContext(token: string | null = getAccessToken()): AccessContext {
  if (!token) return EMPTY;
  const parts = token.split('.');
  if (parts.length < 2) return EMPTY;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : null,
      actAccount: typeof payload.act_account === 'string' ? payload.act_account : null,
      role: typeof payload.role === 'string' ? (payload.role as AccountRole) : null,
      scopes: Array.isArray(payload.scopes)
        ? payload.scopes.filter((s): s is string => typeof s === 'string')
        : [],
      userAdmin: payload.user_admin === true,
    };
  } catch {
    return EMPTY;
  }
}

/** Vrai si l'identité peut gérer les membres du compte actif (scope member:manage). */
export function canManageMembers(ctx: AccessContext = decodeAccessContext()): boolean {
  return ctx.userAdmin || ctx.scopes.includes('member:manage');
}
