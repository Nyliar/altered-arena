import type { ReactNode } from 'react';
import './expedition.css';

export type Section = 'home' | 'play' | 'replays' | 'options';

const ICONS: Record<Section, ReactNode> = {
  home: <path d="M3 11 12 4l9 7v9H3z" />,
  play: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4" />
      <path d="M9.5 6.5 21 18v3h-3L6.5 9.5M11 5l-6 6M8 8 4 4" />
    </>
  ),
  replays: (
    <>
      <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 17H6" />
      <path d="m10 8 4 2.5-4 2.5z" />
    </>
  ),
  options: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
};

export function Icon({ name, size = 28 }: { name: Section; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function RailItem({ section, href, label, current }: { section: Section; href: string; label: string; current: Section }) {
  return (
    <a className={`xp-rail-item ${current === section ? 'on' : ''}`} href={href} aria-current={current === section ? 'page' : undefined}>
      <Icon name={section} />
      {label}
    </a>
  );
}

/** An app screen: the rail on the left, the page on the right */
export function Shell({ current, children }: { current: Section; children: ReactNode }) {
  return (
    <div className="xp">
      <div className="xp-app">
        <nav className="xp-rail" aria-label="Navigation">
          <a className="xp-rail-logo" href="?" aria-label="Altered Arena, accueil">
            A
          </a>
          <RailItem section="home" href="?" label="Accueil" current={current} />
          <RailItem section="play" href="?play" label="Jouer" current={current} />
          <RailItem section="replays" href="?replay" label="Replays" current={current} />
          <div className="xp-rail-bottom">
            <RailItem section="options" href="?lobby" label="Avancé" current={current} />
          </div>
        </nav>
        <main className="xp-main">{children}</main>
      </div>
    </div>
  );
}
