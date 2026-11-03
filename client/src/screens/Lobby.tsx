import { useEffect, useRef, useState } from 'react';
import type { AiSummary, PlayerId, ReunionDeckSummary } from '@protocol';
import { useCatalog, useDecks } from '../api/catalog';
import { api, ApiError } from '../api/client';
import { InspectProvider } from '../game/inspect';
import { DeckGrid } from '../components/Picker';
import { ReunionDeckPicker } from '../components/ReunionDeck';
import { Inspector } from '../components/Inspector';
import { toast } from '../game/toasts';
import {
  confirmTurnPref,
  type DeckSource,
  lastGame,
  saveConfirmTurnPref,
  saveDeck,
  saveDeckSource,
  savedDeck,
  savedDeckSource,
  savedName,
  savedReunionDeck,
  saveName,
  saveReunionDeck,
  saveToken,
} from './storage';
import './Lobby.css';

type Mode = 'bot' | 'match' | 'hotseat' | 'join';

export function Lobby({ onJoin }: { onJoin: (gameId: string, player: PlayerId, token?: string | null) => void }) {
  const { catalog, error: catErr } = useCatalog();
  const { decks, error: deckErr } = useDecks();
  const [mode, setMode] = useState<Mode>('bot');
  const [name, setName] = useState(savedName() || 'Player');
  const [name2, setName2] = useState('Player 2');
  const [confirmTurn, setConfirmTurn] = useState(confirmTurnPref);
  const [deck, setDeck] = useState<string | null>(savedDeck());
  const [source, setSource] = useState<DeckSource>(savedDeckSource());
  const [reunion, setReunion] = useState<ReunionDeckSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [hotseat, setHotseat] = useState<{ gameId: string; players: { id: PlayerId; name: string; token?: string }[] } | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const ticketRef = useRef<string | null>(null);
  const [joinId, setJoinId] = useState('');
  const [joinPlayer, setJoinPlayer] = useState<PlayerId>(2001);
  const [joinToken, setJoinToken] = useState('');
  const [ais, setAis] = useState<AiSummary[] | null>(null);
  const [ai, setAi] = useState('simple');
  const last = lastGame();

  useEffect(() => {
    api.ais().then(setAis, () => setAis(null));
  }, []);
  const opponent = ais?.find((a) => a.id === ai);

  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : String(e));

  /** The deck of the player: a starter deck, or an Altered Reunion deck the engine plays */
  const chosen: { deck: string } | { reunionDeck: string } | null =
    source === 'reunion' ? (reunion?.playable ? { reunionDeck: reunion.id } : null) : deck ? { deck } : null;
  function rememberDeck() {
    saveDeckSource(source);
    if (source === 'reunion' && reunion) saveReunionDeck(reunion.id);
    if (source === 'starter' && deck) saveDeck(deck);
  }

  async function startBot() {
    if (!chosen) return;
    setBusy(true);
    saveName(name);
    rememberDeck();
    try {
      const g = await api.createGame({ players: [{ name: name || 'Player', ...chosen }, { name: 'Bot', bot: true, ai }] });
      onJoin(g.gameId, g.players[0].id, g.players[0].token);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function startHotseat() {
    setBusy(true);
    saveName(name);
    try {
      const g = await api.createGame({ players: [{ name: name || 'Player 1' }, { name: name2 || 'Player 2' }] });
      for (const p of g.players) saveToken(g.gameId, p.id, p.token);
      setHotseat({ gameId: g.gameId, players: g.players });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  /** Matchmaking: join the queue, then long poll the ticket until matched */
  async function findOpponent() {
    if (!chosen) return;
    saveName(name);
    rememberDeck();
    setBusy(true);
    try {
      let t = await api.matchmake(name || 'Player', chosen);
      ticketRef.current = t.ticket;
      setTicket(t.ticket);
      while (t.status !== 'matched' && ticketRef.current === t.ticket) {
        try {
          t = await api.ticket(t.ticket);
        } catch (e) {
          if (e instanceof ApiError && e.user) throw e;
          await new Promise((r) => setTimeout(r, 2000)); // network hiccup: retry
        }
      }
      if (t.status === 'matched' && t.gameId && t.player && ticketRef.current === t.ticket) {
        ticketRef.current = null;
        onJoin(t.gameId, t.player, t.token);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setTicket(null);
    }
  }
  function leaveQueue() {
    const t = ticketRef.current;
    ticketRef.current = null;
    setTicket(null);
    if (t) void api.leaveQueue(t);
  }
  // Leave the queue when the lobby closes
  useEffect(
    () => () => {
      if (ticketRef.current) void api.leaveQueue(ticketRef.current);
    },
    [],
  );

  const link = (gameId: string, p: PlayerId, token?: string) =>
    `${location.origin}${location.pathname}?game=${encodeURIComponent(gameId)}&player=${p}${token ? `#token=${encodeURIComponent(token)}` : ''}`;
  const selectedDeck = decks?.find((d) => d.id === deck);

  return (
    <InspectProvider catalog={catalog}>
      <div className="lobby-scroll">
      <div className="lobby">
        <header className="lobby-head">
          <h1>
            Altered <span>Arena</span>
          </h1>
          {last && (
            <button type="button" className="btn" onClick={() => onJoin(last.gameId, last.player, last.token)}>
              Resume game {last.gameId}
            </button>
          )}
          <a className="btn ghost" href="?replay">
            Replays
          </a>
        </header>

        <label className="pref">
          <input
            type="checkbox"
            checked={confirmTurn}
            onChange={(e) => {
              setConfirmTurn(e.target.checked);
              saveConfirmTurnPref(e.target.checked);
            }}
          />
          <span>Confirm the end of my turn (a short countdown with Undo)</span>
        </label>

        <div className="lobby-tabs" role="tablist">
          {(
            [
              ['bot', 'Play vs Bot'],
              ['match', 'Find an opponent'],
              ['hotseat', 'Two players'],
              ['join', 'Join a game'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>

        {(catErr || deckErr) && <p className="lobby-error">Server unreachable: {catErr ?? deckErr}</p>}

        {(mode === 'bot' || mode === 'match') && (
          <section className="lobby-section">
            {mode === 'match' && (
              <p className="muted">Waits for another player looking for a game, then starts it. Both players use the deck they picked here.</p>
            )}
            <label className="field">
              <span>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            </label>
            {mode === 'bot' && ais && ais.length > 1 && (
              <label className="field">
                <span>Opponent{opponent?.hero ? ` (plays its own deck: ${opponent.hero})` : ''}</span>
                <select value={ai} onChange={(e) => setAi(e.target.value)}>
                  {(
                    [
                      ['simple', 'Bot'],
                      ['imitation', 'Imitation AIs (tournament players)'],
                      ['deck', 'Deck AIs'],
                    ] as [AiSummary['kind'], string][]
                  ).map(([kind, group]) => (
                    <optgroup key={kind} label={group}>
                      {ais
                        .filter((a) => a.kind === kind)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <h2>Choose a deck</h2>
            <div className="deck-source" role="tablist" aria-label="Deck">
              {(
                [
                  ['starter', 'Starter decks'],
                  ['reunion', 'My Altered Reunion deck'],
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
              <ReunionDeckPicker catalog={catalog} initialId={savedReunionDeck()} onChange={setReunion} />
            ) : decks && catalog ? (
              <DeckGrid decks={decks} catalog={catalog} selected={deck} onSelect={(d) => setDeck(d.id)} />
            ) : (
              <p className="muted">Loading decks…</p>
            )}
            <div className="lobby-cta">
              <span className="muted">
                {source === 'reunion'
                  ? reunion?.playable
                    ? `Deck: ${reunion.name}`
                    : 'Paste the link of a deck'
                  : selectedDeck
                    ? `Deck: ${selectedDeck.name}`
                    : 'Pick a deck'}
              </span>
              {source === 'starter' && (
                <button
                  type="button"
                  className="btn"
                  disabled={!decks}
                  onClick={() => decks && setDeck(decks[Math.floor(Math.random() * decks.length)].id)}
                >
                  Random
                </button>
              )}
              {mode === 'bot' ? (
                <button type="button" className="btn primary big" disabled={!chosen || busy} onClick={startBot}>
                  {busy ? 'Starting…' : 'Play'}
                </button>
              ) : ticket ? (
                <>
                  <span className="spinner" />
                  <span>Looking for an opponent…</span>
                  <button type="button" className="btn" onClick={leaveQueue}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn primary big" disabled={!chosen || busy} onClick={findOpponent}>
                  Find an opponent
                </button>
              )}
            </div>
          </section>
        )}

        {mode === 'hotseat' && (
          <section className="lobby-section narrow">
            <p className="muted">
              Creates a game between two human players. Each player chooses a deck in game. Open each player in its own tab or device, or
              switch between them on one device.
            </p>
            <label className="field">
              <span>Player 1</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            </label>
            <label className="field">
              <span>Player 2</span>
              <input value={name2} onChange={(e) => setName2(e.target.value)} maxLength={24} />
            </label>
            <button type="button" className="btn primary" disabled={busy} onClick={startHotseat}>
              Create game
            </button>
            {hotseat && (
              <div className="hotseat-links">
                <h3>Game {hotseat.gameId}</h3>
                {hotseat.players.map((p) => (
                  <div key={p.id} className="hotseat-row">
                    <b>{p.name}</b>
                    <input readOnly value={link(hotseat.gameId, p.id, p.token)} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        void navigator.clipboard?.writeText(link(hotseat.gameId, p.id, p.token));
                        toast('Link copied', 'info', 1500);
                      }}
                    >
                      Copy
                    </button>
                    <button type="button" className="btn ghost" onClick={() => window.open(link(hotseat.gameId, p.id, p.token), '_blank')}>
                      New tab
                    </button>
                    <button type="button" className="btn primary" onClick={() => onJoin(hotseat.gameId, p.id, p.token)}>
                      Play here
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {mode === 'join' && (
          <section className="lobby-section narrow">
            <label className="field">
              <span>Game id</span>
              <input value={joinId} onChange={(e) => setJoinId(e.target.value.trim())} placeholder="e.g. 12" />
            </label>
            <label className="field">
              <span>Seat</span>
              <select value={joinPlayer} onChange={(e) => setJoinPlayer(Number(e.target.value))}>
                <option value={2001}>Player 1 (2001)</option>
                <option value={2002}>Player 2 (2002)</option>
              </select>
            </label>
            <label className="field">
              <span>Seat token (leave empty to watch as a spectator)</span>
              <input value={joinToken} onChange={(e) => setJoinToken(e.target.value.trim())} />
            </label>
            <button type="button" className="btn primary" disabled={!joinId} onClick={() => onJoin(joinId, joinPlayer, joinToken || null)}>
              Join
            </button>
            <p className="muted">You can also open a link of the form ?game=ID&amp;player=2001&amp;token=SECRET.</p>
          </section>
        )}
      </div>
      </div>
      <Inspector />
    </InspectProvider>
  );
}
