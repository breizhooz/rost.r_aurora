import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { getMe, listAllRecipes } from '../api/endpoints';
import { listMenuWeeks, getMenuBlob, VaultLockedError } from '../api/menuVault';
import { isVaultUnlocked } from '../crypto/vault';
import { exportShoppingCsv, exportShoppingPdf } from '../utils/shoppingExport';
import { buildShoppingList, type ShoppingItem, type Recipe } from '@nutri/e2e-core';
import type { UserOut } from '../types';

/** Liste de courses calculée client (le menu n'existe que déchiffré). */
interface ShoppingView { start_date: string; nb_persons: number; items: ShoppingItem[]; }

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  'enums.type_of_ingredient.vegetable': { label: 'Légumes', icon: '🥦' },
  'enums.type_of_ingredient.fruit': { label: 'Fruits', icon: '🍎' },
  'enums.type_of_ingredient.meat': { label: 'Viandes', icon: '🥩' },
  'enums.type_of_ingredient.fish': { label: 'Poissons & fruits de mer', icon: '🐟' },
  'enums.type_of_ingredient.dairy': { label: 'Produits laitiers', icon: '🧀' },
  'enums.type_of_ingredient.grain': { label: 'Céréales & féculents', icon: '🌾' },
  'enums.type_of_ingredient.legume': { label: 'Légumineuses', icon: '🫘' },
  'enums.type_of_ingredient.egg': { label: 'Œufs', icon: '🥚' },
  'enums.type_of_ingredient.fat': { label: 'Matières grasses', icon: '🫙' },
  'enums.type_of_ingredient.condiment': { label: 'Condiments & sauces', icon: '🧂' },
  'enums.type_of_ingredient.herb': { label: 'Herbes & épices', icon: '🌿' },
  'enums.type_of_ingredient.drink': { label: 'Boissons', icon: '🥤' },
  'enums.type_of_ingredient.other': { label: 'Divers', icon: '🛒' },
};
function catMeta(cat: string | null) {
  if (cat && CATEGORY_META[cat]) return CATEGORY_META[cat];
  return { label: cat ? cat.split('.').pop()!.replace(/_/g, ' ') : 'Divers', icon: '🛒' };
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
function weekLabel(week: string) { return `Semaine du ${fmtDate(week)}`; }
const categoryLabel = (cat: string | null) => catMeta(cat).label;
function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '??';
}
function groupByCategory(items: ShoppingItem[]): [string | null, ShoppingItem[]][] {
  const map = new Map<string | null, ShoppingItem[]>();
  for (const it of items) { const k = it.category ?? null; (map.get(k) ?? map.set(k, []).get(k)!).push(it); }
  const order = Object.keys(CATEGORY_META);
  return [...map.entries()].sort(([a], [b]) => {
    const ia = a ? order.indexOf(a) : Infinity, ib = b ? order.indexOf(b) : Infinity;
    if (ia === -1 && ib === -1) return (a ?? '').localeCompare(b ?? '');
    if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib;
  });
}
/** Clé de l'onglet « Tout » (liste complète, toutes catégories). */
const ALL_TAB = '_all';

/** Carte d'une catégorie : entête + lignes ingrédient/quantité. */
function CatCard({ cat, items }: { cat: string | null; items: ShoppingItem[] }) {
  const meta = catMeta(cat);
  return (
    <article className="rost-card rost-course-cat">
      <div className="rost-course-head">
        <span className="rost-course-icon">{meta.icon}</span>
        <span className="rost-course-name">{meta.label}</span>
        <span className="rost-course-count">{items.length}</span>
      </div>
      {items.map((it) => (
        <div className="rost-course-row" key={it.ingredient_id}>
          <span className="rost-course-ing">{it.ingredient_name}</span>
          <span className="rost-course-qty">{it.total_quantity} <em>{it.unit}</em></span>
        </div>
      ))}
    </article>
  );
}

