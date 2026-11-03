import { SHOWCASE } from './heroes';
import './expedition.css';
import './home.css';

const FACTIONS: [string, string][] = [
  ['Axiom', SHOWCASE.axiom],
  ['Bravos', SHOWCASE.bravos],
  ['Lyra', SHOWCASE.lyra],
  ['Muna', SHOWCASE.muna],
  ['Ordis', SHOWCASE.ordis],
  ['Yzmir', SHOWCASE.yzmir],
];

const MODES: { tag: string; title: string; text: string; art: string; href: string }[] = [
  { tag: 'En ligne', title: "Recherche d'adversaire", text: 'Choisissez un deck, lancez la file, un joueur réel vous répond.', art: SHOWCASE.ordis, href: '?play' },
  { tag: 'Privé', title: 'Défier un ami', text: 'Créez un salon, envoyez le lien. Votre ami joue sans créer de compte.', art: SHOWCASE.muna, href: '?play=friend' },
  { tag: 'Entraînement', title: "Contre l'IA", text: "IA d'imitation apprises sur des joueurs de tournoi, ou IA spécialisées par deck.", art: SHOWCASE.axiom, href: '?play=ai' },
];

/** The landing page: what Altered Arena is, and the ways in */
export function Home() {
  return (
    <div className="xp xp-home">
      <header className="home-bar">
        <a className="home-logo" href="?">
          Altered Arena
        </a>
        <nav>
          <a href="#modes">Modes</a>
          <a href="?replay">Replays</a>
          <a href="#projet">Le projet</a>
          <a className="xp-btn gold" href="?play">
            Jouer
          </a>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-text">
          <span className="xp-tag">Le JCC Altered, en ligne</span>
          <h1>Le chemin vous attend</h1>
          <p>
            Affrontez des joueurs en ligne, invitez un ami par un simple lien ou entraînez-vous contre des IA qui ont appris des joueurs de
            tournoi. Gratuit, dans le navigateur.
          </p>
          <div className="home-cta">
            <a className="xp-btn gold big" href="?play">
              Commencer
            </a>
            <a className="xp-btn" href="?replay">
              Replays de tournoi
            </a>
          </div>
        </div>
        <div className="home-fan" aria-hidden="true">
          <img className="home-frame left" src={SHOWCASE.ordis} alt="" />
          <img className="home-frame right" src={SHOWCASE.axiom} alt="" />
          <img className="home-frame center" src={SHOWCASE.muna} alt="" />
        </div>
      </section>

      <section id="modes" className="home-section">
        <span className="xp-tag">Trois voies</span>
        <h2>Comment voulez-vous jouer ?</h2>
        <div className="home-modes">
          {MODES.map((m) => (
            <a key={m.title} className="home-mode" href={m.href}>
              <img src={m.art} alt="" />
              <span>
                <span className="xp-tag">{m.tag}</span>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="home-band">
        <div>
          <span className="xp-tag">Chroniques</span>
          <h2>Revivez chaque partie</h2>
          <p>Importez les replays des tournois et retrouvez qui jouait quel héros, partie par partie, du côté de chaque joueur.</p>
          <a className="xp-btn" href="?replay">
            Ouvrir les replays
          </a>
        </div>
      </section>

      <section id="projet" className="home-section home-project">
        <div className="home-factions">
          {FACTIONS.map(([name, art]) => (
            <span key={name}>
              <img className="xp-por" src={art} alt="" />
              {name}
            </span>
          ))}
        </div>
        <div className="home-points">
          <div>
            <h3>Les vraies règles</h3>
            <p>Un moteur qui reprend les règles d'Altered une à une, vérifié sur des milliers de parties rejouées.</p>
          </div>
          <div>
            <h3>Vos decks</h3>
            <p>Collez le lien d'un deck Altered Reunion et jouez-le tout de suite, uniques compris.</p>
          </div>
          <div>
            <h3>Partout</h3>
            <p>Ordinateur, tablette ou téléphone : l'application s'installe depuis le navigateur.</p>
          </div>
        </div>
        <a className="xp-btn gold big" href="?play">
          Entrer dans l'arène
        </a>
      </section>

      <footer className="home-foot">
        <span>Altered Arena — projet de fans, non affilié à Equinox.</span>
        <span>Altered et ses illustrations © Equinox.</span>
      </footer>
    </div>
  );
}
