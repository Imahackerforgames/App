import { memo } from 'react'
import { MAP_ART } from '../lib/mapArt.js'

// The battle background: the creator's painting of the map, with light
// effects laid on the things in it that shine — flickering lanterns and
// torches, pulsing neon, glinting gold and metal, shimmering water and a
// glowing sun or moon — so the painted scene feels alive and solid.
// Positions are in % of the painting.

const FX = {
  west: [['sun', 50, 21, 16], ['lamp', 19.3, 35, 6], ['lamp', 73.7, 35, 6], ['lamp', 88.9, 35, 6], ['window', 66, 42, 5], ['window', 97, 42, 4],
    ['glint', 59.3, 52], ['glint', 52, 56], ['glint', 41.5, 50], ['glint', 82.7, 88], ['glint', 98, 54]],
  temple: [['sun', 66.2, 51, 10], ['torch', 11.6, 41, 7], ['torch', 53.3, 35.5, 7], ['torch', 86.2, 41, 7],
    ['glint', 35.6, 58], ['glint', 39.6, 56], ['glint', 6, 28], ['glint', 37, 24], ['glint', 22, 33], ['shimmer', 72, 63, 18]],
  garden: [['sun', 65.3, 13, 12], ['lamp', 24, 37.3, 6], ['lamp', 92.3, 5, 5], ['lamp', 97.5, 5, 5], ['lamp', 77.7, 44, 4], ['neon', 85.3, 32, 9, '#4fd0ff'],
    ['neon', 31, 27, 4, '#ff5ad0'], ['neon', 35.5, 28, 4, '#5ae8ff'], ['shimmer', 46.7, 62, 22], ['fall', 63.5, 54, 5], ['glint', 6, 63], ['glint', 28, 54]],
  neon: [['moon', 47.3, 8.5, 9], ['lamp', 8.7, 34, 6], ['lamp', 23, 38, 6], ['neon', 32.7, 30.7, 11, '#ff5ad0'], ['neon', 67.3, 14.7, 11, '#4fd0ff'], ['neon', 39.3, 16, 6, '#5af0ff'],
    ['neon', 31, 6, 5, '#c05aff'], ['fall', 61, 49, 6], ['fall', 75.5, 44, 4], ['lamp', 31.7, 63, 4], ['lamp', 50.7, 63, 4], ['lamp', 68.7, 63, 4], ['lamp', 91.7, 27.3, 5],
    ['shimmer', 73.3, 88, 14], ['shimmer', 30, 80, 20], ['glint', 80, 52], ['glint', 93, 53]],
  cove: [['sun', 64.3, 35.3, 11], ['lamp', 2.7, 26, 5], ['lamp', 15.3, 24.7, 5], ['lamp', 90.7, 49.3, 5], ['torch', 32, 39, 6], ['fall', 38.2, 33, 4],
    ['shimmer', 66, 46, 30], ['shimmer', 66, 52, 22], ['glint', 38.3, 59], ['glint', 36, 56], ['glint', 92.7, 53], ['glint', 5, 52], ['glint', 10, 53]],
}

function MapBackdrop({ map }) {
  const src = MAP_ART[map]
  if (!src) return null
  return (
    <div className={`backdrop bd-${map}`} aria-hidden="true">
      <div className="bd-art">
        <img src={src} alt="" draggable="false" />
        {(FX[map] || []).map(([k, x, y, size = 3, color], i) => (
          <span key={i} className={`bdfx bdfx-${k}`} style={{ left: `${x}%`, top: `${y}%`, '--sz': `${size}%`, '--fc': color, '--fd': `${(i * 0.37) % 2.4}s` }} />
        ))}
      </div>
    </div>
  )
}
export default memo(MapBackdrop)
