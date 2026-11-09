import { memo } from 'react'

// Scenery standing on the battlefield, so the field feels lived-in and full:
// barrels, crates, sandbags, wrecks and the like, picked to suit each map.
// Hard and shiny things carry gloss, specular highlights and the odd
// twinkling glint, so they read as solid objects catching the light.
// Props are decoration only — they never block a tap or a lane.

const P = {
  barrel: <><rect x="4" y="6" width="22" height="30" rx="4" fill="#5a3a1e" /><rect x="4" y="12" width="22" height="3" fill="#2a2a2a" /><rect x="4" y="27" width="22" height="3" fill="#2a2a2a" /><ellipse cx="15" cy="6" rx="11" ry="3" fill="#7a5230" /><rect x="4" y="6" width="22" height="30" rx="4" fill="url(#fd-cyl)" /><rect x="4" y="6" width="22" height="30" rx="4" fill="url(#fd-gloss)" /><ellipse cx="11" cy="9" rx="4" ry="1.4" fill="url(#fd-spec)" /></>,
  drum: <><rect x="4" y="12" width="22" height="26" rx="3" fill="#3a3a3a" /><rect x="4" y="18" width="22" height="2.4" fill="#1a1a1a" /><rect x="4" y="29" width="22" height="2.4" fill="#1a1a1a" /><ellipse cx="15" cy="12" rx="11" ry="3" fill="#1a1a1a" /><rect x="4" y="12" width="22" height="26" rx="3" fill="url(#fd-cyl)" /><path className="prop-fire" d="M7 12 Q8 0 13 4 Q15 -6 18 3 Q22 -1 23 12 Z" fill="#ff7a2a" /><path className="prop-fire" d="M10 12 Q12 4 15 7 Q18 3 20 12 Z" fill="#ffd56a" /><rect x="4" y="12" width="22" height="26" rx="3" fill="url(#fd-gloss)" /><ellipse cx="10.6" cy="22" rx="1.6" ry="5" fill="url(#fd-spec)" /><g className="glint" style={{ "--gd": "-.4s" }}><path d="M10 16 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g></>,
  crate: <><rect x="2" y="10" width="28" height="26" fill="#8a6038" stroke="#3a2412" strokeWidth="1.4" /><path d="M2 10 L30 36 M30 10 L2 36" stroke="#5a3a1e" strokeWidth="2" /><rect x="2" y="10" width="28" height="26" fill="url(#fd-vert)" /><path d="M3 11 H29" stroke="#ffe2b0" strokeOpacity=".55" strokeWidth="1" /><path d="M3 11 V35" stroke="#ffe2b0" strokeOpacity=".35" strokeWidth="1" /></>,
  sandbags: <>{[[2, 26], [14, 26], [26, 26], [8, 17], [20, 17], [14, 8]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width="14" height="9" rx="4.5" fill="#9a8a62" stroke="#5a4c32" strokeWidth=".8" /><rect x={x} y={y} width="14" height="9" rx="4.5" fill="url(#fd-vert)" /></g>)}{[[2, 26], [14, 26], [26, 26], [8, 17], [20, 17], [14, 8]].map(([x, y], i) => <path key={"h" + i} d={`M${x + 3} ${y + 2} H${x + 11}`} stroke="#fff" strokeOpacity=".35" strokeWidth="1" />)}</>,
  tires: <>{[30, 22, 14].map((y) => <g key={y}><ellipse cx="16" cy={y} rx="14" ry="5.4" fill="#141414" stroke="#2e2e2e" strokeWidth="1.2" /><ellipse cx="16" cy={y - 1} rx="6" ry="2" fill="#050505" /></g>)}{[30, 22, 14].map((y) => <path key={y} d={`M5 ${y - 2} Q16 ${y - 7} 27 ${y - 2}`} stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" fill="none" />)}</>,
  cone: <><path d="M10 34 L16 6 L22 34 Z" fill="#ff6a1a" /><path d="M12.6 22 L19.4 22 L20.4 27 L11.6 27 Z" fill="#f4f0e8" /><rect x="6" y="33" width="20" height="3" rx="1" fill="#2a2a2a" /><path d="M14 9 L16 6 L17.4 12 L13 31 L11.6 31 Z" fill="#fff" opacity=".45" /><ellipse cx="15" cy="16" rx="1" ry="4" fill="url(#fd-spec)" /><g className="glint" style={{ "--gd": "-1.1s" }}><path d="M14 6 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g></>,
  car: <><path d="M2 30 L4 20 L16 18 L24 10 L48 10 L58 18 L64 20 L66 30 Z" fill="#4a3a34" stroke="#1a1210" strokeWidth="1" /><path d="M26 12 L46 12 L52 18 L22 18 Z" fill="#141414" /><circle cx="16" cy="31" r="6" fill="#141414" /><circle cx="52" cy="31" r="6" fill="#141414" /><path d="M30 18 L34 26 M44 14 L40 22" stroke="#8a2a1a" strokeWidth="1.4" /><path d="M2 30 L4 20 L16 18 L24 10 L48 10 L58 18 L64 20 L66 30 Z" fill="url(#fd-vert)" /><path d="M27 12.6 L36 12.6 L33 17.4 L23.4 17.4 Z" fill="url(#fd-glass)" /><path d="M8 20 Q30 15 60 19" stroke="#fff" strokeOpacity=".45" strokeWidth="1.4" fill="none" /><circle cx="16" cy="31" r="3" fill="#8a8a8a" /><circle cx="52" cy="31" r="3" fill="#8a8a8a" /><ellipse cx="14.6" cy="29.6" rx="1.2" ry="1" fill="#fff" opacity=".8" /><ellipse cx="50.6" cy="29.6" rx="1.2" ry="1" fill="#fff" opacity=".8" /><g className="glint" style={{ "--gd": "-.2s" }}><path d="M40 9 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g><g className="glint" style={{ "--gd": "-1.6s" }}><path d="M20 15 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g></>,
  lamp: <><rect x="14" y="4" width="3" height="64" fill="#2a2a2a" /><path d="M15 4 Q15 0 24 1 L26 4" fill="none" stroke="#2a2a2a" strokeWidth="2.4" /><path d="M22 4 L30 4 L28 8 L24 8 Z" fill="#3a3a3a" /><ellipse className="prop-glow" cx="26" cy="10" rx="10" ry="6" fill="#ffd27a" opacity=".35" /><rect x="10" y="66" width="11" height="4" fill="#1a1a1a" /><rect x="14" y="4" width="1.2" height="62" fill="#fff" opacity=".35" /><g className="glint" style={{ "--gd": "-.7s" }}><path d="M26 5 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g></>,
  rubble: <><path d="M0 34 L6 22 L12 26 L18 16 L26 24 L32 20 L38 34 Z" fill="#4a4440" /><path d="M8 34 L12 28 L18 30 L22 26 L28 34 Z" fill="#6a625a" /><path d="M0 34 L6 22 L12 26 L18 16 L26 24 L32 20 L38 34 Z" fill="url(#fd-vert)" /><path d="M6 22 L12 26 M18 16 L26 24" stroke="#fff" strokeOpacity=".3" strokeWidth="1" /></>,
  rock: <><path d="M2 34 Q0 20 10 14 Q18 6 28 14 Q36 22 32 34 Z" fill="#5a5450" /><path d="M2 34 Q0 20 10 14 Q18 6 28 14 Q36 22 32 34 Z" fill="url(#fd-cyl)" /><path className="prop-snow" d="M6 18 Q12 10 20 10 Q28 12 30 18 Q20 14 6 18 Z" fill="#f4f8ff" /><path d="M8 16 Q14 10 22 11" stroke="#fff" strokeOpacity=".35" strokeWidth="1.6" fill="none" /><ellipse cx="13" cy="15" rx="3" ry="1.4" fill="url(#fd-spec)" opacity=".5" /></>,
  pillar: <><rect x="8" y="6" width="16" height="56" fill="#4a4a64" /><path d="M8 6 L12 0 L16 4 L20 -2 L24 6 Z" fill="#4a4a64" /><path d="M12 6 V62 M20 6 V62" stroke="#2a2a3e" strokeWidth="1.2" /><rect x="4" y="60" width="24" height="6" fill="#3a3a52" /><rect x="8" y="6" width="16" height="56" fill="url(#fd-cyl)" /><rect x="9.4" y="6" width="2.2" height="56" fill="#fff" opacity=".22" /></>,
  log: <><rect x="2" y="22" width="40" height="12" rx="6" fill="#6a4426" /><ellipse cx="42" cy="28" rx="4" ry="6" fill="#b08458" /><ellipse cx="42" cy="28" rx="2" ry="3" fill="#8a6038" /><rect x="2" y="22" width="40" height="12" rx="6" fill="url(#fd-vert)" /><path d="M4 24 H40" stroke="#fff" strokeOpacity=".25" strokeWidth="1.2" /></>,
  bush: <><circle cx="12" cy="26" r="10" fill="#1e3a1c" /><circle cx="24" cy="22" r="12" fill="#244a22" /><circle cx="34" cy="28" r="8" fill="#1a3418" /><path d="M2 34 H42" stroke="#0e1e0c" strokeWidth="2" /></>,
  hay: <><rect x="2" y="16" width="34" height="20" rx="6" fill="#c8a24a" /><path d="M6 20 H32 M6 26 H32 M6 32 H32" stroke="#8a6a2a" strokeWidth="1" /><rect x="2" y="16" width="34" height="20" rx="6" fill="url(#fd-vert)" /><path d="M4 18 Q19 14 34 18" stroke="#fff6c0" strokeOpacity=".5" strokeWidth="1.2" fill="none" /></>,
  fence: <><rect x="0" y="16" width="48" height="3" fill="#6a4a2a" /><rect x="0" y="26" width="48" height="3" fill="#6a4a2a" />{[2, 18, 34].map((x) => <rect key={x} x={x} y="8" width="4" height="28" fill="#5a3a1e" />)}</>,
  buoy: <><path d="M8 34 L12 12 L22 12 L26 34 Z" fill="#d8322a" /><rect x="10" y="20" width="14" height="5" fill="#f4f0e8" /><rect x="15" y="2" width="4" height="10" fill="#3a3a3a" /><path d="M8 34 L12 12 L22 12 L26 34 Z" fill="url(#fd-gloss)" /><ellipse cx="13.6" cy="18" rx="1.2" ry="4" fill="url(#fd-spec)" /><g className="glint" style={{ "--gd": "-.9s" }}><path d="M12 10 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fff" /></g></>,
}
const BOX = { car: [68, 38], lamp: [34, 70], pillar: [32, 66], log: [48, 36], bush: [44, 36], fence: [48, 36], hay: [38, 36] }

// where props stand, in % of the field: the far edges and the gaps between
// lanes, clear of the fighters' spots and the lane markers
export const PROP_LAYOUT = {
  city: [['car', 6, 42], ['drum', 94, 37], ['sandbags', 4, 62], ['tires', 95, 58], ['cone', 40, 55], ['lamp', 97, 82], ['rubble', 60, 71], ['crate', 3, 86], ['cone', 62, 41], ['drum', 44, 87]],
  canyon: [['rock', 5, 40], ['drum', 95, 40], ['rubble', 3, 62], ['rock', 96, 62], ['crate', 42, 56], ['rock', 60, 72], ['barrel', 4, 86], ['rubble', 96, 87]],
  shore: [['rock', 5, 39], ['buoy', 95, 38], ['crate', 4, 60], ['log', 94, 60], ['sandbags', 41, 56], ['rock', 60, 71], ['barrel', 3, 86], ['log', 95, 87]],
  forest: [['bush', 5, 40], ['log', 94, 40], ['bush', 3, 62], ['bush', 96, 61], ['log', 41, 56], ['rock', 60, 71], ['bush', 4, 87], ['crate', 96, 87]],
  frost: [['rock', 5, 40], ['crate', 95, 40], ['rock', 3, 62], ['barrel', 96, 61], ['crate', 41, 56], ['rock', 60, 71], ['rock', 4, 87], ['sandbags', 96, 87]],
  ruins: [['pillar', 5, 46], ['pillar', 95, 44], ['rubble', 3, 63], ['rubble', 96, 62], ['rock', 41, 56], ['rubble', 60, 71], ['pillar', 3, 92], ['rock', 96, 88]],
  plains: [['hay', 5, 40], ['fence', 94, 40], ['barrel', 3, 62], ['hay', 96, 61], ['rock', 41, 56], ['crate', 60, 71], ['fence', 4, 87], ['barrel', 96, 87]],
}

function Props({ map }) {
  const list = PROP_LAYOUT[map] || PROP_LAYOUT.plains
  return (
    <div className={`props props-${map}`} aria-hidden="true">
      {list.map(([k, x, y], i) => {
        const [w, h] = BOX[k] || [32, 38]
        const s = 0.55 + ((y - 30) / 70) * 0.55 // further back = smaller
        return (
          <svg key={i} className={`prop prop-${k}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h}
            style={{ left: `${x}%`, top: `${y}%`, '--ps': s * 1.15, zIndex: Math.round(y / 7) }}>
            {P[k]}
          </svg>
        )
      })}
    </div>
  )
}
export default memo(Props)
