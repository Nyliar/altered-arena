import { useEffect, useState } from 'react';
import type { CardCatalog, ReunionDeckSummary } from '@protocol';
import { api, ApiError } from '../api/client';
import { useInspect } from '../game/inspect';
import { Card } from './Card';
import './ReunionDeck.css';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const summaries = new Map<string, ReunionDeckSummary>();

/** A deck already read in this page, if any: shown at once when a screen opens again */
export function cachedReunionDeck(id: string | null): ReunionDeckSummary | null {
  return (id && summaries.get(id)) || null;
}

/** Reads a deck (decks-api, checked by the engine) and keeps its summary for the rest of the page */
export async function loadReunionDeck(id: string, signal?: AbortSignal): Promise<ReunionDeckSummary> {
  const cached = summaries.get(id);
  if (cached) return cached;
  const d = await api.reunionDeck(id, signal);
  summaries.set(id, d);
  return d;
}

/** The decks-api id in a pasted deck link (or the id itself) */
export function deckIdOf(text: string): string | null {
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}

/**
 * An Altered Reunion deck: the player pastes its link (or id), the server reads it from decks-api and
 * the engine checks it. `onChange` gets the summary once loaded (null while there is none).
 */
export function ReunionDeckPicker({
  catalog,
  initialId,
  onChange,
}: {
  catalog: CardCatalog | null;
  initialId: string | null;
  onChange: (deck: ReunionDeckSummary | null) => void;
}) {
  const [text, setText] = useState(initialId ?? '');
  const [deck, setDeck] = useState<ReunionDeckSummary | null>(() => cachedReunionDeck(deckIdOf(initialId ?? '')));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { show } = useInspect();
  const id = deckIdOf(text);

  useEffect(() => {
    setError(null);
    const cached = cachedReunionDeck(id);
    if (cached) {
      setDeck(cached);
      onChange(cached);
      return;
    }
    setDeck(null);
    onChange(null);
    if (!id) return;
    const ctrl = new AbortController();
    setLoading(true);
    loadReunionDeck(id, ctrl.signal)
      .then((d) => {
        setDeck(d);
        onChange(d);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // onChange is the parent's setter: only the id matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hero = deck?.heroRef && catalog ? catalog[deck.heroRef] : null;
  return (
    <div className="reunion-deck">
      <label className="field wide">
        <span>Lien ou identifiant du deck (decks publics des deck builders Altered Reunion, ou les vôtres)</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://… /decks/01a19df6-f90d-7b42-8ecf-4b8da7586cfb"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      {text && !id && <p className="muted">Aucun identifiant de deck dans ce texte : collez le lien de la page du deck.</p>}
      {loading && (
        <p className="reunion-status">
          <span className="spinner" /> Lecture du deck…
        </p>
      )}
      {error && <p className="lobby-error">{error}</p>}
      {deck && (
        <div className={`reunion-summary ${deck.playable ? 'ok' : 'refused'}`}>
          <button
            type="button"
            className="reunion-hero"
            onClick={() => hero && show({ def: hero, mode: 'modal' })}
            aria-label={hero ? `Voir ${hero.name}` : undefined}
          >
            <Card def={hero} size="small" />
          </button>
          <div className="reunion-info">
            <b>{deck.name}</b>
            <span className="muted">
              {hero?.name ?? 'Héros inconnu'} · {deck.size} cartes
            </span>
            {deck.playable ? (
              <span className="reunion-ok">Prêt à jouer</span>
            ) : (
              <span className="lobby-error">Injouable ici : {deck.problem ?? 'refusé'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
