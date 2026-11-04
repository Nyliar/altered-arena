import { useEffect, useState, type ReactNode } from 'react';
import type { CardCatalog, CardDef, DeckSummary, Faction, ReunionDeckSummary } from '@protocol';
import { DeckGrid } from '../components/Picker';
import { cachedReunionDeck, loadReunionDeck, ReunionDeckPicker } from '../components/ReunionDeck';
import { Modal } from '../components/Modal';
import {
  type DeckSource,
  saveDeck,
  saveDeckSource,
  savedDeck,
  savedDeckSource,
  savedName,
  savedReunionDeck,
  saveName,
  saveReunionDeck,
} from '../screens/storage';

/** The deck of a request: a starter deck or an Altered Reunion deck */
export type ChosenDeck = { deck: string } | { reunionDeck: string };

export interface DeckChoice {
  name: string;
  /** The deck to play, null while none (or a Reunion deck the engine refuses) */
  chosen: ChosenDeck | null;
  hero: CardDef | null;
  deckName: string | undefined;
  deckFaction: Faction | null | undefined;
  /** Saves the name and deck on this device (the next screens start from them) */
  remember: () => void;
  open: () => void;
  /** The dialog (name and deck), rendered while open */
  dialog: ReactNode;
}

/**
 * The player's name and deck, from this device (localStorage), and the dialog that changes them.
 * `onConfirm` runs when the player validates the dialog.
 */
export function useDeckChoice(
  catalog: CardCatalog | null,
  decks: DeckSummary[] | null,
  onConfirm?: (name: string, chosen: ChosenDeck) => void,
): DeckChoice {
  const [name, setName] = useState(savedName() || 'Joueur');
  const [deck, setDeck] = useState<string | null>(savedDeck());
  const [source, setSource] = useState<DeckSource>(savedDeckSource());
  const [reunion, setReunion] = useState<ReunionDeckSummary | null>(() =>
    savedDeckSource() === 'reunion' ? cachedReunionDeck(savedReunionDeck()) : null,
  );
  const [picking, setPicking] = useState(false);

  // A saved Altered Reunion deck is loaded by its picker, which only lives in the dialog: load it here too.
  // Not while the dialog is open (the picker sets the deck, and clears it while a new link loads), and
  // never over a deck chosen meanwhile.
  useEffect(() => {
    const id = savedReunionDeck();
    if (source !== 'reunion' || !id || reunion || picking) return;
    let live = true;
    loadReunionDeck(id).then(
      (d) => live && setReunion((prev) => prev ?? d),
      () => null,
    );
    return () => {
      live = false;
    };
  }, [source, reunion, picking]);

  const starter = decks?.find((d) => d.id === deck) ?? null;
  const chosen: ChosenDeck | null =
    source === 'reunion' ? (reunion?.playable ? { reunionDeck: reunion.id } : null) : starter ? { deck: starter.id } : null;
  const heroRef = source === 'reunion' ? reunion?.heroRef : starter?.heroRef;
  const hero = heroRef && catalog ? (catalog[heroRef] ?? null) : null;
  const deckName = source === 'reunion' ? reunion?.name : starter?.name;
  const deckFaction = source === 'reunion' ? reunion?.faction : starter?.faction;

  function remember() {
    saveName(name);
    saveDeckSource(source);
    if (source === 'reunion' && reunion) saveReunionDeck(reunion.id);
    if (source === 'starter' && deck) saveDeck(deck);
  }

  const dialog = picking && (
    <Modal
      wide
      className="xp-modal"
      title="Votre deck"
      onClose={() => setPicking(false)}
      footer={
        <button
          type="button"
          className="xp-btn gold"
          disabled={!chosen}
          onClick={() => {
            remember();
            setPicking(false);
            if (chosen) onConfirm?.(name || 'Joueur', chosen);
          }}
        >
          Valider
        </button>
      }
    >
      <label className="xp-field">
        <span>Votre pseudo</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Joueur" />
      </label>
      <div className="deck-source" role="tablist" aria-label="Deck">
        {(
          [
            ['starter', 'Decks de départ'],
            ['reunion', 'Mon deck Altered Reunion'],
          ] as [DeckSource, string][]
        ).map(([src, label]) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={source === src}
            className={`tab ${source === src ? 'on' : ''}`}
            onClick={() => setSource(src)}
          >
            {label}
          </button>
        ))}
      </div>
      {source === 'reunion' ? (
        <ReunionDeckPicker catalog={catalog} initialId={reunion?.id ?? savedReunionDeck()} onChange={setReunion} />
      ) : decks && catalog ? (
        <DeckGrid decks={decks} catalog={catalog} selected={deck} onSelect={(d) => setDeck(d.id)} />
      ) : (
        <p className="xp-muted">Chargement des decks…</p>
      )}
    </Modal>
  );

  return { name: name || 'Joueur', chosen, hero, deckName, deckFaction, remember, open: () => setPicking(true), dialog };
}
