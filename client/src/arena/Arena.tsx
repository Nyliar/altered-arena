import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameCtx } from '../game/GameContext';
import { Log } from '../components/Log';
import { EndScreen } from '../components/EndScreen';
import { useArenaLayout } from './layout';
import { Mat } from './Mat';
import { ArenaHand, InfoChip, OppHand, PhaseBanner, PlayerChip, Prompt, RotateHint } from './Hud';
import { fly, snapshot, type Snapshot } from './flights';
import { launchReveal, REVEAL_MS } from './reveals';
import { CastFocus, TargetArrows } from './Cast';
import { CardActions } from './CardActions';
import { TrackButton } from './TrackButton';
import { MarkerGhost } from './TerrainMarkers';
import './arena.css';

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * The game table: the BGA mat tilted in perspective (CSS 3D, plain DOM), with the hand, the
 * prompt and the players around it. Cards changing zone fly between their places (flights.ts).
 */
export function Arena({ onLeave, connected, extraTop }: { onLeave: () => void; connected: boolean; extraTop?: ReactNode }) {
  const { view, me, opp, log, you, catalog } = useGameCtx();
  const { layout: l, scale, portrait } = useArenaLayout();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const snap = useRef<Snapshot | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  // Reveals already shown (those of the first view are not: they happened before)
  const seenReveals = useRef<Set<number> | null>(null);

  // Flights: compare the cards' places before and after each new view, before paint
  useLayoutEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;
    const next = snapshot(root, view);
    const prev = snap.current;
    snap.current = next;
    const reveals = view.reveals ?? [];
    const fresh = seenReveals.current ? reveals.filter((r) => !seenReveals.current!.has(r.seq)) : [];
    seenReveals.current = new Set([...(seenReveals.current ?? []), ...reveals.map((r) => r.seq)]);
    if (prev && prev.seq !== view.seq) {
      const draws = new Map<number, number>();
      for (const r of fresh) if (r.to === 'hand') draws.set(r.player, (draws.get(r.player) ?? 0) + 1);
      fly(prev, next, view, root, layer, catalog, { cards: new Set(fresh.map((r) => r.cardId)), draws });
      fresh.forEach((r, i) => launchReveal(r, prev, next, view, root, layer, catalog, i * REVEAL_MS));
    }
    // Measure again once the cards have settled (flights, hand layout)
    const t = setTimeout(() => {
      if (rootRef.current) snap.current = snapshot(rootRef.current, viewRef.current);
    }, 450);
    return () => clearTimeout(t);
  }, [view, catalog]);
  // A new layout or scale moves everything: measure again, without flights
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (rootRef.current) snap.current = snapshot(rootRef.current, viewRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [l, scale]);

  const [logOpen, setLogOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const lastSeq = log.length ? log[log.length - 1].seq : 0;
  useEffect(() => {
    if (logOpen) setSeen(lastSeq);
  }, [logOpen, lastSeq]);
  const unread = log.filter((e) => e.seq > seen).length;

  const stageStyle = { width: l.W, height: l.H, transform: `translate(-50%, -50%) scale(${scale})`, ...l.vars } as CSSProperties;
  return (
    <div className={`arena layout-${l.mode}`} ref={rootRef} style={{ ['--stage-scale' as string]: scale } as CSSProperties}>
      <div className="arena-stage" style={stageStyle}>
        <div
          className="arena-scene"
          style={{ left: l.plane.left, top: l.plane.top, width: l.plane.w, height: l.plane.h, perspective: `${l.plane.perspective}px` }}
        >
          <div className="arena-plane" data-cast="" style={{ transform: `rotateX(${l.plane.tilt}deg)` }}>
            <Mat l={l} />
          </div>
        </div>
        {opp && <PlayerChip player={opp} mine={false} className="chip-opp" />}
        {me && <PlayerChip player={me} mine={you !== null} className="chip-me" />}
        {opp && <OppHand player={opp} />}
        <InfoChip onLeave={onLeave} connected={connected} onLog={() => setLogOpen((o) => !o)} unread={unread} />
        <Prompt />
        <ArenaHand />
        <div className="end-dock">
          <TrackButton />
        </div>
        <PhaseBanner />
        {extraTop && <div className="arena-extra">{extraTop}</div>}
      </div>
      <CastFocus />
      <CardActions />
      <TargetArrows />
      <MarkerGhost />
      <div className="arena-flights" ref={layerRef} aria-hidden="true" />
      <Log entries={log} you={you} open={logOpen} onClose={() => setLogOpen(false)} />
      <EndScreen onLeave={onLeave} />
      {portrait && coarse && <RotateHint />}
    </div>
  );
}
