/**
 * Cards revealed from the top of a deck ("Reveal the top card of your deck. If it's a Spell, draw
 * it."): the card leaves the deck, turns face up in front of both players, then goes where the
 * effect sent it (drawn into a hand, put in Reserve...) or back on top of the deck, where it stays
 * face up until it is drawn.
 *
 * Plain DOM and the Web Animations API, in the flights layer, like the flights (flights.ts).
 */
import type { CardCatalog, GameView, PlayerId, RevealView } from '@protocol';
import { artUrl, cardDef } from '../api/catalog';
import type { Snapshot } from './flights';

/** From the deck to the middle of the screen, turning face up */
const SHOW_MS = 520;
/** Face up in the middle, long enough to read it */
const HOLD_MS = 1500;
/** To where the effect sent it */
const AWAY_MS = 460;
/** One reveal after the other */
export const REVEAL_MS = SHOW_MS + HOLD_MS + AWAY_MS + 120;

/** The card revealed on top of each player's deck, still there (face up) */
export function revealedOnTop(view: GameView): Map<PlayerId, number> {
  const top = new Map<PlayerId, number>();
  const inLimbo = new Set(view.cards.filter((c) => c.zone === 'limbo').map((c) => c.id));
  for (const r of view.reveals ?? []) {
    if (r.to === 'deck' && inLimbo.has(r.cardId)) top.set(r.player, r.cardId);
    else if (top.get(r.player) === r.cardId) top.delete(r.player);
  }
  return top;
}

const OUTCOME: Record<RevealView['to'], string> = {
  hand: 'Drawn',
  deck: 'Not drawn: stays on top of the deck',
  reserve: 'Put in Reserve',
  discard: 'Discarded',
  board: 'Put into play',
};

function visible(r: DOMRect | null | undefined): r is DOMRect {
  return !!r && r.width > 2 && r.height > 2;
}

/** Shows one reveal, starting after `delay` ms. */
export function launchReveal(r: RevealView, prev: Snapshot, next: Snapshot, view: GameView, root: HTMLElement, layer: HTMLElement, catalog: CardCatalog, delay: number) {
  const you = view.you;
  const d = cardDef(catalog, r);
  const from = prev.piles.get(`deck-${r.player}`) ?? next.piles.get(`deck-${r.player}`);
  if (!d || !visible(from)) return;

  // Where it ends: the card itself when it is on screen (my hand, a Reserve, the top of the deck), else a pile
  const el = root.querySelector<HTMLElement>(`[data-card-id="${r.cardId}"]`);
  const elRect = el?.getBoundingClientRect();
  let to: DOMRect | undefined = visible(elRect) ? elRect : undefined;
  if (!to && r.to === 'hand' && r.player !== you) to = next.piles.get(`hand-${r.player}`);
  if (!to && r.to === 'discard') to = next.piles.get(`discard-${r.player}`);
  if (!to) to = next.piles.get(`deck-${r.player}`);
  const intoPile = !visible(elRect);

  // The card in the middle of the screen
  const h = Math.min(window.innerHeight * 0.46, 380);
  const w = h * 0.717;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.46;

  const show = document.createElement('div');
  show.className = 'reveal-show';
  Object.assign(show.style, { left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
  const card = document.createElement('div');
  card.className = 'reveal-card';
  const front = document.createElement('div');
  front.className = 'reveal-face reveal-front';
  front.style.backgroundImage = `url("${artUrl(d)}")`;
  const back = document.createElement('div');
  back.className = 'reveal-face reveal-back';
  card.append(front, back);
  const who = r.player === you ? 'You reveal' : `${view.players.find((p) => p.id === r.player)?.name ?? 'Opponent'} reveals`;
  const caption = document.createElement('div');
  caption.className = 'reveal-caption';
  const title = document.createElement('span');
  title.className = 'reveal-who';
  title.textContent = `${who} the top card of the deck`;
  const outcome = document.createElement('b');
  outcome.className = `reveal-outcome to-${r.to}`;
  outcome.textContent = OUTCOME[r.to];
  caption.append(title, outcome);
  show.append(card, caption);
  layer.appendChild(show);
  show.style.visibility = 'hidden';
  if (el) el.style.visibility = 'hidden';

  // Transforms from the middle to a rectangle (the clone is drawn in the middle)
  const at = (rc: DOMRect, rot: number) => {
    const s = rc.width / w;
    return `translate(${rc.left + rc.width / 2 - cx}px, ${rc.top + rc.height / 2 - cy}px) scale(${s}) rotate(${rot}deg)`;
  };
  const total = SHOW_MS + HOLD_MS + AWAY_MS;
  const o1 = SHOW_MS / total;
  const o2 = (SHOW_MS + HOLD_MS) / total;
  const timing = { duration: total, delay, fill: 'both' as const };
  const anim = show.animate(
    [
      { transform: at(from, -6), opacity: 1, easing: 'cubic-bezier(.2,.8,.3,1.05)' },
      { transform: 'none', opacity: 1, offset: o1 },
      { transform: 'scale(1.02)', opacity: 1, offset: o2, easing: 'cubic-bezier(.4,0,.3,1)' },
      { transform: visible(to) ? at(to, 0) : 'scale(0.6)', opacity: intoPile ? 0 : 1 },
    ],
    timing,
  );
  // Face down as it leaves the deck, face up in the middle
  card.animate(
    [
      { transform: 'rotateY(180deg)' },
      { transform: 'rotateY(180deg)', offset: o1 * 0.35 },
      { transform: 'rotateY(0deg)', offset: o1 },
      { transform: 'rotateY(0deg)' },
    ],
    timing,
  );
  // The caption only while the card is in the middle; its outcome a moment later
  caption.animate(
    [
      { opacity: 0 },
      { opacity: 0, offset: o1 * 0.8 },
      { opacity: 1, offset: o1 },
      { opacity: 1, offset: o2 },
      { opacity: 0, offset: o2 + 0.04 },
      { opacity: 0 },
    ],
    timing,
  );
  outcome.animate(
    [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 0, transform: 'translateY(6px)', offset: o1 + (o2 - o1) * 0.3 },
      { opacity: 1, transform: 'none', offset: o1 + (o2 - o1) * 0.42 },
      { opacity: 1, transform: 'none' },
    ],
    timing,
  );
  setTimeout(() => (show.style.visibility = ''), delay);
  const done = () => {
    if (el) el.style.visibility = '';
    show.remove();
  };
  anim.onfinish = done;
  anim.oncancel = done;
}
