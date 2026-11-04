import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AiSummary, CardDef, PlayerId, ReunionDeckSummary } from '@protocol';
import { artUrl, useCatalog, useDecks } from '../api/catalog';
import { api, ApiError } from '../api/client';
import { InspectProvider } from '../game/inspect';
import { DeckGrid } from '../components/Picker';
import { ReunionDeckPicker } from '../components/ReunionDeck';
import { Inspector } from '../components/Inspector';
import { Modal } from '../components/Modal';
import { toast } from '../game/toasts';
import {
  type DeckSource,
  saveDeck,
  saveDeckSource,
  savedDeck,
  savedDeckSource,
  savedName,
  savedReunionDeck,
  saveName,
  saveReunionDeck,
  saveToken,
} from '../screens/storage';
import { Shell } from './Shell';
import { FACTIONS_FR, heroIndex } from './heroes';
import './play.css';

export type PlayMode = 'match' | 'friend' | 'ai';

const AI_KINDS: [AiSummary['kind'], string, string][] = [
  ['imitation', "IA d'imitation", 'joue comme un joueur de tournoi'],
  ['deck', 'IA de deck', 'maîtrise une liste précise'],
  ['simple', 'Bot simple', 'pour découvrir le jeu'],
];

const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : String(e));

/** A card of the stage: a hero's art, a card back, or an empty seat */
function StageCard({ def, back, children }: { def?: CardDef | null; back?: boolean; children?: ReactNode }) {
  if (back || !def)
    return (
      <span className={`stage-card ${back ? 'back' : 'empty'}`}>
        {back && <img src="/img/card-back.jpg" alt="" />}
        {children}
      </span>
    );
  return (
    <span className="stage-card">
      <img src={artUrl(def)} alt={def.name} />
      {children}
    </span>
  );
}

