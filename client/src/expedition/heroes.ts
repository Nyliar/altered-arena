import type { CardCatalog, CardDef, Faction } from '@protocol';

export const FACTIONS_FR: Record<Faction, string> = {
  AX: 'Axiom',
  BR: 'Bravos',
  LY: 'Lyra',
  MU: 'Muna',
  OD: 'Ordis',
  YZ: 'Yzmir',
  NE: 'Neutre',
};

export interface HeroIndex {
  byName: Map<string, CardDef>;
  byAsset: Map<string, CardDef>;
}

const indexes = new WeakMap<CardCatalog, HeroIndex>();

/** The heroes of the catalog, by name ("Teija & Nauraa") and by art asset (a replay names its heroes by asset) */
export function heroIndex(catalog: CardCatalog): HeroIndex {
  let ix = indexes.get(catalog);
  if (!ix) {
    ix = { byName: new Map(), byAsset: new Map() };
    for (const def of Object.values(catalog)) {
      if (def.type !== 'hero') continue;
      if (!ix.byName.has(def.name)) ix.byName.set(def.name, def);
      ix.byAsset.set(def.asset, def);
    }
    indexes.set(catalog, ix);
  }
  return ix;
}

/** What the replay of a tournament game says about its event (the BGA deck id embeds it) */
export function eventOf(deckId: string | undefined): string | null {
  if (!deckId) return null;
  try {
    const bytes = Uint8Array.from(atob(deckId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes))?.payload;
    return typeof payload?.tournamentName === 'string' ? payload.tournamentName : null;
  } catch {
    return null;
  }
}
