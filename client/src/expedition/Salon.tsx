import { useEffect, useState } from 'react';
import type { CardDef, GameView, PlayerId } from '@protocol';
import { artUrl, useCatalog, useDecks } from '../api/catalog';
import { api, ApiError } from '../api/client';
import { toast } from '../game/toasts';
import { savedDeck, savedDeckSource, savedReunionDeck, tokenOf } from '../screens/storage';
import { Shell } from './Shell';
import { FACTIONS_FR } from './heroes';
import { LinkIcon } from './Play';
import './play.css';
import './salon.css';

const HOST: PlayerId = 2001;
const GUEST: PlayerId = 2002;

/** The private room of a game against a friend: the link to send, then the friend's hero once they picked a deck */
export function Salon({ gameId, onJoin }: { gameId: string; onJoin: (gameId: string, player: PlayerId, token?: string | null) => void }) {
  const { catalog } = useCatalog();
  const [view, setView] = useState<GameView | null>(null);
  const [gone, setGone] = useState(false);
  const { decks } = useDecks();
  // The game shows the heroes once both decks are chosen: until then, mine is the deck I created the room with
  const [reunionHero, setReunionHero] = useState<string | null>(null);
  useEffect(() => {
    const id = savedReunionDeck();
    if (savedDeckSource() === 'reunion' && id) api.reunionDeck(id).then((d) => setReunionHero(d.heroRef), () => null);
  }, []);
  const token = tokenOf(gameId, HOST);
  const guestToken = tokenOf(gameId, GUEST);
  const link = `${location.origin}${location.pathname}?game=${encodeURIComponent(gameId)}&player=${GUEST}${guestToken ? `#token=${encodeURIComponent(guestToken)}` : ''}`;

  // Long poll the host's view: the guest's faction appears once they chose a deck
  useEffect(() => {
    const ctrl = new AbortController();
    let since: number | undefined;
    (async () => {
      while (!ctrl.signal.aborted) {
        try {
          const v = await api.view(gameId, HOST, token, since, ctrl.signal);
          since = v.seq;
          setView(v);
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          if (e instanceof ApiError && e.user) return setGone(true);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => ctrl.abort();
  }, [gameId, token]);

  const heroOf = (pid: PlayerId): CardDef | null => {
    const p = view?.players.find((x) => x.id === pid);
    const ref = p?.heroCardId != null ? view?.cards.find((c) => c.id === p.heroCardId)?.ref : null;
    return ref && catalog ? (catalog[ref] ?? null) : null;
  };
  const me = view?.players.find((p) => p.id === HOST);
  const guest = view?.players.find((p) => p.id === GUEST);
  const myRef = savedDeckSource() === 'reunion' ? reunionHero : decks?.find((d) => d.id === savedDeck())?.heroRef;
  const myHero = heroOf(HOST) ?? (myRef && catalog ? (catalog[myRef] ?? null) : null);
  const guestHero = heroOf(GUEST);
  const joined = !!guest?.faction;

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
        <p className="xp-muted">Ce salon n'existe plus sur le serveur, ou il a été créé sur un autre appareil.</p>
        <a className="xp-btn" href="?play=friend">
          Créer un nouveau salon
        </a>
      </Shell>
    );

  return (
    <Shell current="play">
      <div className="xp-head">
        <a className="xp-btn" href="?play=friend">
          ← Quitter le salon
        </a>
        <div>
          <span className="xp-tag">Salon privé · {gameId}</span>
          <h1>{joined ? 'Votre ami est arrivé' : 'Invitez votre ami'}</h1>
        </div>
      </div>

      <div className="salon">
        <figure className="salon-seat">
          {myHero ? <img className="salon-card" src={artUrl(myHero)} alt={myHero.name} /> : <span className="salon-card empty" />}
          <figcaption>
            <strong>{me?.name ?? '…'}</strong>
            <span>{myHero ? `${myHero.name} · ${FACTIONS_FR[myHero.faction]}` : '…'}</span>
            <span className="salon-ready">Prêt</span>
          </figcaption>
        </figure>

        <section className="salon-middle" aria-live="polite">
          <span className="salon-vs">contre</span>
          {!joined && (
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
              <span className="xp-muted">Votre ami ouvre le lien, choisit un deck, et apparaît ici. Pas besoin de compte.</span>
            </div>
          )}
          <button type="button" className="xp-btn gold big" onClick={() => onJoin(gameId, HOST, token)}>
            {joined ? 'Lancer la partie' : 'Entrer dans la partie'}
          </button>
        </section>

        <figure className="salon-seat">
          {joined && guestHero ? (
            <img className="salon-card" src={artUrl(guestHero)} alt={guestHero.name} />
          ) : (
            <span className="salon-card empty">
              <LinkIcon size={40} />
              <strong>En attente de votre ami</strong>
              <span className="stage-spin salon-spin" />
            </span>
          )}
          <figcaption>
            <strong>{joined ? guest?.name : 'Votre ami'}</strong>
            <span>{joined && guestHero ? `${guestHero.name} · ${FACTIONS_FR[guestHero.faction]}` : 'pas encore arrivé'}</span>
            {joined && <span className="salon-ready">Prêt</span>}
          </figcaption>
        </figure>
      </div>
    </Shell>
  );
}
