import { useRef } from 'react';

export interface FeaturedCritter {
  id: string;
  name: string | null;
  rarity: string;
  photo_url: string;
}

const RARITY_COLOR: Record<string, string> = {
  Rare:      '#4a9eff',
  Unique:    '#a855f7',
  Legendary: '#f59e0b',
};

const RARITY_LABEL: Record<string, string> = {
  Rare:      '💎 Rare',
  Unique:    '🔮 Unique',
  Legendary: '🏆 Legendary',
};

/** Horizontal carousel of critters that have an uploaded photo. Native
 *  scroll-snap drives swipe on touch; the arrow buttons nudge it on desktop. */
export function CritterCarousel({ critters }: { critters: FeaturedCritter[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const nudge = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>('.critter-card');
    const step = card ? card.offsetWidth + 20 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <div className="critter-carousel">
      <button className="critter-carousel-arrow critter-carousel-arrow--prev"
        onClick={() => nudge(-1)} aria-label="Previous critters">‹</button>

      <div className="critter-carousel-track" ref={trackRef}>
        {critters.map(c => {
          const color = RARITY_COLOR[c.rarity] ?? '#c9a84c';
          return (
            <a key={c.id} href={`/${c.id}`} className="critter-card" style={{ '--rarity-color': color } as React.CSSProperties}>
              <div className="critter-card-photo-wrap">
                <img src={c.photo_url} alt={c.name ?? 'Critter'} className="critter-card-photo" loading="lazy" decoding="async" />
                <span className="critter-card-rarity" style={{ color }}>{RARITY_LABEL[c.rarity] ?? c.rarity}</span>
              </div>
              <span className="critter-card-name">{c.name ?? ' '}</span>
            </a>
          );
        })}
      </div>

      <button className="critter-carousel-arrow critter-carousel-arrow--next"
        onClick={() => nudge(1)} aria-label="More critters">›</button>
    </div>
  );
}