export default function AuroraCourses() {
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  const [user, setUser] = useState<UserOut | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [list, setList] = useState<ShoppingView | null>(null);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [vaultLocked, setVaultLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>(ALL_TAB);

  // Catalogue public (id → recette) pour résoudre les ingrédients localement.
  const recipesById = useRef<Map<number, Recipe>>(new Map());

  useEffect(() => { getMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => {
    if (!isVaultUnlocked()) { setVaultLocked(true); setLoadingMenus(false); return; }
    Promise.all([
      listMenuWeeks(),
      listAllRecipes().then((items) => {
        recipesById.current = new Map(items.map((r) => [r.id, r as unknown as Recipe]));
      }),
    ])
      .then(([ws]) => {
        setWeeks(ws);
        setSelectedWeek(weekParam && ws.includes(weekParam) ? weekParam : ws[0] ?? null);
      })
      .catch(() => setError('Impossible de charger les menus.'))
      .finally(() => setLoadingMenus(false));
  }, [weekParam]);
  useEffect(() => {
    if (selectedWeek === null) { setList(null); return; }
    setLoadingList(true); setError(null);
    getMenuBlob(selectedWeek)
      .then((stored) => {
        if (!stored) { setList(null); return; }
        setList({
          start_date: stored.doc.start_date,
          nb_persons: stored.doc.nb_persons,
          items: buildShoppingList(stored.doc.slots, recipesById.current),
        });
      })
      .catch((err) => {
        if (err instanceof VaultLockedError) setVaultLocked(true);
        setError('Impossible de charger la liste de courses.');
      })
      .finally(() => setLoadingList(false));
  }, [selectedWeek]);

  const handleExport = useCallback((format: 'csv' | 'pdf') => {
    if (!list) return;
    const data = { startDate: list.start_date, nbPersons: list.nb_persons, items: list.items };
    if (format === 'csv') exportShoppingCsv(data, categoryLabel);
    else exportShoppingPdf(data, categoryLabel);
  }, [list]);

  const groups = list ? groupByCategory(list.items) : [];
  const total = list?.items.length ?? 0;
  const catKey = (cat: string | null) => cat ?? '_null';
  const isAll = activeCat === ALL_TAB;
  const activeGroup = isAll
    ? null
    : (groups.find(([c]) => catKey(c) === activeCat) ?? groups[0] ?? null);

  return (
    <AuroraShell screen="courses" initials={user ? initials(user.email) : undefined} title="Courses"
      subtitle={list ? `${total} ingrédient${total > 1 ? 's' : ''} · ${list.nb_persons} pers.` : undefined}>
      <div className="rost-page">
        <div className="rost-toolbar">
          {!loadingMenus && weeks.length > 0 && (
            <select className="rost-select" value={selectedWeek ?? ''} onChange={(e) => setSelectedWeek(e.target.value)}>
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
          )}
          <div className="rost-toolbar-actions">
            <button className="rost-btn" disabled={!list || total === 0} onClick={() => handleExport('csv')}>
              ↓ CSV
            </button>
            <button className="rost-btn" disabled={!list || total === 0} onClick={() => handleExport('pdf')}>
              ↓ PDF
            </button>
          </div>
        </div>

        {error && <p className="rost-error">{error}</p>}

        {vaultLocked ? (
          <div className="rost-empty rost-empty-block">🔒 Coffre verrouillé — reconnecte-toi pour accéder à ta liste de courses chiffrée.</div>
        ) : loadingMenus || loadingList ? (
          <div className="rost-skel" style={{ height: 320 }} />
        ) : weeks.length === 0 ? (
          <div className="rost-empty rost-empty-block">Aucun menu — génère un menu hebdo depuis la page Semaine.</div>
        ) : !list || total === 0 ? (
          <div className="rost-empty rost-empty-block">Aucun ingrédient pour ce menu.</div>
        ) : (
          <div className="rost-courses-tabbed">
            <div className="rost-tabbar rost-course-tabs">
              <button
                className={`rost-tab ${isAll ? 'is-active' : ''}`}
                onClick={() => setActiveCat(ALL_TAB)}
              >
                <span className="rost-course-tab-icon">📋</span>
                Tout
                <b className="rost-course-tab-count">{total}</b>
              </button>
              {groups.map(([cat, items]) => {
                const meta = catMeta(cat);
                const key = catKey(cat);
                const isActive = !isAll && activeGroup != null && catKey(activeGroup[0]) === key;
                return (
                  <button key={key} className={`rost-tab ${isActive ? 'is-active' : ''}`} onClick={() => setActiveCat(key)}>
                    <span className="rost-course-tab-icon">{meta.icon}</span>
                    {meta.label}
                    <b className="rost-course-tab-count">{items.length}</b>
                  </button>
                );
              })}
            </div>

            {isAll ? (
              <div className="rost-course-all">
                {groups.map(([cat, items]) => (
                  <CatCard key={catKey(cat)} cat={cat} items={items} />
                ))}
              </div>
            ) : (
              activeGroup && <CatCard cat={activeGroup[0]} items={activeGroup[1]} />
            )}
          </div>
        )}
      </div>
    </AuroraShell>
  );
}
