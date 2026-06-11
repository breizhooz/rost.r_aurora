import { useCallback, useEffect, useState } from 'react';
import { getNotifications } from '../api/endpoints';
import { useCurrentUser } from './useCurrentUser';
import { useRefreshSignal } from '../utils/liveRefresh';
import type { NotificationItem } from '../types';

// État « non-lu » géré côté client : on retient l'horodatage du dernier coup
// d'œil (ouverture de la cloche / visite de la page). Une notif est « non lue »
// si elle est plus récente que ce repère. Pas de changement backend nécessaire.
const LAST_SEEN_KEY = 'notif_last_seen';

function readLastSeen(): number {
  return Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
}

export interface UseNotifications {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  markSeen: () => void;
  reload: () => void;
}

export function useNotifications(pollMs = 30_000): UseNotifications {
  const { user } = useCurrentUser();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSeen, setLastSeen] = useState<number>(readLastSeen);

  const load = useCallback(() => {
    if (!user) return;
    getNotifications(user.id, 50)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [user, load, pollMs]);

  // Rafraîchissement immédiat sur signal applicatif (ex. fin d'import) ou retour
  // de focus, en plus du polling — la cloche reflète l'événement sans attendre.
  useRefreshSignal('notifications', load);

  const unread = items.filter(
    (n) => new Date(n.created_at).getTime() > lastSeen,
  ).length;

  const markSeen = useCallback(() => {
    const now = Date.now();
    localStorage.setItem(LAST_SEEN_KEY, String(now));
    setLastSeen(now);
  }, []);

  return { items, unread, loading, markSeen, reload: load };
}
