import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { getMenus, getShoppingList, exportShoppingList } from '../api/endpoints';
import type { WeeklyMenuResponse, ShoppingList, ShoppingItem } from '../types';
import styles from './CoursesPage.module.css';

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  'enums.type_of_ingredient.vegetable': { label: 'Légumes',                  icon: '🥦' },
  'enums.type_of_ingredient.fruit':     { label: 'Fruits',                   icon: '🍎' },
  'enums.type_of_ingredient.meat':      { label: 'Viandes',                  icon: '🥩' },
  'enums.type_of_ingredient.fish':      { label: 'Poissons & fruits de mer', icon: '🐟' },
  'enums.type_of_ingredient.dairy':     { label: 'Produits laitiers',        icon: '🧀' },
  'enums.type_of_ingredient.grain':     { label: 'Céréales & féculents',     icon: '🌾' },
  'enums.type_of_ingredient.legume':    { label: 'Légumineuses',             icon: '🫘' },
  'enums.type_of_ingredient.egg':       { label: 'Œufs',                     icon: '🥚' },
  'enums.type_of_ingredient.fat':       { label: 'Matières grasses',         icon: '🫙' },
  'enums.type_of_ingredient.condiment': { label: 'Condiments & sauces',      icon: '🧂' },
  'enums.type_of_ingredient.herb':      { label: 'Herbes & épices',          icon: '🌿' },
  'enums.type_of_ingredient.drink':     { label: 'Boissons',                 icon: '🥤' },
  'enums.type_of_ingredient.other':     { label: 'Divers',                   icon: '🛒' },
};

function getCategoryMeta(cat: string | null) {
  if (cat && CATEGORY_META[cat]) return CATEGORY_META[cat];
  return {
    label: cat ? cat.split('.').pop()!.replace(/_/g, ' ') : 'Divers',
    icon: '🛒',
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function menuLabel(menu: WeeklyMenuResponse): string {
  return `Semaine du ${formatDate(menu.start_date)} — ${menu.nb_persons} pers.`;
}

function groupByCategory(items: ShoppingItem[]): [string | null, ShoppingItem[]][] {
  const map = new Map<string | null, ShoppingItem[]>();
  for (const item of items) {
    const key = item.category ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const knownOrder = Object.keys(CATEGORY_META);
  return [...map.entries()].sort(([a], [b]) => {
    const ia = a ? knownOrder.indexOf(a) : Infinity;
    const ib = b ? knownOrder.indexOf(b) : Infinity;
    if (ia === -1 && ib === -1) return (a ?? '').localeCompare(b ?? '');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CoursesPage() {
  const [searchParams] = useSearchParams();
  const menuParam = searchParams.get('menu');

  const [menus, setMenus]               = useState<WeeklyMenuResponse[]>([]);
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [loadingList, setLoadingList]   = useState(false);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [exporting, setExporting]       = useState<'csv' | 'pdf' | null>(null);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    getMenus()
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        );
        setMenus(sorted);
        const fromParam = menuParam ? Number(menuParam) : null;
        const initial = fromParam && sorted.find((m) => m.id === fromParam)
          ? fromParam
          : sorted[0]?.id ?? null;
        setSelectedId(initial);
      })
      .finally(() => setLoadingMenus(false));
  }, [menuParam]);

  useEffect(() => {
    if (selectedId === null) { setShoppingList(null); return; }
    setLoadingList(true);
    setError(null);
    getShoppingList(selectedId)
      .then(setShoppingList)
      .catch(() => setError('Impossible de charger la liste de courses.'))
      .finally(() => setLoadingList(false));
  }, [selectedId]);

  const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
    if (!selectedId) return;
    setExporting(format);
    try {
      const blob = await exportShoppingList(selectedId, format);
      const menu = menus.find((m) => m.id === selectedId);
      const date = menu?.start_date ?? String(selectedId);
      triggerDownload(blob, `courses-${date}.${format}`);
    } catch {
      setError("L'export a échoué.");
    } finally {
      setExporting(null);
    }
  }, [selectedId, menus]);

  const groups     = shoppingList ? groupByCategory(shoppingList.items) : [];
  const totalItems = shoppingList?.items.length ?? 0;

  return (
    <Layout>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Liste de courses</h1>
          <div className={styles.controls}>
            {loadingMenus ? (
              <div className={styles.skeleton} style={{ width: 220, height: 36 }} />
            ) : menus.length > 0 ? (
              <select
                className={styles.select}
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>{menuLabel(m)}</option>
                ))}
              </select>
            ) : null}
            <div className={styles.btnGroup}>
              <button
                className={styles.btnExport}
                disabled={!shoppingList || exporting !== null}
                onClick={() => handleExport('csv')}
              >
                {exporting === 'csv' ? '…' : '↓'} CSV
              </button>
              <button
                className={styles.btnExport}
                disabled={!shoppingList || exporting !== null}
                onClick={() => handleExport('pdf')}
              >
                {exporting === 'pdf' ? '…' : '↓'} PDF
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--error, #e55)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </p>
        )}

        {loadingMenus || loadingList ? (
          <div className={styles.skeleton} style={{ height: 300 }} />
        ) : menus.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🛒</div>
            <p className={styles.emptyTitle}>Aucun menu disponible</p>
            <p className={styles.emptyDesc}>
              Générez un menu hebdomadaire depuis la page Menus pour obtenir votre liste de courses.
            </p>
          </div>
        ) : !shoppingList || totalItems === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <p className={styles.emptyTitle}>Aucun ingrédient trouvé</p>
            <p className={styles.emptyDesc}>
              Ce menu ne contient pas encore de recettes avec des ingrédients renseignés.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.meta}>
              <span className={styles.metaItem}>
                Semaine du <strong>{formatDate(shoppingList.start_date)}</strong>
              </span>
              <span className={styles.metaItem}>
                <strong>{shoppingList.nb_persons}</strong>{' '}
                personne{shoppingList.nb_persons > 1 ? 's' : ''}
              </span>
              <span className={styles.metaItem}>
                <strong>{totalItems}</strong>{' '}
                ingrédient{totalItems > 1 ? 's' : ''}
              </span>
            </div>

            <div className={styles.list}>
              {groups.map(([cat, items]) => {
                const meta = getCategoryMeta(cat);
                return (
                  <div key={cat ?? '_null'} className={styles.category}>
                    <div className={styles.categoryHeader}>
                      <span className={styles.categoryIcon}>{meta.icon}</span>
                      <span className={styles.categoryName}>{meta.label}</span>
                      <span className={styles.categoryCount}>
                        {items.length} article{items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Ingrédient</th>
                          <th className={styles.qty}>Quantité</th>
                          <th className={styles.unit}>Unité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.ingredient_id}>
                            <td>{item.ingredient_name}</td>
                            <td className={styles.qty}>{item.total_quantity}</td>
                            <td className={styles.unit}>{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            <div className={styles.summary}>
              <span><strong>{groups.length}</strong> rayon{groups.length > 1 ? 's' : ''}</span>
              <span><strong>{totalItems}</strong> ingrédient{totalItems > 1 ? 's' : ''}</span>
              <span>
                Pour <strong>{shoppingList.nb_persons}</strong>{' '}
                personne{shoppingList.nb_persons > 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}
      </main>
    </Layout>
  );
}
