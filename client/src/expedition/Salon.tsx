import { useEffect, useRef, useState } from 'react';
import type { CardDef, PlayerId, RoomView, SeatUpdate } from '@protocol';
import { artUrl, useCatalog, useDecks } from '../api/catalog';
import { api, ApiError } from '../api/client';
import { cachedReunionDeck, loadReunionDeck } from '../components/ReunionDeck';
import { Inspector } from '../components/Inspector';
import { InspectProvider } from '../game/inspect';
import { toast } from '../game/toasts';
import { tokenOf } from '../screens/storage';
import { Shell } from './Shell';
import { useDeckChoice } from './deckChoice';
import { FACTIONS_FR } from './heroes';
import { LinkIcon } from './Play';
import './play.css';
import './salon.css';

const HOST: PlayerId = 2001;
const GUEST: PlayerId = 2002;

const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : String(e));

/**
 * A private room (a game against a friend): the host sends the link, each player chooses a deck and
 * says they are ready; the game starts once both are. The friend's deck stays hidden until the game.
 */
export function Salon({ roomId, player, onStart }: { roomId: string; player: PlayerId; onStart: (player: PlayerId) => void }) {
  const { catalog } = useCatalog();
  const { decks } = useDecks();
  const token = tokenOf(roomId, player);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function update(u: SeatUpdate) {
    if (!token) return;
    setBusy(true);
    try {
      setRoom(await api.updateSeat(roomId, player, token, u));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const choice = useDeckChoice(catalog, decks, (name, chosen) => void update({ name, ...chosen }));

  // Long poll the room: the other player's arrival and readiness, the start of the game
  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    let since: number | undefined;
    (async () => {
      while (!ctrl.signal.aborted) {
        try {
          const r = await api.room(roomId, player, token, since, ctrl.signal);
          since = r.seq;
          setRoom(r);
          if (r.started) return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          if (e instanceof ApiError && e.user) return setGone(true);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => ctrl.abort();
  }, [roomId, player, token]);

  useEffect(() => {
    if (room?.started) onStart(player);
  }, [room?.started, player, onStart]);

  // The guest arrives without a deck: they bring their name, and the deck they last played on this device
  const brought = useRef(false);
  const me = room?.seats.find((s) => s.id === player);
  useEffect(() => {
    if (brought.current || !me || me.hasDeck || room?.started) return;
    if (player === GUEST && !choice.chosen && decks === null) return; // the starter decks are still loading
    brought.current = true;
    void update(choice.chosen ? { name: choice.name, ...choice.chosen } : { name: choice.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, decks, choice.chosen]);

  // My deck as the room has it (the server decides), its hero from the catalog
  const roomDeck = room?.deck ?? null;
  const reunionId = roomDeck && 'reunionDeck' in roomDeck ? roomDeck.reunionDeck : null;
  const [reunion, setReunion] = useState(() => cachedReunionDeck(reunionId));
  useEffect(() => {
    if (!reunionId) return setReunion(null);
    let live = true;
    loadReunionDeck(reunionId).then(
      (d) => live && setReunion(d),
      () => null,
    );
    return () => {
      live = false;
    };
  }, [reunionId]);
  const starter = roomDeck && 'deck' in roomDeck ? (decks?.find((d) => d.id === roomDeck.deck) ?? null) : null;
  const myDeck = starter ?? (reunionId ? reunion : null);
  const myHero: CardDef | null = myDeck?.heroRef && catalog ? (catalog[myDeck.heroRef] ?? null) : null;

  const other = room?.seats.find((s) => s.id !== player);
  const guestToken = tokenOf(roomId, GUEST);
  const link = `${location.origin}${location.pathname}?salon=${encodeURIComponent(roomId)}&player=${GUEST}${guestToken ? `#token=${encodeURIComponent(guestToken)}` : ''}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié', 'info', 1500);
    } catch {
      toast('Copie impossible : sélectionnez le lien');
    }
  }
  const share = 'share' in navigator ? () => void navigator.share({ title: 'Altered Arena', text: 'Une partie d’Altered ?', url: link }).catch(() => null) : null;

  if (gone || !token)
    return (
      <Shell current="play">
        <div className="xp-head">
          <h1>Salon introuvable</h1>
        </div>
        <p className="xp-muted">
          {token ? "Ce salon n'existe plus sur le serveur." : "Ce lien d'invitation est incomplet, ou le salon a été créé sur un autre appareil."}
        </p>
        <a className="xp-btn" href="?play=friend">
          Créer un nouveau salon
        </a>
      </Shell>
    );

  const otherStatus = !other?.joined
    ? player === HOST
      ? 'pas encore arrivé'
      : 'absent'
    : !other.hasDeck
      ? 'choisit son deck…'
      : other.ready
        ? 'Prêt'
        : 'pas encore prêt';

  return (
    <InspectProvider catalog={catalog}>
      <Shell current="play">
        <div className="xp-head">
          <a className="xp-btn" href="?play=friend">
            ← Quitter le salon
          </a>
          <div>
            <span className="xp-tag">Salon privé · {roomId}</span>
            <h1>{other?.joined ? (player === HOST ? 'Votre ami est arrivé' : 'Partie entre amis') : 'Invitez votre ami'}</h1>
          </div>
        </div>

        <div className="salon">
          <figure className="salon-seat">
            {myHero ? <img className="salon-card" src={artUrl(myHero)} alt={myHero.name} /> : <span className="salon-card empty" />}
            <figcaption>
              <strong>{me?.name ?? choice.name}</strong>
              <span>{myHero ? `${myHero.name} · ${FACTIONS_FR[myHero.faction]}` : 'Aucun deck choisi'}</span>
              {me?.ready ? <span className="salon-ready">Prêt</span> : <span className="salon-waiting">Pas encore prêt</span>}
            </figcaption>
            <button type="button" className="xp-btn" onClick={choice.open} disabled={busy}>
              {me?.hasDeck ? 'Changer de deck' : 'Choisir un deck'}
            </button>
          </figure>

          <section className="salon-middle" aria-live="polite">
            <span className="salon-vs">contre</span>
            {player === HOST && !other?.joined && (
              <div className="salon-box">
                <label htmlFor="salon-link" className="salon-label">
                  Lien d'invitation
                </label>
                <input id="salon-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <div className="salon-actions">
                  <button type="button" className="xp-btn gold" onClick={copy}>
                    Copier le lien
                  </button>
                  {share && (
                    <button type="button" className="xp-btn" onClick={share}>
                      Partager…
                    </button>
                  )}
                </div>
                <span className="xp-muted">Votre ami ouvre le lien, choisit un deck et se déclare prêt. Pas besoin de compte.</span>
              </div>
            )}
            {room?.error && <p className="salon-error">{room.error}</p>}
            {me?.ready ? (
              <>
                <p className="salon-note">{other?.ready ? 'Lancement de la partie…' : 'Vous êtes prêt. La partie démarre dès que votre ami l’est aussi.'}</p>
                <button type="button" className="xp-btn big" disabled={busy || room?.started} onClick={() => void update({ ready: false })}>
                  Je ne suis plus prêt
                </button>
              </>
            ) : (
              <button
                type="button"
                className="xp-btn gold big"
                disabled={busy || !room}
                onClick={() => (me?.hasDeck ? void update({ ready: true }) : choice.open())}
              >
                {me?.hasDeck ? 'Je suis prêt' : 'Choisir un deck'}
              </button>
            )}
          </section>

          <figure className="salon-seat">
            {other?.joined ? (
              // The friend's deck stays hidden until the game: a card back
              <img className="salon-card back" src="/img/card-back.jpg" alt="" />
            ) : (
              <span className="salon-card empty">
                <LinkIcon size={40} />
                <strong>{player === HOST ? 'En attente de votre ami' : 'Votre hôte a quitté le salon'}</strong>
                {player === HOST && <span className="stage-spin salon-spin" />}
              </span>
            )}
            <figcaption>
              <strong>{other?.joined ? other.name : 'Votre ami'}</strong>
              {other?.ready ? <span className="salon-ready">Prêt</span> : <span>{otherStatus}</span>}
            </figcaption>
          </figure>
        </div>
      </Shell>
      {choice.dialog}
      <Inspector />
    </InspectProvider>
  );
}
