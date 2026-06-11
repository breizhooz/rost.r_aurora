import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuroraShell from './AuroraShell';
import { getMe, getMenus, getShoppingList, exportShoppingList } from '../api/endpoints';
import type { WeeklyMenuResponse, ShoppingList, ShoppingItem, UserOut } from '../types';

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
function menuLabel(m: WeeklyMenuResponse) { return `Semaine du ${fmtDate(m.start_date)} — ${m.nb_persons} pers.`; }
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
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
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
  const menuParam = searchParams.get('menu');
  const [user, setUser] = useState<UserOut | null>(null);
  const [menus, setMenus] = useState<WeeklyMenuResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>(ALL_TAB);

  useEffect(() => { getMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => {
    getMenus().then((data) => {
      const sorted = [...data].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
      setMenus(sorted);
      const fromParam = menuParam ? Number(menuParam) : null;
      setSelectedId(fromParam && sorted.find((m) => m.id === fromParam) ? fromParam : sorted[0]?.id ?? null);
    }).finally(() => setLoadingMenus(false));
  }, [menuParam]);
  useEffect(() => {
    if (selectedId === null) { setList(null); return; }
    setLoadingList(true); setError(null);
    getShoppingList(selectedId).then(setList)
      .catch(() => setError('Impossible de charger la liste de courses.'))
      .finally(() => setLoadingList(false));
  }, [selectedId]);

  const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
    if (!selectedId) return;
    setExporting(format);
    try {
      const blob = await exportShoppingList(selectedId, format);
      const menu = menus.find((m) => m.id === selectedId);
      download(blob, `courses-${menu?.start_date ?? selectedId}.${format}`);
    } catch { setError("L'export a échoué."); } finally { setExporting(null); }
  }, [selectedId, menus]);

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
          {!loadingMenus && menus.length > 0 && (
            <select className="rost-select" value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {menus.map((m) => <option key={m.id} value={m.id}>{menuLabel(m)}</option>)}
            </select>
          )}
          <div className="rost-toolbar-actions">
            <button className="rost-btn" disabled={!list || exporting !== null} onClick={() => handleExport('csv')}>
              {exporting === 'csv' ? '…' : '↓'} CSV
            </button>
            <button className="rost-btn" disabled={!list || exporting !== null} onClick={() => handleExport('pdf')}>
              {exporting === 'pdf' ? '…' : '↓'} PDF
            </button>
          </div>
        </div>

        {error && <p className="rost-error">{error}</p>}

        {loadingMenus || loadingList ? (
          <div className="rost-skel" style={{ height: 320 }} />
        ) : menus.length === 0 ? (
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
