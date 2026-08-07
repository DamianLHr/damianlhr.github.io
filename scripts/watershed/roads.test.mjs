import { describe, expect, it } from 'vitest'
import { createWorld, erode, lakes, pruneIslands, DEFAULTS } from './erode.mjs'
import { roadNetwork } from './roads.mjs'

const SEA = DEFAULTS.seaLevel

function island() {
  const w = createWorld({ size: 128, seed: 3, seaLevel: SEA, landFraction: 0.44 })
  pruneIslands(w, SEA)
  erode(w, { steps: 300, dropsPerStep: 90, seed: 11 })
  return w
}

/** A handful of well-separated land cells to stand in for towns. */
function towns(w, count = 8) {
  const s = w.size
  const out = []
  const sep = s * 0.14
  for (let y = 4; y < s - 4 && out.length < count; y += 3) {
    for (let x = 4; x < s - 4 && out.length < count; x += 3) {
      if (w.height[y * s + x] < SEA + 0.02) continue
      if (out.every((p) => Math.hypot(p.x - x, p.y - y) > sep)) out.push({ x, y })
    }
  }
  return out
}

describe('roads', () => {
  it('connects every town exactly once — a spanning tree, not a mesh', () => {
    const w = island()
    const sites = towns(w)
    expect(sites.length).toBeGreaterThan(3)
    const { roads, unreachable } = roadNetwork(w, sites, { seaLevel: SEA })
    expect(unreachable).toBe(0)
    expect(roads.length).toBe(sites.length - 1)

    // every town is reachable by walking the edges from the first
    const seen = new Set([0])
    let grew = true
    while (grew) {
      grew = false
      for (const r of roads) {
        if (seen.has(r.from) && !seen.has(r.to)) {
          seen.add(r.to)
          grew = true
        }
        if (seen.has(r.to) && !seen.has(r.from)) {
          seen.add(r.from)
          grew = true
        }
      }
    }
    expect(seen.size).toBe(sites.length)
  })

  it('never routes a road through water', () => {
    const w = island()
    const { depth } = lakes(w, SEA)
    const sites = towns(w)
    const { roads } = roadNetwork(w, sites, { seaLevel: SEA, lake: depth })
    const s = w.size
    for (const r of roads) {
      for (const [x, y] of r.points) {
        const i = Math.round(y) * s + Math.round(x)
        expect(w.height[i]).toBeGreaterThanOrEqual(SEA)
        expect(depth[i]).toBe(0)
      }
    }
  })

  it('prefers gentle ground: a road is longer than the straight line but flatter', () => {
    const w = island()
    const sites = towns(w)
    const { roads } = roadNetwork(w, sites, { seaLevel: SEA })
    const s = w.size
    let roadRise = 0
    let roadSteps = 0
    let straightRise = 0
    let straightSteps = 0
    for (const r of roads) {
      const a = sites[r.from]
      const b = sites[r.to]
      for (let k = 0; k < r.points.length - 1; k++) {
        const [x0, y0] = r.points[k]
        const [x1, y1] = r.points[k + 1]
        const h0 = w.height[Math.round(y0) * s + Math.round(x0)]
        const h1 = w.height[Math.round(y1) * s + Math.round(x1)]
        roadRise += Math.abs(h1 - h0)
        roadSteps += Math.hypot(x1 - x0, y1 - y0)
      }
      // the same journey taken as the crow flies
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y)))
      for (let k = 0; k < n; k++) {
        const t0 = k / n
        const t1 = (k + 1) / n
        const p0 = [a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0]
        const p1 = [a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1]
        const h0 = w.height[Math.round(p0[1]) * s + Math.round(p0[0])]
        const h1 = w.height[Math.round(p1[1]) * s + Math.round(p1[0])]
        straightRise += Math.abs(h1 - h0)
        straightSteps += Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
      }
    }
    // climb per unit travelled: the whole point of routing over the terrain
    expect(roadRise / roadSteps).toBeLessThan(straightRise / straightSteps)
  })

  it('is deterministic', () => {
    const a = island()
    const b = island()
    const sa = towns(a)
    const sb = towns(b)
    expect(JSON.stringify(roadNetwork(a, sa, { seaLevel: SEA }).roads)).toEqual(
      JSON.stringify(roadNetwork(b, sb, { seaLevel: SEA }).roads),
    )
  })
})