/** The play hub: matchmaking, a private room for a friend, a game against an AI */
export function Play({
  initialMode,
  onJoin,
  onRoom,
}: {
  initialMode: PlayMode;
  onJoin: (gameId: string, player: PlayerId, token?: string | null) => void;
  onRoom: (gameId: string) => void;
}) {
  const { catalog, error: catErr } = useCatalog();
  const { decks, error: deckErr } = useDecks();
  const [mode, setMode] = useState<PlayMode>(initialMode);
  const [name, setName] = useState(savedName() || 'Joueur');
  const [deck, setDeck] = useState<string | null>(savedDeck());
  const [source, setSource] = useState<DeckSource>(savedDeckSource());
  const [reunion, setReunion] = useState<ReunionDeckSummary | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const ticketRef = useRef<string | null>(null);
  const [ais, setAis] = useState<AiSummary[] | null>(null);
  const [aiKind, setAiKind] = useState<AiSummary['kind']>('imitation');
  const [aiId, setAiId] = useState<string | null>(null);

  useEffect(() => {
    api.ais().then(setAis, () => setAis([]));
  }, []);
  // A saved Altered Reunion deck is loaded by its picker, which only lives in the deck dialog: load it here too.
  // Not while the dialog is open (the picker sets the deck, and clears it while a new link loads), and
  // never over a deck chosen meanwhile.
  useEffect(() => {
    const id = savedReunionDeck();
    if (source !== 'reunion' || !id || reunion || picking) return;
    let live = true;
    api.reunionDeck(id).then(
      (d) => live && setReunion((prev) => prev ?? d),
      () => null,
    );
    return () => {
      live = false;
    };
  }, [source, reunion, picking]);
  // Leave the queue when the screen closes
  useEffect(
    () => () => {
      if (ticketRef.current) void api.leaveQueue(ticketRef.current);
    },
    [],
  );

  const starter = decks?.find((d) => d.id === deck) ?? null;
  const chosen: { deck: string } | { reunionDeck: string } | null =
    source === 'reunion' ? (reunion?.playable ? { reunionDeck: reunion.id } : null) : starter ? { deck: starter.id } : null;
  const heroRef = source === 'reunion' ? reunion?.heroRef : starter?.heroRef;
  const myHero = heroRef && catalog ? (catalog[heroRef] ?? null) : null;
  const deckName = source === 'reunion' ? reunion?.name : starter?.name;
  const deckFaction = source === 'reunion' ? reunion?.faction : starter?.faction;

  const heroes = catalog ? heroIndex(catalog) : null;
  const aiList = (ais ?? []).filter((a) => a.kind === aiKind);
  const ai = aiList.find((a) => a.id === aiId) ?? aiList[0] ?? null;
  const aiHero = ai?.hero && heroes ? (heroes.byName.get(ai.hero) ?? null) : null;

  function remember() {
    saveName(name);
    saveDeckSource(source);
    if (source === 'reunion' && reunion) saveReunionDeck(reunion.id);
    if (source === 'starter' && deck) saveDeck(deck);
  }

  async function findOpponent() {
    if (!chosen) return setPicking(true);
    remember();
    setBusy(true);
    try {
      let t = await api.matchmake(name || 'Joueur', chosen);
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

  /** The friend's seat has no deck: they choose it in game, after opening the link */
  async function createRoom() {
    if (!chosen) return setPicking(true);
    remember();
    setBusy(true);
    try {
      const g = await api.createGame({ players: [{ name: name || 'Joueur', ...chosen }, { name: 'Ami' }] });
      for (const p of g.players) saveToken(g.gameId, p.id, p.token);
      onRoom(g.gameId);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function playAi() {
    if (!chosen) return setPicking(true);
    if (!ai) return;
    remember();
    setBusy(true);
    try {
      const g = await api.createGame({ players: [{ name: name || 'Joueur', ...chosen }, { name: 'Bot', bot: true, ai: ai.id }] });
      onJoin(g.gameId, g.players[0].id, g.players[0].token);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function pick(m: PlayMode) {
    if (ticket) leaveQueue();
    setMode(m);
    history.replaceState(null, '', m === 'match' ? '?play' : `?play=${m}`);
  }

  const tiles: { m: PlayMode; tag: string; title: string; text: string; badge?: boolean }[] = [
    { m: 'match', tag: 'En ligne', title: "Recherche d'adversaire", text: 'Un joueur réel vous attend.' },
    { m: 'friend', tag: 'Privé', title: 'Défier un ami', text: 'Un salon, un lien à envoyer.' },
    { m: 'ai', tag: 'Entraînement', title: "Contre l'IA", text: 'Des IA qui jouent comme en tournoi.' },
  ];

  return (
    <InspectProvider catalog={catalog}>
      <Shell current="play">
        <div className="xp-head">
          <h1>Jouer</h1>
          <label className="xp-chip">
            {myHero ? <img className="xp-por" src={artUrl(myHero)} alt="" width={40} height={40} /> : <span className="xp-por play-por-empty" />}
            <span>
              <span className="xp-sr">Votre pseudo</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
              <small>{deckName ? `Deck : ${deckName}` : 'Aucun deck choisi'}</small>
            </span>
          </label>
        </div>
        {(catErr || deckErr) && <p className="play-error">Serveur injoignable : {catErr ?? deckErr}</p>}

        <div className="play-grid">
          <div className="play-modes" role="tablist" aria-label="Modes de jeu">
            {tiles.map((t) => (
              <button
                key={t.m}
                type="button"
                role="tab"
                aria-selected={mode === t.m}
                className={`play-mode ${mode === t.m ? 'on' : ''}`}
                onClick={() => pick(t.m)}
              >
                <span className="play-mini" aria-hidden="true">
                  {myHero ? <img src={artUrl(myHero)} alt="" /> : <span className="mini-empty" />}
                  {t.m === 'match' && <img src="/img/card-back.jpg" alt="" />}
                  {t.m === 'friend' && (
                    <span className="mini-slot">
                      <LinkIcon />
                    </span>
                  )}
                  {t.m === 'ai' && (aiHero ? <img src={artUrl(aiHero)} alt="" /> : <img src="/img/card-back.jpg" alt="" />)}
                  {t.m === 'ai' && (
                    <span className="mini-badge">
                      <BotIcon />
                    </span>
                  )}
                </span>
                <span className="play-mode-text">
                  <span className="xp-tag">{t.tag}</span>
                  <span className="play-mode-title">{t.title}</span>
                  <span className="xp-muted">{t.text}</span>
                </span>
              </button>
            ))}
          </div>

          <section className="play-panel" aria-live="polite">
            {/* Against an AI, the room goes to the list of AIs: no stage */}
            {mode !== 'ai' && (
              <div className="play-stage">
                <figure>
                  <StageCard def={myHero} />
                  <figcaption>
                    <strong>{name || 'Joueur'}</strong>
                    <span>{myHero ? myHero.name : 'Choisissez un deck'}</span>
                  </figcaption>
                </figure>
                <span className="stage-vs">contre</span>
                <figure>
                  {mode === 'match' && (
                    <>
                      <StageCard back>{ticket && <span className="stage-spin" />}</StageCard>
                      <figcaption>
                        <strong>{ticket ? 'Recherche…' : 'Adversaire'}</strong>
                        <span>{ticket ? 'un joueur en ligne' : 'inconnu'}</span>
                      </figcaption>
                    </>
                  )}
                  {mode === 'friend' && (
                    <>
                      <StageCard>
                        <LinkIcon size={40} />
                        <span className="stage-free">Place libre</span>
                      </StageCard>
                      <figcaption>
                        <strong>Votre ami</strong>
                        <span>rejoint par le lien</span>
                      </figcaption>
                    </>
                  )}
                </figure>
              </div>
            )}

            <div className="play-controls">
              <div className="play-deck-row">
                <button type="button" className="xp-btn play-deck" onClick={() => setPicking(true)}>
                  {myHero ? <img className="xp-por" src={artUrl(myHero)} alt="" width={40} height={40} /> : null}
                  <span className="play-deck-name">
                    <strong>{deckName ?? 'Choisir un deck'}</strong>
                    <small>{deckFaction ? FACTIONS_FR[deckFaction] : 'Starter ou Altered Reunion'}</small>
                  </span>
                  <span className="play-deck-change">Changer de deck</span>
                </button>
                {mode === 'match' && <span className="xp-muted">{ticket ? 'En attente d’un autre joueur…' : 'Un joueur en ligne, une partie complète.'}</span>}
                {mode === 'friend' && (
                  <span className="xp-muted">Votre ami ouvre le lien, choisit son deck, et la partie démarre. Aucun compte requis.</span>
                )}
              </div>

              {mode === 'ai' && (
                <div className="play-ai">
                  <div className="play-ai-kinds" role="radiogroup" aria-label="Type d'IA">
                    {AI_KINDS.filter(([k]) => ais?.some((a) => a.kind === k)).map(([k, label, hint]) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={aiKind === k}
                        className={`play-opt ${aiKind === k ? 'on' : ''}`}
                        onClick={() => {
                          setAiKind(k);
                          setAiId(null);
                        }}
                      >
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </button>
                    ))}
                  </div>
                  {aiKind !== 'simple' && (
                    <div className="play-ai-list" role="radiogroup" aria-label="Adversaire">
                      {aiList.map((a) => {
                        const h = a.hero && heroes ? heroes.byName.get(a.hero) : null;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="radio"
                            aria-checked={ai?.id === a.id}
                            className={`play-ai-item ${ai?.id === a.id ? 'on' : ''}`}
                            title={a.label}
                            onClick={() => setAiId(a.id)}
                          >
                            {h ? <img className="xp-por" src={artUrl(h)} alt="" width={44} height={44} /> : <span className="xp-por play-por-empty" />}
                            <span>{a.label}</span>
                          </button>
                        );
                      })}
                      {ais === null && <span className="xp-muted">Chargement des IA…</span>}
                    </div>
                  )}
                </div>
              )}

              {mode === 'match' &&
                (ticket ? (
                  <button type="button" className="xp-btn big" onClick={leaveQueue}>
                    Annuler la recherche
                  </button>
                ) : (
                  <button type="button" className="xp-btn gold big" disabled={busy} onClick={findOpponent}>
                    Lancer la recherche
                  </button>
                ))}
              {mode === 'friend' && (
                <button type="button" className="xp-btn gold big" disabled={busy} onClick={createRoom}>
                  {busy ? 'Création…' : 'Créer le salon'}
                </button>
              )}
              {mode === 'ai' && (
                <button type="button" className="xp-btn gold big" disabled={busy || !ai} onClick={playAi}>
                  {busy ? 'Lancement…' : "Affronter l'IA"}
                </button>
              )}
            </div>
          </section>
        </div>
      </Shell>

      {picking && (
        <Modal
          wide
          title="Votre deck"
          onClose={() => setPicking(false)}
          footer={
            <button
              type="button"
              className="btn primary"
              disabled={!chosen}
              onClick={() => {
                remember();
                setPicking(false);
              }}
            >
              Valider
            </button>
          }
        >
          <div className="deck-source" role="tablist" aria-label="Deck">
            {(
              [
                ['starter', 'Decks de départ'],
                ['reunion', 'Mon deck Altered Reunion'],
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
            <ReunionDeckPicker catalog={catalog} initialId={reunion?.id ?? savedReunionDeck()} onChange={setReunion} />
          ) : decks && catalog ? (
            <DeckGrid decks={decks} catalog={catalog} selected={deck} onSelect={(d) => setDeck(d.id)} />
          ) : (
            <p className="muted">Chargement des decks…</p>
          )}
        </Modal>
      )}
      <Inspector />
    </InspectProvider>
  );
}

export function LinkIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M12 3v4M9 12h.01M15 12h.01" />
    </svg>
  );
}
