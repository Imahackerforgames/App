// Per-device display preferences: colour theme and CRT effect.
// Stored in localStorage; applied as attributes on <html> so CSS does the rest.
import { useEffect, useState } from 'react'

export const THEMES = [
  { id: 'deepsea', name: 'Deep Sea', blurb: 'Cool midnight blue', swatch: ['#040c1f', '#11254f', '#3fb8ff', '#7ff6ff'], meta: '#040c1f' },
  { id: 'phosphor', name: 'Phosphor', blurb: 'Green terminal glow', swatch: ['#04130b', '#10361f', '#39ff88', '#c6ff4a'], meta: '#04130b' },
  { id: 'ember', name: 'Ember', blurb: 'Warm sunset orange', swatch: ['#150806', '#36190f', '#ff6a3d', '#ffc23d'], meta: '#150806' },
]
const DEFAULTS = { theme: 'deepsea', crt: 'on', haptics: 'on' }
const listeners = new Set()

function read(k) {
  try { return localStorage.getItem('orvel:' + k) ?? DEFAULTS[k] } catch { return DEFAULTS[k] }
}
function apply() {
  const root = document.documentElement
  let theme = read('theme')
  if (!THEMES.some((t) => t.id === theme)) theme = DEFAULTS.theme
  root.dataset.theme = theme
  root.dataset.crt = read('crt') === 'off' ? 'off' : 'on'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEMES.find((t) => t.id === theme).meta)
}
export function initPrefs() { apply() }
export function setPref(k, v) {
  try { localStorage.setItem('orvel:' + k, v) } catch {}
  apply()
  listeners.forEach((f) => f())
}
export function usePref(k) {
  const [v, setV] = useState(() => read(k))
  useEffect(() => { const f = () => setV(read(k)); listeners.add(f); return () => listeners.delete(f) }, [k])
  return [v, (nv) => setPref(k, nv)]
}
