import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { PlayerId } from '@protocol';
import { Lobby } from './screens/Lobby';
import { GameScreen } from './screens/GameScreen';
import { Home } from './expedition/Home';
import { Play, type PlayMode } from './expedition/Play';
import { Salon } from './expedition/Salon';
import { Replays } from './expedition/Replays';
import { Toasts } from './components/Toasts';
import { saveToken, tokenOf } from './screens/storage';

// Replays of BGA games (and, for development, recorded GameViews)
const ReplayScreen = lazy(() => import('./screens/ReplayScreen'));

type Route =
  | { name: 'home' }
  | { name: 'play'; mode: PlayMode }
  | { name: 'salon'; gameId: string }
  | { name: 'replays' }
  | { name: 'lobby' }
  | { name: 'game'; gameId: string; player: PlayerId | null; token: string | null }
  | { name: 'replay' };

/**
 * URL of a seat: ?game=ID&player=PID. Its secret token stays on this device (localStorage); share
 * links carry it in the fragment (#token=T), which browsers never send to the server.
 */
export function gameSearch(gameId: string, player: PlayerId, token?: string | null): string {
  saveToken(gameId, player, token);
  return `?game=${encodeURIComponent(gameId)}&player=${player}`;
}

function parse(): Route {
  const q = new URLSearchParams(location.search);
  const game = q.get('game');
  const player = Number(q.get('player'));
  if (game && player) {
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('token') ?? q.get('token');
    if (fromLink) {
      saveToken(game, player, fromLink);
      // Keep the secret out of the address bar and history
      history.replaceState(history.state, '', `${location.pathname}?game=${encodeURIComponent(game)}&player=${player}`);
    }
    const token = tokenOf(game, player);
    return { name: 'game', gameId: game, player, token };
  }
  if (game) return { name: 'game', gameId: game, player: null, token: null }; // spectator
  if (q.has('replay')) return q.get('replay') ? { name: 'replay' } : { name: 'replays' };
  if (q.has('play')) {
    const m = q.get('play');
    return { name: 'play', mode: m === 'friend' || m === 'ai' ? m : 'match' };
  }
  const salon = q.get('salon');
  if (salon) return { name: 'salon', gameId: salon };
  if (q.has('lobby')) return { name: 'lobby' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const f = () => setRoute(parse());
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  const go = useCallback((search: string, replace = false) => {
    const url = `${location.pathname}${search}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    setRoute(parse());
    window.scrollTo(0, 0);
  }, []);
  // Links between the screens (href="?play"...) change the route without reloading the page
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!a || a.target || href === null || href === undefined || !(href === '?' || href.startsWith('?'))) return;
      e.preventDefault();
      go(href === '?' ? '' : href);
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [go]);
  const join = (g: string, p: PlayerId, t?: string | null) => {
    saveToken(g, p, t);
    go(gameSearch(g, p, t ?? tokenOf(g, p)));
  };

  let screen;
  if (route.name === 'game')
    screen = (
      <GameScreen
        key={`${route.gameId}:${route.player}`}
        gameId={route.gameId}
        player={route.player}
        token={route.token}
        onLeave={() => go('?play')}
        onSwitchPlayer={(p) => go(gameSearch(route.gameId, p, tokenOf(route.gameId, p)), true)}
      />
    );
  else if (route.name === 'replay')
    screen = (
      <Suspense fallback={null}>
        <ReplayScreen />
      </Suspense>
    );
  else if (route.name === 'play')
    screen = <Play key={route.mode} initialMode={route.mode} onJoin={join} onRoom={(g) => go(`?salon=${encodeURIComponent(g)}`)} />;
  else if (route.name === 'salon') screen = <Salon key={route.gameId} gameId={route.gameId} onJoin={join} />;
  else if (route.name === 'replays') screen = <Replays />;
  else if (route.name === 'lobby') screen = <Lobby onJoin={join} />;
  else screen = <Home />;

  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}
