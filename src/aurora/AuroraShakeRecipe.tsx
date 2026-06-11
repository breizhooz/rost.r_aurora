import { useCallback, useEffect, useRef, useState } from 'react';
import { shakeRecipe, addSpoonacularRecipe } from '../api/endpoints';
import type { SpoonacularShake } from '../types';

/** Sous-ensemble typé du payload Spoonacular consommé par la modal. */
interface SpoonacularPayload {
  image?: string;
  title?: string;
  readyInMinutes?: number;
  servings?: number;
  dishTypes?: string[];
  sourceUrl?: string;
  extendedIngredients?: { id?: number; original?: string; name?: string }[];
  analyzedInstructions?: { steps?: { number?: number; step?: string }[] }[];
}

function steps(p: SpoonacularPayload): string[] {
  const out: string[] = [];
  for (const block of p.analyzedInstructions ?? []) {
    for (const s of block.steps ?? []) {
      if (s.step) out.push(s.step);
    }
  }
  return out;
}

function ingredientLines(p: SpoonacularPayload): string[] {
  return (p.extendedIngredients ?? [])
    .map((i) => i.original || i.name || '')
    .filter(Boolean);
}

function ShakeModal({
  shake,
  onClose,
  onAdded,
}: {
  shake: SpoonacularShake;
  onClose: () => void;
  onAdded: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = shake.payload as SpoonacularPayload;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await addSpoonacularRecipe(shake.spoonacular_id);
      setAdded(true);
      onAdded();
    } catch {
      setError("L'ajout a échoué. Réessaie dans un instant.");
    } finally {
      setAdding(false);
    }
  }

  const lines = ingredientLines(p);
  const stepList = steps(p);
  // dishTypes reste en anglais (le mapper en dépend) → on ne l'affiche pas.
  const meta = [
    p.readyInMinutes ? `${p.readyInMinutes} min` : null,
    p.servings ? `${p.servings} pers.` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="rost-rd-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="rost-rd-modal" role="dialog" aria-modal="true">
        <div className="rost-rd-head">
          <span className="rost-card-title">Shake ta recette</span>
          <button className="rost-icon-btn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="rost-rd-body">
          <div className={p.image ? 'rost-rd-hero' : 'rost-rd-hero is-empty'}>
            {p.image && <img src={p.image} alt={shake.title} />}
          </div>

          <h2 className="rost-rd-title">{shake.title}</h2>

          {meta.length > 0 && (
            <div className="rost-rd-badges">
              {meta.map((m) => (
                <span className="rost-chip" key={m}>
                  {m}
                </span>
              ))}
            </div>
          )}

          {shake.description && <p className="rost-shake-summary">{shake.description}</p>}

          {lines.length > 0 && (
            <section className="rost-shake-section">
              <h3 className="rost-card-title">Ingrédients</h3>
              <ul className="rost-shake-ings">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
          )}

          {stepList.length > 0 && (
            <section className="rost-shake-section">
              <h3 className="rost-card-title">Préparation</h3>
              <ol className="rost-shake-steps">
                {stepList.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          {p.sourceUrl && (
            <a className="rost-shake-source" href={p.sourceUrl} target="_blank" rel="noreferrer">
              Voir la source ↗
            </a>
          )}
        </div>

        <div className="rost-rd-foot">
          {error && <span className="rost-rd-saveerr">{error}</span>}
          {added ? (
            <span className="rost-shake-added">✓ Ajoutée à votre liste</span>
          ) : (
            <button className="rost-add-btn" onClick={handleAdd} disabled={adding}>
              {adding ? 'Ajout…' : 'Ajouter à votre liste personnelle'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuroraShakeRecipe() {
  const [shake, setShake] = useState<SpoonacularShake | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [open, setOpen] = useState(false);

  const draw = useCallback(async () => {
    setLoading(true);
    setEmpty(false);
    try {
      setShake(await shakeRecipe());
    } catch {
      // 404 = cache Spoonacular encore vide (ou indisponible).
      setShake(null);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void draw();
  }, [draw]);

  return (
    <article className="rost-card rost-shake">
      <div className="rost-card-head">
        <span className="rost-card-title">Shake ta recette</span>
        <button
          className="rost-shake-btn"
          onClick={draw}
          disabled={loading}
          title="Tirer une autre recette"
        >
          🎲 Shake
        </button>
      </div>

      {loading ? (
        <div className="rost-skel" style={{ height: 120 }} />
      ) : empty ? (
        <div className="rost-empty">
          Aucune recette en cache pour l'instant. Reviens après le prochain tirage quotidien.
        </div>
      ) : shake ? (
        <button className="rost-shake-card" onClick={() => setOpen(true)}>
          <div className="rost-shake-title">{shake.title}</div>
          <div className="rost-shake-desc">
            {shake.description || 'Touche pour découvrir la recette complète.'}
          </div>
          <span className="rost-shake-more">Voir la recette →</span>
        </button>
      ) : null}

      {open && shake && (
        <ShakeModal shake={shake} onClose={() => setOpen(false)} onAdded={() => undefined} />
      )}
    </article>
  );
}
