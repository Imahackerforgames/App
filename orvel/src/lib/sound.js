// Synthesised menu sounds — no audio files to load. Muted state persists.
let ctx = null
let muted = (() => { try { return localStorage.getItem('orvel:muted') === '1' } catch { return false } })()
const listeners = new Set()

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C() }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
function tone(freq, start, dur, { type = 'square', vol = 0.06, slide = 0 } = {}) {
  const c = ac(); if (!c) return
  const t = c.currentTime + start
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t); o.stop(t + dur + 0.02)
}
function noise(start, dur, vol = 0.08) {
  const c = ac(); if (!c) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter()
  f.type = 'highpass'; f.frequency.value = 900
  src.buffer = buf; g.gain.value = vol
  src.connect(f).connect(g).connect(c.destination)
  src.start(c.currentTime + start)
}

const N = [262, 330, 392, 523, 659, 784, 1047, 1319, 1568]
const sounds = {
  hover: () => tone(1800, 0, 0.03, { vol: 0.015 }),
  click: () => { tone(660, 0, 0.05); tone(990, 0.04, 0.06) },
  back: () => { tone(500, 0, 0.05); tone(330, 0.04, 0.07) },
  error: () => { tone(160, 0, 0.12, { type: 'sawtooth', vol: 0.05 }); tone(120, 0.1, 0.16, { type: 'sawtooth', vol: 0.05 }) },
  coin: () => { tone(988, 0, 0.07, { vol: 0.05 }); tone(1319, 0.07, 0.22, { vol: 0.05 }) },
  cash: () => { [0, 0.06, 0.12, 0.18].forEach((t, i) => tone(1047 + i * 220, t, 0.12, { vol: 0.04 })) },
  open: () => { noise(0, 0.35, 0.1); tone(200, 0, 0.4, { type: 'sawtooth', slide: 900, vol: 0.04 }) },
  shake: () => tone(90, 0, 0.08, { type: 'triangle', vol: 0.08 }),
  flip: () => { noise(0, 0.08, 0.05); tone(700, 0, 0.06, { type: 'triangle' }) },
  // tier 0..5 — higher tiers play longer, brighter fanfares
  reveal: (tier = 0) => {
    const notes = N.slice(0, 2 + tier)
    notes.forEach((f, i) => tone(f * (tier >= 4 ? 1 : 0.5) * 2, i * 0.07, 0.18, { type: tier >= 3 ? 'triangle' : 'square', vol: 0.045 }))
    if (tier >= 4) { tone(N[8], notes.length * 0.07, 0.6, { type: 'sine', vol: 0.05 }); noise(0, 0.5, 0.03) }
    if (tier >= 5) [0, 0.12, 0.24, 0.36].forEach((t) => tone(2093, notes.length * 0.07 + 0.3 + t, 0.15, { type: 'sine', vol: 0.03 }))
  },
  charge: (tier = 0) => tone(120, 0, 0.6 + tier * 0.15, { type: 'sawtooth', slide: 400 + tier * 300, vol: 0.03 }),
}

// Vibration on phones that support it (Android; iOS Safari ignores it).
const BUZZ = {
  click: 8, back: 6, error: [30, 40, 30], coin: 15, cash: [15, 40, 15, 40, 25], open: [20, 30, 60], flip: 10,
  reveal: (t) => (t >= 5 ? [60, 40, 60, 40, 200] : t >= 4 ? [40, 40, 120] : t >= 3 ? [30, 30, 60] : t >= 2 ? 25 : 0),
  charge: (t) => (t >= 2 ? Array.from({ length: 4 + t * 2 }, (_, i) => (i % 2 ? 50 : 15)) : 0),
}
function hapticsOn() { try { return localStorage.getItem('orvel:haptics') !== 'off' } catch { return true } }
export function buzz(name, arg) {
  if (!hapticsOn() || !navigator.vibrate) return
  const b = typeof BUZZ[name] === 'function' ? BUZZ[name](arg) : BUZZ[name]
  if (b) try { navigator.vibrate(b) } catch { /* not allowed */ }
}

export function play(name, arg) {
  buzz(name, arg)
  if (!muted) try { sounds[name]?.(arg) } catch { /* audio unavailable */ }
}
export function isMuted() { return muted }
export function setMuted(m) {
  muted = m
  try { localStorage.setItem('orvel:muted', m ? '1' : '0') } catch {}
  listeners.forEach((f) => f(m))
}
export function onMuteChange(f) { listeners.add(f); return () => listeners.delete(f) }
