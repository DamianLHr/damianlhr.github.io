import { describe, expect, it } from 'vitest'
import { createWorld, erode, fillDepressions, flowField, basins, DEFAULTS } from './erode.mjs'

// The simulation is a feedback loop, so it fails in ways that are invisible in a
// single screenshot: mass quietly draining out of the world, entrainment running
// away into spikes, drainage dead-ending in pits. These pin the properties that
// separate a landscape from a mess.

const SEA = DEFAULTS.seaLevel
const small = () =>
  createWorld({ size: 96, seed: 3, seaLevel: SEA, landFraction: 0.44 })

function run(w, steps = 200, params = {}) {
  return erode(w, { steps, dropsPerStep: 60, seed: 11, params })
}

describe('world generation', () => {
  it('is deterministic', () => {
    const a = small()
    const b = small()
    expect(Array.from(a.height.slice(0, 400))).toEqual(Array.from(b.height.slice(0, 400)))
  })

  it('calibrates sea level to the requested land fraction', () => {
    for (const frac of [0.3, 0.44, 0.6]) {
      const w = createWorld({ size: 96, seed: 5, seaLevel: SEA, landFraction: frac })
      let land = 0
      for (let i = 0; i < w.height.length; i++) if (w.height[i] >= SEA) land++
      expect(Math.abs(land / w.height.length - frac)).toBeLessThan(0.03)
    }
  })

  it('keeps heights finite and in range', () => {
    const w = small()
    for (let i = 0; i < w.height.length; i++) {
      expect(Number.isFinite(w.height[i])).toBe(true)
      expect(w.height[i]).toBeGreaterThanOrEqual(0)
      expect(w.height[i]).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('erosion', () => {
  it('is deterministic for a seed', () => {
    const a = small()
    const b = small()
    run(a)
    run(b)
    expect(Array.from(a.height.slice(0, 400))).toEqual(Array.from(b.height.slice(0, 400)))
  })

  it('does not run away: no spikes, no silted-up sea', () => {
    const w = small()
    const landBefore = w.height.reduce((n, h) => n + (h >= SEA ? 1 : 0), 0)
    run(w, 400)
    let max = 0
    for (let i = 0; i < w.height.length; i++) {
      expect(Number.isFinite(w.height[i])).toBe(true)
      if (w.height[i] > max) max = w.height[i]
    }
    // unbounded entrainment used to push peaks past 4.0 and flood the map
    expect(max).toBeLessThan(1.6)
    const landAfter = w.height.reduce((n, h) => n + (h >= SEA ? 1 : 0), 0)
    expect(landAfter / landBefore).toBeGreaterThan(0.6)
    expect(landAfter / landBefore).toBeLessThan(1.4)
  })

  it('does not plane the island flat', () => {
    const w = small()
    run(w, 400)
    let max = 0
    for (let i = 0; i < w.height.length; i++) if (w.height[i] > max) max = w.height[i]
    // relief must survive: discarding particle sediment used to flatten this
    expect(max - SEA).toBeGreaterThan(0.15)
  })

  it('carves channels — discharge concentrates rather than spreading evenly', () => {
    // Channelisation needs room and time to appear: at 96 cells / 400 steps the
    // top percentile carries only ~8% of the water, which says nothing. By
    // 128 / 600 it is ~14% and the effect is real enough to assert on.
    const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
    erode(w, { steps: 600, dropsPerStep: 90, seed: 11 })
    const d = Array.from(w.discharge).sort((a, b) => b - a)
    const total = d.reduce((s, v) => s + v, 0)
    const topPercent = d.slice(0, Math.ceil(d.length * 0.01)).reduce((s, v) => s + v, 0)
    // rivers exist when a tiny fraction of cells carries a large share of water
    expect(topPercent / total).toBeGreaterThan(0.12)
  })
})

describe('drainage', () => {
  it('fills depressions without ever lowering ground', () => {
    const w = small()
    run(w)
    const filled = fillDepressions(w, SEA)
    for (let i = 0; i < w.height.length; i++) {
      expect(filled[i]).toBeGreaterThanOrEqual(w.height[i] - 1e-9)
      expect(Number.isFinite(filled[i])).toBe(true)
    }
  })

  it('routes every land cell to the sea once filled', () => {
    const w = small()
    run(w)
    const filled = fillDepressions(w, SEA)
    const down = flowField(w, SEA, filled)
    const s = w.size
    let land = 0
    let drained = 0
    for (let i = 0; i < s * s; i++) {
      if (w.height[i] < SEA) continue
      // border cells have nowhere to go by construction
      const x = i % s
      const y = (i / s) | 0
      if (x === 0 || y === 0 || x === s - 1 || y === s - 1) continue
      land++
      let cur = i
      let guard = 0
      while (cur >= 0 && w.height[cur] >= SEA && guard++ < s * s) cur = down[cur]
      if (cur >= 0 && w.height[cur] < SEA) drained++
    }
    expect(land).toBeGreaterThan(500)
    expect(drained / land).toBeGreaterThan(0.99)
  })

  it('partitions the land into a handful of named basins', () => {
    // as above, distinct watersheds need a world big enough to have them
    const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
    erode(w, { steps: 600, dropsPerStep: 90, seed: 11 })
    const filled = fillDepressions(w, SEA)
    const b = basins(w, SEA, Math.round(128 * 128 * 0.01), filled)
    expect(b.count).toBeGreaterThan(1)
    expect(b.count).toBeLessThan(80)
    // every labelled cell is land
    for (let i = 0; i < w.height.length; i++) {
      if (b.label[i] >= 0) expect(w.height[i]).toBeGreaterThanOrEqual(SEA)
    }
  })
})
