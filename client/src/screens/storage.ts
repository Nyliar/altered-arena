import type { PlayerId } from '@protocol';

const KEY_GAME = 'arena.lastGame';
const KEY_NAME = 'arena.name';
const KEY_DECK = 'arena.deck';

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // storage unavailable (private mode): nothing to remember
  }
}

export interface LastGame {
  gameId: string;
  player: PlayerId;
  token?: string | null;
}
export const rememberGame = (g: LastGame) => write(KEY_GAME, g);
/** Order of the cards in my hand on the table (Hud.tsx, HandSort) */
export const savedHandSort = () => read<string>('arena.handSort');
export const saveHandSort = (s: string) => write('arena.handSort', s);
export const lastGame = () => read<LastGame>(KEY_GAME);
// `slot`: another set of name and deck (the second side of a game against oneself)
export const savedName = (slot = '') => read<string>(KEY_NAME + slot) ?? '';
export const saveName = (n: string, slot = '') => write(KEY_NAME + slot, n);
export const savedDeck = (slot = '') => read<string>(KEY_DECK + slot);
export const saveDeck = (d: string, slot = '') => write(KEY_DECK + slot, d);
const KEY_DECK_SOURCE = 'arena.deckSource';
const KEY_REUNION_DECK = 'arena.reunionDeck';
export type DeckSource = 'starter' | 'reunion';
export const savedDeckSource = (slot = '') => read<DeckSource>(KEY_DECK_SOURCE + slot) ?? 'starter';
export const saveDeckSource = (s: DeckSource, slot = '') => write(KEY_DECK_SOURCE + slot, s);
/** The last Altered Reunion deck (decks-api id) */
export const savedReunionDeck = (slot = '') => read<string>(KEY_REUNION_DECK + slot);
export const saveReunionDeck = (id: string, slot = '') => write(KEY_REUNION_DECK + slot, id);

const KEY_SOLO = 'arena.soloGames';
/** Games against oneself: this device plays both seats and may switch between them (never another game) */
export function markSoloGame(gameId: string) {
  const l = (read<string[]>(KEY_SOLO) ?? []).filter((g) => g !== gameId);
  write(KEY_SOLO, [...l, gameId].slice(-30));
}
export const isSoloGame = (gameId: string) => (read<string[]>(KEY_SOLO) ?? []).includes(gameId);
export const forgetGame = (gameId: string) => {
  if (lastGame()?.gameId === gameId) {
    try {
      localStorage.removeItem(KEY_GAME);
    } catch {
      // ignore
    }
  }
};

const KEY_TOKENS = 'arena.tokens';
type Tokens = Record<string, Record<string, string>>;

/** Remembers the secret token of a seat, so that the game can be reopened (or the seat switched in hot seat) */
export function saveToken(gameId: string, player: PlayerId, token: string | null | undefined) {
  if (!token) return;
  const all = read<Tokens>(KEY_TOKENS) ?? {};
  all[gameId] = { ...(all[gameId] ?? {}), [player]: token };
  // keep the 30 most recent games
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k];
  write(KEY_TOKENS, all);
}
export function tokenOf(gameId: string, player: PlayerId): string | null {
  return read<Tokens>(KEY_TOKENS)?.[gameId]?.[player] ?? null;
}

// Preferences of this device
const KEY_CONFIRM_TURN = 'arena.confirmTurn';
/** Wait a moment (with Undo) before the end of a turn is confirmed; off: confirmed at once */
export const confirmTurnPref = () => read<boolean>(KEY_CONFIRM_TURN) ?? false;
