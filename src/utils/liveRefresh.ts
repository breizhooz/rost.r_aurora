import { useEffect } from 'react';

// Bus d'événements applicatif léger (sans store global ni lib externe).
//
// Permet à une action (ex. un import admin terminé) de signaler aux autres
// écrans déjà montés — la cloche de notifications, la liste des recettes — de se
// rafraîchir, sans que l'utilisateur ait à recharger la page.
//
// Deux canaux complémentaires :
//   - un CustomEvent `window` (même onglet) : réaction immédiate ;
//   - le retour de focus de la fenêtre (`focus`) : couvre le cas « la page était
//     ouverte dans un autre onglet, on y revient » sans polling agressif.

export type RefreshTopic = 'notifications' | 'recipes' | 'account';

const EVENT_NAME = 'app:refresh';

/** Signale qu'un sujet a changé → les écrans abonnés se rafraîchissent. */
export function emitRefresh(topic: RefreshTopic): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: topic }));
}

/**
 * Abonne un handler aux changements d'un sujet (événement applicatif + retour
 * de focus). `handler` doit être stable (useCallback) pour éviter de ré-abonner
 * à chaque rendu.
 */
export function useRefreshSignal(topic: RefreshTopic, handler: () => void): void {
  useEffect(() => {
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<RefreshTopic>).detail === topic) handler();
    };
    window.addEventListener(EVENT_NAME, onEvent);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener(EVENT_NAME, onEvent);
      window.removeEventListener('focus', handler);
    };
  }, [topic, handler]);
}
