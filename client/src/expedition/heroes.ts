import type { CardCatalog, CardDef, Faction } from '@protocol';
import { artUrl } from '../api/catalog';

/** Hero arts of the home page (served by the game server, like every card art) */
export const SHOWCASE = {
  ordis: artUrl({ asset: 'ALT_CORE_B_OR_01_C', faction: 'OD' }),
  muna: artUrl({ asset: 'ALT_CORE_B_MU_01_C', faction: 'MU' }),
  axiom: artUrl({ asset: 'ALT_DUSTER_B_AX_85_C', faction: 'AX' }),
  lyra: artUrl({ asset: 'ALT_CORE_B_LY_03_C', faction: 'LY' }),
  yzmir: artUrl({ asset: 'ALT_EOLE_B_YZ_105_C', faction: 'YZ' }),
  bravos: artUrl({ asset: 'ALT_EOLE_B_BR_105_C', faction: 'BR' }),
};

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
