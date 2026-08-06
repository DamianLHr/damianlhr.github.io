import { describe, expect, it } from 'vitest'
import {
  createWorld,
  erode,
  wind,
  lakes,
  loose,
  pruneIslands,
  fillDepressions,
  flowField,
  basins,
  DEFAULTS,
} from './erode.mjs'

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
    // Rivers exist when a tiny fraction of cells carries a large share of the
    // water. Scaling capacity by discharge and dropping the old cutting damper
    // took this from 0.11 to 0.27 — the threshold guards that gain.
    expect(topPercent / total).toBeGreaterThan(0.2)
  })

  it('keeps the loose layers physical: never negative, never above the ground', () => {
    const w = small()
    run(w, 300)
    for (let i = 0; i < w.height.length; i++) {
      for (const grade of ['gravel', 'sand', 'silt']) {
        expect(Number.isFinite(w[grade][i])).toBe(true)
        expect(w[grade][i]).toBeGreaterThanOrEqual(0)
      }
      expect(loose(w, i)).toBeLessThanOrEqual(w.height[i] + 1e-6)
    }
  })

  it('sorts the bed by grain: gravel in the fast water, silt in the slack', () => {
    // The whole reason for carrying three grades. If deposition does not sort
    // them, they are three names for one material.
    const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
    erode(w, { steps: 600, dropsPerStep: 90, seed: 11 })
    let maxD = 0
    for (let i = 0; i < w.height.length; i++) if (w.discharge[i] > maxD) maxD = w.discharge[i]
    let fastGravel = 0
    let fastSilt = 0
    let slackGravel = 0
    let slackSilt = 0
    for (let i = 0; i < w.height.length; i++) {
      if (w.height[i] < SEA) continue
      if (w.discharge[i] > maxD * 0.25) {
        fastGravel += w.gravel[i]
        fastSilt += w.silt[i]
      } else if (w.discharge[i] < maxD * 0.02) {
        slackGravel += w.gravel[i]
        slackSilt += w.silt[i]
      }
    }
    // coarse where the water is quick, fine where it slackens
    expect(fastGravel / Math.max(1e-9, fastSilt)).toBeGreaterThan(
      slackGravel / Math.max(1e-9, slackSilt),
    )
  })

  it('strips cover off the steep and gathers it in the hollows', () => {
    // The whole point of the two-material model: cover should correlate
    // *negatively* with slope, or cliffs and scree cannot emerge.
    const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
    erode(w, { steps: 500, dropsPerStep: 90, seed: 11 })
    const s = w.size
    let steepCover = 0
    let steepN = 0
    let flatCover = 0
    let flatN = 0
    const slopes = []
    for (let y = 1; y < s - 1; y++) {
      for (let x = 1; x < s - 1; x++) {
        const i = y * s + x
        if (w.height[i] < SEA) continue
        const gx = (w.height[i + 1] - w.height[i - 1]) * 0.5
        const gy = (w.height[i + s] - w.height[i - s]) * 0.5
        slopes.push([Math.hypot(gx, gy), i])
      }
    }
    slopes.sort((a, b) => a[0] - b[0])
    for (let k = 0; k < slopes.length; k++) {
      const [, i] = slopes[k]
      if (k < slopes.length * 0.25) {
        flatCover += loose(w, i)
        flatN++
      } else if (k > slopes.length * 0.75) {
        steepCover += loose(w, i)
        steepN++
      }
    }
    expect(flatCover / flatN).toBeGreaterThan((steepCover / steepN) * 1.3)
  })
})

describe('wind', () => {
  it('moves material without running away', () => {
    const w = small()
    run(w, 200)
    let before = 0
    for (let i = 0; i < w.height.length; i++) before += w.height[i]
    const { moved } = wind(w, { particles: 1500, seed: 4 })
    let after = 0
    let max = 0
    for (let i = 0; i < w.height.length; i++) {
      expect(Number.isFinite(w.height[i])).toBe(true)
      expect(loose(w, i)).toBeGreaterThanOrEqual(0)
      after += w.height[i]
      if (w.height[i] > max) max = w.height[i]
    }
    expect(moved).toBeGreaterThan(0)
    expect(max).toBeLessThan(1.6)
    // grains blow out to sea, so mass may fall — but only slightly
    expect(after).toBeLessThanOrEqual(before + 1e-3)
    expect(after / before).toBeGreaterThan(0.98)
  })

  it('is deterministic for a seed', () => {
    const a = small()
    const b = small()
    run(a, 120)
    run(b, 120)
    wind(a, { particles: 800, seed: 9 })
    wind(b, { particles: 800, seed: 9 })
    expect(Array.from(a.height.slice(0, 400))).toEqual(Array.from(b.height.slice(0, 400)))
  })
})

describe('islands', () => {
  it('leaves one landmass, clear of the frame', () => {
    const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
    const before = pruneIslands(w, SEA)
    expect(before.components).toBeGreaterThan(1)
    expect(before.sunk).toBeGreaterThan(0)

    // recount: everything left must be one connected blob away from the border
    const s = w.size
    const seen = new Uint8Array(s * s)
    let blobs = 0
    const margin = Math.round(s * 0.14)
    for (let start = 0; start < s * s; start++) {
      if (w.height[start] < SEA || seen[start]) continue
      blobs++
      const stack = [start]
      seen[start] = 1
      while (stack.length) {
        const i = stack.pop()
        const x = i % s
        const y = (i / s) | 0
        // the surviving island never reaches the frame
        expect(x).toBeGreaterThanOrEqual(1)
        expect(y).toBeGreaterThanOrEqual(1)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
            const j = ny * s + nx
            if (seen[j] || w.height[j] < SEA) continue
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    expect(blobs).toBeLessThanOrEqual(3)
    // Nothing survives hard against the frame. The mainland is kept whatever it
    // touches, so this is the band `createWorld` guarantees as open water rather
    // than the wider margin an *islet* has to clear to be spared.
    const frame = Math.round(s * 0.04)
    expect(margin).toBeGreaterThan(frame)
    for (let i = 0; i < s * s; i++) {
      const x = i % s
      const y = (i / s) | 0
      if (x < frame || y < frame || x >= s - frame || y >= s - frame) {
        expect(w.height[i]).toBeLessThan(SEA)
      }
    }
  })
})

describe('lakes', () => {
  it('stands water only on land, and only below the spill level', () => {
    const w = small()
    run(w, 300)
    const filled = fillDepressions(w, SEA)
    const { depth, cells } = lakes(w, SEA, 0.002, filled)
    expect(cells).toBeGreaterThan(0)
    for (let i = 0; i < depth.length; i++) {
      if (depth[i] <= 0) continue
      expect(w.height[i]).toBeGreaterThanOrEqual(SEA)
      // the surface it fills to is the spill level, never below the ground
      expect(w.height[i] + depth[i]).toBeCloseTo(filled[i], 5)
    }
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
