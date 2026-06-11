import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { ClimbingBoxLoader } from 'react-spinners';
import { ocrScan, ocrImport } from '../api/endpoints';

interface Props {
  onClose: () => void;
  /** Appelé après un import réussi pour rafraîchir la file de validation. */
  onScanned?: () => void;
}

const MAX_BYTES = 10 * 1024 * 1024; // doit rester aligné avec MAX_IMAGE_BYTES côté back
type Status = 'idle' | 'uploading' | 'review' | 'importing' | 'done' | 'error';

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string }; detail?: string } | undefined;
    if (data?.error?.message) return data.error.message;
    if (data?.detail) return data.detail;
    if (err.code === 'ECONNABORTED') return "L'analyse a expiré. Réessayez avec une image plus nette.";
  }
  return err instanceof Error ? err.message : "Erreur lors de l'analyse de l'image.";
}

export default function AuroraScanModal({ onClose, onScanned }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isRecipe, setIsRecipe] = useState(true);
  const [rawText, setRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  // Libère l'URL objet de la preview quand elle change / au démontage.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectFile = useCallback((f: File) => {
    setError('');
    if (!f.type.startsWith('image/')) { setError('Le fichier doit être une image (JPEG, PNG…).'); return; }
    if (f.size > MAX_BYTES) { setError("L'image dépasse la taille maximale autorisée (10 Mo)."); return; }
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setFile(f);
    setStatus('idle');
  }, []);

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  }

  // Étape 1 : analyse (OCR + IA), aucune persistance.
  async function handleAnalyse() {
    if (!file) return;
    setStatus('uploading'); setError('');
    try {
      const res = await ocrScan(file);
      setTitle(res.title);
      setConfidence(res.recipe_confidence);
      setIsRecipe(res.is_recipe);
      setRawText(res.raw_text);
      setStatus('review');
    } catch (err: unknown) {
      setError(extractError(err));
      setStatus('error');
    }
  }

  // Étape 2 : décision de l'utilisateur → crée la pré-recette.
  async function handleImport() {
    setStatus('importing'); setError('');
    try {
      await ocrImport(rawText, title);
      setStatus('done');
      onScanned?.();
    } catch (err: unknown) {
      setError(extractError(err));
      setStatus('review');
    }
  }

  function reset() {
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setFile(null); setStatus('idle'); setError('');
    setTitle(''); setRawText(''); setConfidence(0); setIsRecipe(true);
  }

  const busy = status === 'uploading' || status === 'importing';

  return (
    <div className="rost-rd-overlay" onClick={onClose}>
      <div className="rost-rd-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="rost-rd-head">
          <div className="rost-rd-head-actions">
            <span className="rost-rd-title" style={{ fontSize: 18, margin: 0 }}>📷 OCR / Scan</span>
          </div>
          <button className="rost-icon-btn" type="button" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="rost-rd-body">
          {status === 'done' ? (
            <div className="rost-scan-placeholder">
              <div className="rost-scan-placeholder-icon">✅</div>
              <p className="rost-scan-placeholder-title">Recette importée</p>
              <p className="rost-rd-text" style={{ textAlign: 'center' }}><b>{title}</b></p>
              <p className="rost-rd-text" style={{ color: 'var(--dim)', textAlign: 'center' }}>
                Elle apparaît dans <b>Récupération → Validation</b>, prête à être analysée puis insérée.
              </p>
            </div>
          ) : status === 'uploading' ? (
            <div className="rost-scan-loading">
              <ClimbingBoxLoader color="#FF6B00" size={15} />
              <p className="rost-scan-placeholder-title">Analyse de l'image…</p>
              <p className="rost-rd-text" style={{ color: 'var(--dim)', textAlign: 'center' }}>
                OCR + lecture IA en cours. Cela peut prendre une vingtaine de secondes.
              </p>
            </div>
          ) : status === 'review' || status === 'importing' ? (
            <div>
              {isRecipe ? (
                <div className="rost-confidence-ok">
                  ✓ L'IA reconnaît une recette
                  {confidence > 0 && ` (${Math.round(confidence * 100)}% de confiance)`}
                  {title && <> — titre détecté : <b>{title}</b></>}
                </div>
              ) : (
                <div className="rost-confidence-warn">
                  ⚠️ L'IA ne pense pas que ce soit une recette
                  {confidence > 0 && ` (${Math.round(confidence * 100)}% de confiance)`}.
                  À vous de juger d'après le texte ci-dessous.
                </div>
              )}
              <p className="rost-rd-text" style={{ color: 'var(--dim)', margin: '10px 0 6px' }}>
                Texte extrait de l'image :
              </p>
              <pre className="rost-scan-raw">{rawText || '(aucun texte exploitable)'}</pre>
              {error && <p className="rost-error" style={{ marginTop: 12 }}>{error}</p>}
            </div>
          ) : (
            <>
              <p className="rost-rd-text" style={{ color: 'var(--dim)', marginBottom: 12 }}>
                Importez une photo ou un scan d'une recette (livre, écran…). L'image est analysée puis
                <b> immédiatement supprimée</b> — rien n'est conservé sur le serveur.
              </p>

              <input ref={inputRef} type="file" accept="image/*" hidden onChange={onInputChange} />

              {previewUrl ? (
                <div className="rost-scan-preview">
                  <img src={previewUrl} alt="Aperçu de l'image à analyser" className="rost-scan-img" />
                  <div className="rost-scan-preview-meta">
                    <span className="rost-res-date" style={{ wordBreak: 'break-all' }}>{file?.name}</span>
                    <button type="button" className="rost-link-btn" onClick={reset}>Changer d'image</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`rost-scan-drop ${dragOver ? 'is-over' : ''}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <span className="rost-scan-placeholder-icon">🖼️</span>
                  <span className="rost-scan-drop-title">Cliquez ou glissez une image ici</span>
                  <span className="rost-res-date">JPEG, PNG · 10 Mo max</span>
                </button>
              )}

              {error && <p className="rost-error" style={{ marginTop: 12 }}>{error}</p>}
            </>
          )}
        </div>

        <div className="rost-rd-head" style={{ borderTop: '1px solid var(--rule)', borderBottom: 'none', justifyContent: 'flex-end', gap: 8 }}>
          {status === 'done' ? (
            <>
              <button type="button" className="rost-btn rost-btn-ghost" onClick={reset}>Scanner une autre</button>
              <button type="button" className="rost-add-btn" onClick={onClose}>Terminé</button>
            </>
          ) : status === 'review' || status === 'importing' ? (
            <>
              <button type="button" className="rost-btn rost-btn-ghost" onClick={reset} disabled={busy}>← Reprendre</button>
              <button type="button" className="rost-add-btn" onClick={handleImport} disabled={busy || !rawText.trim()}>
                {status === 'importing' ? 'Import…' : '✓ Importer cette recette'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="rost-btn rost-btn-ghost" onClick={onClose} disabled={busy}>Annuler</button>
              <button type="button" className="rost-add-btn" onClick={handleAnalyse} disabled={!file || busy}>
                {status === 'uploading' ? '✦ Analyse en cours…' : '✦ Analyser'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
