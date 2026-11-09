// Synthesised sounds — no audio files to load. Muted state persists.
//
// Tuned to be calm: sine and triangle waves only, a soft low-pass filter on
// everything, gentle attacks and slow fades, notes from a pentatonic scale so
// nothing clashes, and a low master volume. Hovering makes no sound at all.

let ctx = null
let master = null
let muted = (() => { try { return localStorage.getItem('orvel:muted') === '1' } catch { return false } })()
const listeners = new Set()

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    ctx = new C()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.3
    master = ctx.createGain(); master.gain.value = 0.55
    master.connect(lp).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq, start, dur, { type = 'sine', vol = 0.04, slide = 0, attack = 0.012 } = {}) {
  const c = ac(); if (!c) return
  const t = c.currentTime + start
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t); o.stop(t + dur + 0.05)
}
// A soft bell: fundamental plus a quiet octave, long tail.
function bell(freq, start, dur = 0.6, vol = 0.03) {
  tone(freq, start, dur, { vol, attack: 0.008 })
  tone(freq * 2, start, dur * 0.6, { vol: vol * 0.25, attack: 0.008 })
}
// Filtered air, for tears and swipes.
function whoosh(start, dur, vol = 0.05, from = 400, to = 1800) {
  const c = ac(); if (!c) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter()
  const t = c.currentTime + start
  f.type = 'bandpass'; f.Q.value = 0.8
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.buffer = buf
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

// C major pentatonic, two octaves up from C5
const P = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760]

const sounds = {
  hover: () => {},
  click: () => tone(660, 0, 0.09, { vol: 0.03 }),
  back: () => tone(494, 0, 0.1, { vol: 0.025 }),
  error: () => { tone(330, 0, 0.16, { type: 'triangle', vol: 0.03 }); tone(262, 0.12, 0.22, { type: 'triangle', vol: 0.03 }) },
  coin: () => { bell(1319, 0, 0.35, 0.025); bell(1760, 0.08, 0.5, 0.02) },
  cash: () => [0, 0.09, 0.18].forEach((t, i) => bell(P[5 + i * 2], t, 0.5, 0.022)),
  open: () => { whoosh(0, 0.5, 0.06, 300, 2400); tone(262, 0, 0.5, { type: 'triangle', vol: 0.02, slide: 260, attack: 0.08 }) },
  shake: () => tone(110, 0, 0.12, { vol: 0.03 }),
  flip: () => whoosh(0, 0.18, 0.035, 900, 2600),
  swipe: () => whoosh(0, 0.22, 0.04, 600, 2000),
  hit: (big = false) => { tone(big ? 110 : 150, 0, 0.22, { type: 'triangle', vol: 0.05, slide: -60 }); whoosh(0, 0.12, 0.03, 300, 900) },
  swing: () => whoosh(0, 0.16, 0.04, 1400, 3400),
  clang: () => { bell(1568, 0, 0.25, 0.02); tone(180, 0, 0.12, { type: 'triangle', vol: 0.03 }) },
  bolt: () => whoosh(0, 0.35, 0.035, 500, 2600),
  guard: () => { bell(784, 0, 0.5, 0.02); tone(392, 0, 0.6, { vol: 0.015, attack: 0.05 }) },
  turn: () => bell(1047, 0, 0.3, 0.015),
  hold: (p = 0) => tone(392 + p * 400, 0, 0.12, { vol: 0.012, attack: 0.03 }),
  // tier 0..5 — rarer cards get more notes and a longer, warmer tail
  reveal: (tier = 0) => {
    const notes = P.slice(0, 2 + tier)
    notes.forEach((f, i) => bell(f, i * 0.09, 0.45 + tier * 0.05, 0.022))
    if (tier >= 3) [262, 330, 392].forEach((f) => tone(f, 0, 1.4 + tier * 0.2, { vol: 0.012, attack: 0.25 }))
  },
  charge: (tier = 0) => tone(196, 0, 0.6 + tier * 0.2, { vol: 0.018, slide: 200 + tier * 120, attack: 0.3 }),
  // the rarest-card finale: a slow swell, a warm chord, then a shimmer
  finaleBuild: (tier = 0) => {
    tone(131, 0, 2.2, { vol: 0.02, slide: 130, attack: 1.2 })
    whoosh(0.6, 1.6, 0.025 + tier * 0.004, 200, 3000)
  },
  finaleHit: (tier = 0) => {
    [262, 330, 392, 523].forEach((f) => tone(f, 0, 2.6, { vol: 0.016, attack: 0.04 }))
    P.slice(4, 6 + tier).forEach((f, i) => bell(f, 0.15 + i * 0.07, 0.9, 0.018))
  },
}

// Vibration on phones that support it (Android; iOS Safari ignores it).
const BUZZ = {
  click: 6, back: 5, error: [20, 40, 20], coin: 10, cash: [12, 40, 12, 40, 18], open: [15, 30, 40], flip: 8, swipe: 8,
  hold: 4, hit: (big) => (big ? [30, 30, 50] : 22), guard: 12, turn: 0,
  reveal: (t) => (t >= 5 ? [40, 40, 40, 40, 160] : t >= 4 ? [30, 40, 90] : t >= 3 ? [20, 30, 45] : t >= 2 ? 18 : 0),
  charge: (t) => (t >= 2 ? Array.from({ length: 4 + t * 2 }, (_, i) => (i % 2 ? 50 : 10)) : 0),
  finaleBuild: () => [10, 80, 10, 70, 12, 60, 14, 50, 16, 40, 20],
  finaleHit: (t) => (t >= 4 ? [80, 50, 200] : [40, 40, 80]),
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
