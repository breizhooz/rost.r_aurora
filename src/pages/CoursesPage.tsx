import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { buildShoppingList, type ShoppingItem, type Recipe } from '@nutri/e2e-core';
import { listAllRecipes } from '../api/endpoints';
import { listMenuWeeks, getMenuBlob, VaultLockedError } from '../api/menuVault';
import { isVaultUnlocked } from '../crypto/vault';
import { exportShoppingCsv, exportShoppingPdf } from '../utils/shoppingExport';
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

const categoryLabel = (cat: string | null) => getCategoryMeta(cat).label;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function weekLabel(week: string): string {
  return `Semaine du ${formatDate(week)}`;
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

/** Liste de courses calculée client (le menu n'existe que déchiffré). */
interface ShoppingView {
  start_date: string;
  nb_persons: number;
  items: ShoppingItem[];
}

export default function CoursesPage() {
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get('week');

  const [weeks, setWeeks]               = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingView | null>(null);
  const [loadingList, setLoadingList]   = useState(false);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [vaultLocked, setVaultLocked]   = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Catalogue public (id → recette) pour résoudre les ingrédients localement.
  const recipesById = useRef<Map<number, Recipe>>(new Map());

  useEffect(() => {
    if (!isVaultUnlocked()) {
      setVaultLocked(true);
      setLoadingMenus(false);
      return;
    }
    Promise.all([
      listMenuWeeks(),
      listAllRecipes().then((items) => {
        recipesById.current = new Map(items.map((r) => [r.id, r as unknown as Recipe]));
      }),
    ])
      .then(([ws]) => {
        setWeeks(ws);
        const initial = weekParam && ws.includes(weekParam) ? weekParam : ws[0] ?? null;
        setSelectedWeek(initial);
      })
      .catch(() => setError('Impossible de charger les menus.'))
      .finally(() => setLoadingMenus(false));
  }, [weekParam]);

  useEffect(() => {
    if (selectedWeek === null) { setShoppingList(null); return; }
    setLoadingList(true);
    setError(null);
    getMenuBlob(selectedWeek)
      .then((stored) => {
        if (!stored) { setShoppingList(null); return; }
        const items = buildShoppingList(stored.doc.slots, recipesById.current);
        setShoppingList({
          start_date: stored.doc.start_date,
          nb_persons: stored.doc.nb_persons,
          items,
        });
      })
      .catch((err) => {
        if (err instanceof VaultLockedError) setVaultLocked(true);
        setError('Impossible de charger la liste de courses.');
      })
      .finally(() => setLoadingList(false));
  }, [selectedWeek]);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    if (!shoppingList) return;
    const data = {
      startDate: shoppingList.start_date,
      nbPersons: shoppingList.nb_persons,
      items: shoppingList.items,
    };
    if (format === 'csv') exportShoppingCsv(data, categoryLabel);
    else exportShoppingPdf(data, categoryLabel);
  }, [shoppingList]);

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
            ) : weeks.length > 0 ? (
              <select
                className={styles.select}
                value={selectedWeek ?? ''}
                onChange={(e) => setSelectedWeek(e.target.value)}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>{weekLabel(w)}</option>
                ))}
              </select>
            ) : null}
            <div className={styles.btnGroup}>
              <button
                className={styles.btnExport}
                disabled={!shoppingList || totalItems === 0}
                onClick={() => handleExport('csv')}
              >
                ↓ CSV
              </button>
              <button
                className={styles.btnExport}
                disabled={!shoppingList || totalItems === 0}
                onClick={() => handleExport('pdf')}
              >
                ↓ PDF
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--error, #e55)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </p>
        )}

        {vaultLocked ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔒</div>
            <p className={styles.emptyTitle}>Coffre verrouillé</p>
            <p className={styles.emptyDesc}>
              Tes menus sont chiffrés de bout en bout. Reconnecte-toi (ou déverrouille ta
              session) pour générer ta liste de courses.
            </p>
          </div>
        ) : loadingMenus || loadingList ? (
          <div className={styles.skeleton} style={{ height: 300 }} />
        ) : weeks.length === 0 ? (
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
