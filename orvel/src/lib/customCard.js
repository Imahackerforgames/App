// Turns a Forge card into what CardFrame renders.
import { makeArt } from './seedArt.js'
import { FRAMES } from '../server/battle.js'

const artCache = new Map()
export function sceneArt(art) {
  const key = `${art.seed}|${art.scene}|${art.palette}`
  if (!artCache.has(key)) artCache.set(key, makeArt(`forge-${art.seed}-${art.scene}`, art.palette, art.scene))
  return artCache.get(key)
}

export function customDisplay(c) {
  const frame = FRAMES.find((f) => f.id === c.frame) || FRAMES[0]
  const card = {
    id: c.id, name: c.name || 'Untitled', code: 'FORGED', collectionNumber: 0, fit: c.fit || 'contain', limited: null,
    imageUrl: c.art?.kind === 'scene' ? sceneArt(c.art) : /^https:/.test(c.art?.imageKey || '') ? c.art.imageKey : null,
    imageKey: c.art?.kind === 'upload' && !/^https:/.test(c.art.imageKey || '') ? c.art.imageKey : null,
  }
  const rarity = { name: `Forged · Lv ${c.level || 1}`, color: c.accent || frame.c1, color2: frame.c2, effect: c.effect || 'matte' }
  return { card, rarity, frame: frame.id, footRight: `LV ${c.level || 1}` }
}
