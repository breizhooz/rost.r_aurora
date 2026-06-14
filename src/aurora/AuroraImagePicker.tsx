import { useState } from 'react';
import { refreshImageSuggestions, selectRecipeImage } from '../api/endpoints';
import type { ImageSuggestion, RecipeResponse } from '../types';
import { apiErrorMessage } from '../utils/apiError';
import './aurora.css';

interface Props {
  recipe: RecipeResponse;
  /** Appelé après une re-recherche ou une sélection (recette à jour renvoyée par l'API). */
  onChange?: (recipe: RecipeResponse) => void;
}

/**
 * Sélecteur d'image Unsplash : mot-clé libre + grille de 4 propositions.
 * Les suggestions sont générées côté backend à partir du titre lors de la création ;
 * ce composant permet de relancer la recherche et de valider l'image finale.
 */
export default function AuroraImagePicker({ recipe, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<ImageSuggestion[]>(recipe.image_suggestions ?? []);
  const [keyword, setKeyword] = useState(recipe.image_search_keyword ?? recipe.title);
  const [searching, setSearching] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const kw = keyword.trim();
    if (!kw || searching) return;
    setSearching(true); setError('');
    try {
      const updated = await refreshImageSuggestions(recipe.id, kw);
      setSuggestions(updated.image_suggestions ?? []);
      setSelectedId(null);
      onChange?.(updated);
    } catch (e) {
      setError(apiErrorMessage(e, 'La recherche d’images a échoué. Réessaie dans un instant.'));
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(s: ImageSuggestion) {
    if (selectingId) return;
    setSelectingId(s.unsplash_id); setError('');
    try {
      const updated = await selectRecipeImage(recipe.id, s.unsplash_id);
      setSelectedId(s.unsplash_id);
      onChange?.(updated);
    } catch {
      setError('Impossible d’enregistrer cette image. Réessaie.');
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <div className="rost-imgpicker">
      <form className="rost-imgpicker-search" onSubmit={handleSearch}>
        <input
          className="rost-form-input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Mot-clé (ex. tarte aux pommes)…"
          aria-label="Mot-clé de recherche d'images"
        />
        <button className="rost-btn" type="submit" disabled={searching || !keyword.trim()}>
          {searching ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && <p className="rost-error" style={{ marginTop: 8 }}>{error}</p>}

      {suggestions.length === 0 ? (
        <p className="rost-empty" style={{ marginTop: 10 }}>
          {searching ? 'Recherche en cours…' : 'Aucune image. Essaie un autre mot-clé.'}
        </p>
      ) : (
        <div className="rost-img-grid">
          {suggestions.map((s) => {
            const isSelected = selectedId === s.unsplash_id;
            const isBusy = selectingId === s.unsplash_id;
            return (
              <figure key={s.unsplash_id} className={`rost-img-card${isSelected ? ' is-selected' : ''}`}>
                <button
                  type="button"
                  className="rost-img-card-btn"
                  onClick={() => handleSelect(s)}
                  disabled={!!selectingId}
                  aria-pressed={isSelected}
                  aria-label={`Choisir la photo de ${s.author ?? 'Unsplash'}`}
                >
                  <img src={s.thumb_url} alt={s.author ? `Photo par ${s.author}` : 'Suggestion Unsplash'} loading="lazy" />
                  {isBusy && <span className="rost-img-card-spin">…</span>}
                  {isSelected && <span className="rost-img-card-check" aria-hidden="true">✓</span>}
                </button>
                {s.author && (
                  <figcaption className="rost-img-credit">
                    {s.author_url ? (
                      <a href={s.author_url} target="_blank" rel="noopener noreferrer">{s.author}</a>
                    ) : s.author}
                    <span className="rost-img-credit-src"> · Unsplash</span>
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
