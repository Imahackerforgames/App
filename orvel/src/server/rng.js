// Unbiased random integers from the platform CSPRNG. Math.random is never
// used for anything that decides what a player receives.

export function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('randomInt: bad bound')
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % maxExclusive
  }
}

// entries: [{ value, weight }] with integer-ish weights >= 0
export function weightedPick(entries) {
  const live = entries.filter((e) => e.weight > 0)
  if (!live.length) return null
  // scale to integers so the draw is exact
  const scaled = live.map((e) => ({ value: e.value, w: Math.round(e.weight * 1000) }))
  const total = scaled.reduce((s, e) => s + e.w, 0)
  let roll = randomInt(total)
  for (const e of scaled) {
    if (roll < e.w) return e.value
    roll -= e.w
  }
  return scaled[scaled.length - 1].value
}

export function uid(prefix = '') {
  const b = new Uint8Array(10)
  globalThis.crypto.getRandomValues(b)
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
