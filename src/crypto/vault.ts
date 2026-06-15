// Coffre en mémoire : la User Key (UK) déchiffrée vit UNIQUEMENT en mémoire, jamais
// en localStorage (même règle que l'access token, SEC-05). Perdue au reload → ré-
// obtenue en déverrouillant après le /auth/refresh de bootstrap, ou au prochain login.
//
// La UK est la clé qui (dé)chiffre les blobs de santé/menu côté client (E2E).

/** Levée quand le coffre est verrouillé (UK absente) : impossible de (dé)chiffrer. */
export class VaultLockedError extends Error {
  constructor(message = 'Coffre verrouillé : déverrouille ta session pour accéder à tes données chiffrées.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

let userKey: Uint8Array | null = null;

export function getUserKey(): Uint8Array | null {
  return userKey;
}

/** Renvoie la UK ou lève {@link VaultLockedError} si le coffre est verrouillé. */
export function requireUserKey(): Uint8Array {
  if (userKey === null) throw new VaultLockedError();
  return userKey;
}

export function setUserKey(key: Uint8Array | null): void {
  userKey = key;
}

export function clearUserKey(): void {
  userKey = null;
}

/** Vrai si le coffre est déverrouillé (UK disponible pour (dé)chiffrer). */
export function isVaultUnlocked(): boolean {
  return userKey !== null;
}
