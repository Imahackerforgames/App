// ORVEL wordmark: hand-set pixel letterforms in chrome, with the O drawn as a
// ringed world. Built in SVG so it is crisp at any size.
const GLYPHS = {
  R: ['11110', '11011', '11011', '11110', '11100', '11011', '11011'],
  V: ['11011', '11011', '11011', '11011', '11011', '01110', '00100'],
  E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
  L: ['11000', '11000', '11000', '11000', '11000', '11000', '11111'],
}

function Letter({ g, x }) {
  const cells = []
  GLYPHS[g].forEach((row, y) => [...row].forEach((on, cx) => { if (on === '1') cells.push(<rect key={`${cx}-${y}`} x={x + cx * 10} y={y * 10} width="10" height="10" />) }))
  return <>{cells}</>
}

export default function Logo({ size = 220, animated = true, tagline = false }) {
  const letters = ['R', 'V', 'E', 'L']
  return (
    <div className={`logo ${animated ? 'logo-anim' : ''}`} style={{ width: size }}>
      <svg viewBox="-14 -14 330 100" role="img" aria-label="ORVEL">
        <defs>
          <linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="70">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" style={{ stopColor: 'var(--title-a)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--accent-deep)' }} />
            <stop offset="0.75" style={{ stopColor: 'var(--title-b)' }} />
            <stop offset="1" style={{ stopColor: 'var(--title-c)' }} />
          </linearGradient>
          <radialGradient id="world" cx="0.38" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" style={{ stopColor: 'var(--accent-2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--accent-deep)' }} />
          </radialGradient>
          <clipPath id="letters">{letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}</clipPath>
        </defs>
        {/* drop shadow layer */}
        <g style={{ fill: 'var(--accent)' }} transform="translate(4 4)" opacity="0.9" shapeRendering="crispEdges">
          <circle cx="35" cy="35" r="30" />
          {letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}
        </g>
        <g style={{ fill: 'var(--bg-deep)' }} transform="translate(2 2)" shapeRendering="crispEdges">
          <circle cx="35" cy="35" r="30" />
          {letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}
        </g>
        {/* O as a ringed world */}
        <ellipse cx="35" cy="35" rx="46" ry="11" fill="none" stroke="#ffd166" strokeWidth="4" transform="rotate(-20 35 35)" opacity="0.55" />
        <circle cx="35" cy="35" r="30" fill="url(#world)" />
        <circle cx="35" cy="35" r="14" style={{ fill: 'var(--bg-deep)' }} />
        <path d="M-8.2 50.7 A46 11 -20 0 0 78.2 19.3" fill="none" stroke="#ffd166" strokeWidth="4" className="logo-ring" />
        <g fill="url(#chrome)" shapeRendering="crispEdges">
          {letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}
        </g>
        <g clipPath="url(#letters)"><rect className="logo-shine" x="20" y="-14" width="26" height="100" fill="#fff" opacity="0.55" /></g>
      </svg>
      {tagline && <div className="logo-tag">COLLECT THE ARTWORK</div>}
    </div>
  )
}
