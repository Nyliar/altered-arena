import { useEffect, useState } from 'react';
import type { CardCatalog, ReunionDeckSummary } from '@protocol';
import { api, ApiError } from '../api/client';
import { useInspect } from '../game/inspect';
import { Card } from './Card';
import './ReunionDeck.css';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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
  const [deck, setDeck] = useState<ReunionDeckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { show } = useInspect();
  const id = deckIdOf(text);

  useEffect(() => {
    setDeck(null);
    onChange(null);
    setError(null);
    if (!id) return;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .reunionDeck(id, ctrl.signal)
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
        <span>Deck link or id (Altered Reunion deck builders: public decks, or your own)</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://… /decks/01a19df6-f90d-7b42-8ecf-4b8da7586cfb"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      {text && !id && <p className="muted">No deck id in this text: paste the link of the deck page.</p>}
      {loading && (
        <p className="reunion-status">
          <span className="spinner" /> Reading the deck…
        </p>
      )}
      {error && <p className="lobby-error">{error}</p>}
      {deck && (
        <div className={`reunion-summary ${deck.playable ? 'ok' : 'refused'}`}>
          <button
            type="button"
            className="reunion-hero"
            onClick={() => hero && show({ def: hero, mode: 'modal' })}
            aria-label={hero ? `Show ${hero.name}` : undefined}
          >
            <Card def={hero} size="small" />
          </button>
          <div className="reunion-info">
            <b>{deck.name}</b>
            <span className="muted">
              {hero?.name ?? 'Unknown hero'} · {deck.size} cards
            </span>
            {deck.playable ? (
              <span className="reunion-ok">Ready to play</span>
            ) : (
              <span className="lobby-error">Cannot be played here: {deck.problem ?? 'refused'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
