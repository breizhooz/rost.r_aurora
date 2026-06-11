// Persistance du compte actif (multicomptes), isolée ici pour être partagée
// sans cycle d'import entre AccountContext, AuthContext et le callback OAuth.
//
// On utilise sessionStorage (et non localStorage) : le contexte de compte ne
// doit pas fuiter entre deux sessions de navigateur, et reste cohérent avec
// l'access token gardé en mémoire (SEC-05).

const STORAGE_KEY = 'rost.activeAccountId';

export function readStoredAccountId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredAccountId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage indisponible : on dégrade sans bloquer */
  }
}

/** Purge le compte mémorisé (déconnexion, reconnexion propre). */
export function clearStoredAccountId(): void {
  writeStoredAccountId(null);
}
