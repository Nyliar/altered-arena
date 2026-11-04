import type { ReactNode } from 'react';
import './expedition.css';

export type Section = 'play' | 'replays';

const ICONS: Record<Section, ReactNode> = {
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
          <span className="xp-rail-logo" aria-label="Altered Arena">
            A
          </span>
          <RailItem section="play" href="?play" label="Jouer" current={current} />
          <RailItem section="replays" href="?replay" label="Replays" current={current} />
        </nav>
        <main className="xp-main">{children}</main>
      </div>
    </div>
  );
}
