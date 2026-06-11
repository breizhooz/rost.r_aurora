import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchRecipes } from '../api/endpoints';
import type { SearchRecipeResult } from '../types';
import { courseTypeLabel } from '../utils/enumLabels';

export default function AuroraSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRecipeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    const res = await searchRecipes(q.trim(), 8);
    setResults(res); setOpen(true); setLoading(false);
  }, []);

  const select = useCallback((r: SearchRecipeResult) => {
    setQuery(''); setOpen(false); setActive(-1);
    navigate(`/recettes?slug=${encodeURIComponent(r.slug)}`);
  }, [navigate]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v); setActive(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open && results.length) { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp' && open && results.length) { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) select(results[active]);
      else if (query.trim().length >= 2) { setOpen(false); navigate(`/recettes?q=${encodeURIComponent(query.trim())}`); setQuery(''); }
    } else if (e.key === 'Escape') setOpen(false);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="rost-search-wrap" ref={containerRef}>
      <span className="rost-search-ico">⌕</span>
      <input
        className="rost-search-input"
        type="text"
        placeholder="Chercher une recette…"
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length) setOpen(true); }}
        aria-label="Rechercher une recette"
        autoComplete="off"
      />
      {loading && <span className="rost-search-spin" />}
      {open && (
        <div className="rost-search-dropdown" role="listbox">
          {results.length === 0 ? (
            <div className="rost-search-empty">Aucune recette pour « {query} »</div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.id}
                className={`rost-search-item ${i === active ? 'is-active' : ''}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(r)}
              >
                <span className="rost-search-item-title">{r.title}</span>
                <span className="rost-search-item-meta">
                  {courseTypeLabel(r.course_type) ?? ''}{r.prep_time_minutes != null ? ` · ${r.prep_time_minutes} min` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
