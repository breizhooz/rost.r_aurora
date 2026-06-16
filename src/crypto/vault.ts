// Coffre de la User Key (UK) côté client (E2E).
//
// La UK (dé)chiffre les blobs santé/menu. Compromis de persistance :
//  - mémoire (rapide) ET `sessionStorage` (survit au rechargement F5 dans
//    l'onglet, effacé à la fermeture de l'onglet et au logout).
//  - PAS `localStorage` : on ne veut pas que la clé persiste après fermeture.
//
// Trade-off de sécurité assumé : la UK en sessionStorage est lisible par du JS
// (donc exfiltrable par une XSS). C'est le prix d'une UX utilisable (sinon le
// coffre se reverrouille à chaque F5). L'access token suit la même logique de
// session. Durcissement futur possible : WebAuthn PRF (cf. plan_dpo.md §5).

import { toBase64, fromBase64 } from '@nutri/e2e-core';

const STORAGE_KEY = 'nutri.uk';

let userKey: Uint8Array | null = null;

/** Levée quand le coffre est verrouillé (UK absente) : impossible de (dé)chiffrer. */
export class VaultLockedError extends Error {
  constructor(message = 'Coffre verrouillé : déverrouille ta session pour accéder à tes données chiffrées.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export function getUserKey(): Uint8Array | null {
  if (userKey) return userKey;
  // Restauration après un rechargement de page (F5) : la mémoire est repartie de
  // zéro mais sessionStorage a conservé la clé pour la durée de l'onglet.
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) userKey = fromBase64(stored);
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* sessionStorage indispo */ }
  }
  return userKey;
}

/** Renvoie la UK ou lève {@link VaultLockedError} si le coffre est verrouillé. */
export function requireUserKey(): Uint8Array {
  const key = getUserKey();
  if (key === null) throw new VaultLockedError();
  return key;
}

export function setUserKey(key: Uint8Array | null): void {
  userKey = key;
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, toBase64(key));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage indisponible (mode privé strict) : on reste en mémoire seule */
  }
}

export function clearUserKey(): void {
  userKey = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* sessionStorage indispo */ }
}

/** Vrai si le coffre est déverrouillé (UK disponible pour (dé)chiffrer). */
export function isVaultUnlocked(): boolean {
  return getUserKey() !== null;
}
