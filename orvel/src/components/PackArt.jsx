// Illustrated foil pack, drawn from each pack's design colours.
const EMBLEMS = {
  wave: <path d="M20 70 Q35 55 50 70 T80 70 M20 82 Q35 67 50 82 T80 82" strokeWidth="5" fill="none" />,
  rift: <path d="M50 30 L42 58 L56 62 L44 96 L64 54 L50 50 L58 30 Z" />,
  crown: <path d="M22 80 L28 44 L40 62 L50 36 L60 62 L72 44 L78 80 Z M22 86 H78 V94 H22 Z" />,
  star: <path d="M50 26 L57 52 L84 52 L62 67 L70 94 L50 77 L30 94 L38 67 L16 52 L43 52 Z" />,
  orb: <><circle cx="50" cy="62" r="20" /><ellipse cx="50" cy="62" rx="34" ry="8" fill="none" strokeWidth="3" /></>,
}

export default function PackArt({ pack, size = 'md', shaking = false, torn = false }) {
  const d = pack.design || {}
  return (
    <div className={`pack pack-${size} ${shaking ? 'pack-shake' : ''} ${torn ? 'pack-torn' : ''} ${pack.premium ? 'pack-premium' : ''}`}
      style={{ '--p1': d.c1, '--p2': d.c2, '--p3': d.c3 }}>
      <div className="pack-crimp top" />
      <div className="pack-body">
        <div className="pack-foil" />
        <div className="pack-brand">ORVEL</div>
        <svg className="pack-emblem" viewBox="0 0 100 120" aria-hidden="true">
          <g fill="var(--p3)" stroke="var(--p3)">{EMBLEMS[d.emblem] || EMBLEMS.orb}</g>
        </svg>
        <div className="pack-title">{pack.name}</div>
        <div className="pack-count">{pack.cardCount} CARDS</div>
        {pack.premium && <div className="pack-ribbon">PREMIUM</div>}
        {pack.limited?.enabled && <div className="pack-ribbon ltd">LIMITED</div>}
      </div>
      <div className="pack-crimp bottom" />
    </div>
  )
}
export const EMBLEM_IDS = Object.keys(EMBLEMS)
