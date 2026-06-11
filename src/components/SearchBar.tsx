import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchRecipes } from '../api/endpoints';
import type { SearchRecipeResult } from '../types';
import { courseTypeLabel, difficultyLabel, cuisineOriginLabel } from '../utils/enumLabels';
import styles from './SearchBar.module.css';

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className={styles.highlight}>{part}</mark>
          : part
      )}
    </>
  );
}

export default function SearchBar() {
  const navigate = useNavigate();

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<SearchRecipeResult[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await searchRecipes(q.trim(), 8);
    setResults(res);
    setOpen(true);
    setLoading(false);
  }, []);

  const selectResult = useCallback((r: SearchRecipeResult) => {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    navigate(`/old/recettes?slug=${encodeURIComponent(r.slug)}`);
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && open && results.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        selectResult(results[activeIndex]);
      } else if (query.trim().length >= 2) {
        setOpen(false);
        navigate(`/old/recettes?q=${encodeURIComponent(query.trim())}`);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={`${styles.inputWrap} ${open ? styles.active : ''}`}>
        <SearchIcon className={styles.icon} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Rechercher une recette…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className={styles.input}
          autoComplete="off"
          aria-label="Rechercher une recette"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
        />
        {loading && <span className={styles.spinner} />}
        {query && !loading && (
          <button className={styles.clearBtn} onClick={handleClear} aria-label="Effacer la recherche">
            ×
          </button>
        )}
      </div>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-label="Résultats de recherche">
          {results.length === 0 ? (
            <div className={styles.empty}>
              Aucune recette pour « {query} »
            </div>
          ) : (
            <>
              <div className={styles.dropdownHeader}>
                {results.length} résultat{results.length > 1 ? 's' : ''} — Entrée pour voir tous les résultats
              </div>
              {results.map((r, i) => (
                <div
                  key={r.id}
                  className={`${styles.resultItem} ${i === activeIndex ? styles.resultActive : ''}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectResult(r)}
                >
                  <div className={styles.resultTitle}>{highlight(r.title, query)}</div>
                  <div className={styles.resultMeta}>
                    {courseTypeLabel(r.course_type)   && <span className={styles.tag}>{courseTypeLabel(r.course_type)}</span>}
                    {difficultyLabel(r.difficulty)    && <span className={styles.tag}>{difficultyLabel(r.difficulty)}</span>}
                    {r.prep_time_minutes != null && (
                      <span className={styles.tagNeutral}>{r.prep_time_minutes} min</span>
                    )}
                    {cuisineOriginLabel(r.cuisine_origin) && (
                      <span className={styles.tagNeutral}>{cuisineOriginLabel(r.cuisine_origin)}</span>
                    )}
                    {r.ingredient_names?.length > 0 && (
                      <span className={styles.tagNeutral}>
                        {r.ingredient_names.slice(0, 3).join(', ')}
                        {r.ingredient_names.length > 3 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
