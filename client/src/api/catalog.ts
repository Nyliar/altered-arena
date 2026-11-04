import { useEffect, useState } from 'react';
import type { CardCatalog, CardDef, CardView, DeckSummary, Faction } from '@protocol';
import { api } from './client';

let catalogPromise: Promise<CardCatalog> | null = null;
let decksPromise: Promise<DeckSummary[]> | null = null;
let catalogCache: CardCatalog | null = null;
let decksCache: DeckSummary[] | null = null;

export function loadCatalog(): Promise<CardCatalog> {
  if (!catalogPromise) {
    catalogPromise = api.cards().then((c) => (catalogCache = c));
    catalogPromise.catch(() => (catalogPromise = null));
  }
  return catalogPromise;
}

export function loadDecks(): Promise<DeckSummary[]> {
  if (!decksPromise) {
    decksPromise = api.decks().then((d) => (decksCache = d));
    decksPromise.catch(() => (decksPromise = null));
  }
  return decksPromise;
}

export function useCatalog(): { catalog: CardCatalog | null; error: string | null } {
  const [catalog, setCatalog] = useState<CardCatalog | null>(catalogCache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (catalog) return;
    let live = true;
    loadCatalog().then(
      (c) => live && setCatalog(c),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [catalog]);
  return { catalog, error };
}

export function useDecks(): { decks: DeckSummary[] | null; error: string | null } {
  // Loaded once per page: a screen opened again shows them at once, without a flash of empty content
  const [decks, setDecks] = useState<DeckSummary[] | null>(decksCache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (decks) return;
    let live = true;
    loadDecks().then(
      (d) => live && setDecks(d),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [decks]);
  return { decks, error };
}

/** The printed data of a card in a view: its catalog entry, or its own data for a Unique */
export function cardDef(catalog: CardCatalog, c: Pick<CardView, 'ref' | 'unique'> | undefined | null): CardDef | null {
  if (!c) return null;
  return c.unique ?? (c.ref ? (catalog[c.ref] ?? null) : null);
}

const ASSET_FACTIONS: Record<string, Faction> = { OR: 'OD' };

/**
 * URL of a card's artwork. The protocol documents /assets/cards/{faction}/{asset}.jpg, but the art
 * is stored under the faction of the *asset* (a Muna rare drawn from a Bravos card lives in BR/,
 * Ordis assets are named "OR"), so the folder is taken from the asset name when possible.
 */
export function artUrl(def: Pick<CardDef, 'asset' | 'faction'>): string {
  const m = /^ALT_[A-Z]+_[A-Z]_([A-Z]{2})_/.exec(def.asset);
  const folder = m ? (ASSET_FACTIONS[m[1]] ?? m[1]) : def.faction;
  return `/assets/cards/${folder}/${def.asset}.jpg`;
}

export const FACTION_NAMES: Record<Faction, string> = {
  AX: 'Axiom',
  BR: 'Bravos',
  LY: 'Lyra',
  MU: 'Muna',
  OD: 'Ordis',
  YZ: 'Yzmir',
  NE: 'Neutral',
};
