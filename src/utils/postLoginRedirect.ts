// Reprise d'un parcours interrompu par l'authentification (typiquement un lien
// d'invitation /accept-invite ouvert sans session). La page de départ dépose
// l'URL de retour ici ; toutes les voies d'entrée en session (login, register,
// callback OAuth) doivent la consommer pour ne pas perdre le parcours.

const KEY = 'post_login_redirect';

/** URL de retour mémorisée, retirée du store (consommée une seule fois). */
export function consumePostLoginRedirect(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Mémorise l'URL de retour avant de rediriger vers login/register. */
export function setPostLoginRedirect(url: string): void {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    /* sessionStorage indisponible : on dégrade sans bloquer */
  }
}
