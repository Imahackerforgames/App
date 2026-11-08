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
            <stop offset="0.45" stopColor="#bfe9ff" />
            <stop offset="0.5" stopColor="#4a3aa8" />
            <stop offset="0.75" stopColor="#ff7be9" />
            <stop offset="1" stopColor="#ffe3a3" />
          </linearGradient>
          <radialGradient id="world" cx="0.38" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor="#7fe7ff" />
            <stop offset="1" stopColor="#3b1a86" />
          </radialGradient>
          <clipPath id="letters">{letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}</clipPath>
        </defs>
        {/* drop shadow layer */}
        <g fill="#ff2fd6" transform="translate(4 4)" opacity="0.9" shapeRendering="crispEdges">
          <circle cx="35" cy="35" r="30" />
          {letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}
        </g>
        <g fill="#14062e" transform="translate(2 2)" shapeRendering="crispEdges">
          <circle cx="35" cy="35" r="30" />
          {letters.map((l, i) => <Letter key={l} g={l} x={80 + i * 58} />)}
        </g>
        {/* O as a ringed world */}
        <ellipse cx="35" cy="35" rx="46" ry="11" fill="none" stroke="#ffd166" strokeWidth="4" transform="rotate(-20 35 35)" opacity="0.55" />
        <circle cx="35" cy="35" r="30" fill="url(#world)" />
        <circle cx="35" cy="35" r="14" fill="#14062e" />
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
