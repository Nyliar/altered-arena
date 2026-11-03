import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import type { Faction } from '@protocol';
import { artUrl, useCatalog } from '../api/catalog';
import { toast } from '../game/toasts';
import { Shell } from './Shell';
import { eventOf, FACTIONS_FR, heroIndex } from './heroes';
import './replays.css';

/** GET /api/v1/replays: the BGA games the server holds in the engine's replay format */
interface ReplayInfo {
  table: number;
  players: { name: string; faction: Faction; hero: string; deckName?: string; deckId?: string }[];
  steps: number;
}

type Tab = 'all' | 'tournament' | 'mine';

/** A hero whose art the server does not have shows the card back */
const noArt = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = '/img/card-back.jpg';
};

/** The replay library: every replay of the server, searchable, with the heroes and the players of each game */
export function Replays() {
  const { catalog } = useCatalog();
  const [list, setList] = useState<ReplayInfo[] | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/v1/replays')
      .then((r) => r.json())
      .then((l: ReplayInfo[]) => setList(Array.isArray(l) ? l : []))
      .catch((e: Error) => {
        setList([]);
        toast(`Impossible de charger les replays : ${e.message}`);
      });
  }, []);

  const heroes = catalog ? heroIndex(catalog) : null;
  const rows = useMemo(
    () =>
      (list ?? []).map((r) => {
        const event = eventOf(r.players[0]?.deckId);
        const players = r.players.map((p) => ({
          ...p,
          art: artUrl({ asset: p.hero, faction: p.faction }),
          heroName: heroes?.byAsset.get(p.hero)?.name ?? FACTIONS_FR[p.faction] ?? p.faction,
        }));
        return { ...r, event, players, text: [event, ...players.flatMap((p) => [p.name, p.heroName, p.deckName])].join(' ').toLowerCase() };
      }),
    [list, heroes],
  );
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (tab === 'all' || (tab === 'tournament' && r.event)) && (!q || r.text.includes(q)));
  const current = shown.find((r) => r.table === sel) ?? shown[0] ?? null;
  const tabs: [Tab, string, number | null][] = [
    ['all', 'Toutes', rows.length],
    ['tournament', 'Tournois', rows.filter((r) => r.event).length],
    ['mine', 'Mes parties', null],
  ];

  return (
    <Shell current="replays">
      <div className="rp">
        <section className="rp-list">
          <div className="xp-head">
            <div>
              <span className="xp-tag">Replays</span>
              <h1>Chroniques</h1>
            </div>
            <label className="rp-search">
              <span className="xp-sr">Rechercher</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pseudo, héros, tournoi…" />
            </label>
          </div>
          <div className="rp-tabs" role="tablist">
            {tabs.map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`rp-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {label}
                {n !== null && <small> · {n}</small>}
              </button>
            ))}
          </div>

          {tab === 'mine' ? (
            <p className="rp-empty">Les replays de vos parties sur Altered Arena ne sont pas encore enregistrés par le serveur. Ils apparaîtront ici.</p>
          ) : !list ? (
            <p className="rp-empty">Chargement…</p>
          ) : shown.length === 0 ? (
            <p className="rp-empty">{rows.length ? 'Aucun replay ne correspond.' : 'Aucun replay sur ce serveur.'}</p>
          ) : (
            <div className="rp-rows" role="listbox" aria-label="Replays">
              {shown.map((r) => (
                <button
                  key={r.table}
                  type="button"
                  role="option"
                  aria-selected={current?.table === r.table}
                  className={`rp-row ${current?.table === r.table ? 'sel' : ''}`}
                  onClick={() => setSel(r.table)}
                >
                  {r.players.slice(0, 2).map((p, i) => (
                    <span key={i} className="rp-side">
                      <img className="xp-por" src={p.art} alt="" width={48} height={48} loading="lazy" onError={noArt} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.heroName}</small>
                      </span>
                    </span>
                  ))}
                  <span className="rp-event">
                    <span className="rp-badge">{r.event ? 'Tournoi' : 'Import'}</span>
                    <small>{r.event ?? `Table ${r.table}`}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {current && tab !== 'mine' && (
          <aside className="rp-detail">
            <div>
              <span className="xp-tag">{current.event ?? 'Replay importé'}</span>
              <p className="xp-muted">
                Table {current.table} · {current.steps} actions
              </p>
            </div>
            <div className="rp-duel">
              {current.players.slice(0, 2).map((p, i) => (
                <figure key={i}>
                  <img className="xp-card-art" src={p.art} alt={p.heroName} onError={noArt} />
                  <figcaption>
                    <strong>{p.name}</strong>
                    <span>
                      {p.heroName} · {FACTIONS_FR[p.faction] ?? p.faction}
                    </span>
                    {p.deckName && <small>{p.deckName}</small>}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="rp-watch">
              <span className="xp-muted">Regarder du côté de</span>
              {current.players.slice(0, 2).map((p, i) => (
                <a key={i} className={`xp-btn ${i === 0 ? 'gold' : ''}`} href={`?replay=${current.table}&seat=${2001 + i}`}>
                  ▶ {p.name}
                </a>
              ))}
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}
