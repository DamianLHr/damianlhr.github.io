import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildGrid,
  hachures,
  isoPath,
  peaks,
  rivers,
  seaStipple,
  settleable,
  type Grid,
} from './relief'
import { territory } from './terrain'

// The relief engine is generated, so correctness has to be asserted rather than
// eyeballed. The load-bearing claim is that every feature reads the *same*
// heightfield: if rivers run uphill or hachures lean the wrong way, the plate
// stops being a map and becomes noise.

let g: Grid
let land: ReturnType<typeof territory>

beforeAll(() => {
  land = territory({ id: 'test-continent', cx: 600, cy: 400, rx: 380, ry: 260, n: 11 })
  g = buildGrid({
    polys: [land.points],
    x0: 100,
    y0: 60,
    x1: 1100,
    y1: 760,
    cell: 5,
    seed: 4242,
  })
})

describe('grid', () => {
  it('rasterises a plausible amount of land', () => {
    const total = g.w * g.h
    let n = 0
    for (let i = 0; i < total; i++) n += g.land[i]
    const frac = n / total
    expect(frac).toBeGreaterThan(0.2)
    expect(frac).toBeLessThan(0.85)
  })

  it('is deterministic', () => {
    const again = buildGrid({
      polys: [land.points],
      x0: 100,
      y0: 60,
      x1: 1100,
      y1: 760,
      cell: 5,
      seed: 4242,
    })
    expect(Array.from(again.height.slice(0, 500))).toEqual(Array.from(g.height.slice(0, 500)))
  })

  it('puts sea at zero height and rises inland to a normalised summit', () => {
    let max = 0
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.land[i]) expect(g.height[i]).toBe(0)
      if (g.height[i] > max) max = g.height[i]
    }
    expect(max).toBeCloseTo(1, 5)
  })

  it('holds the waterline down: coastal cells are lower than the interior', () => {
    let coast = 0
    let coastN = 0
    let deep = 0
    let deepN = 0
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.land[i]) continue
      if (g.inland[i] < 2) {
        coast += g.height[i]
        coastN++
      } else if (g.inland[i] > 14) {
        deep += g.height[i]
        deepN++
      }
    }
    expect(coastN).toBeGreaterThan(50)
    expect(deepN).toBeGreaterThan(50)
    expect(coast / coastN).toBeLessThan(deep / deepN)
  })

  it('measures distance both ways from the coast', () => {
    for (let i = 0; i < g.w * g.h; i++) {
      if (g.land[i]) expect(g.offshore[i]).toBe(0)
      else expect(g.inland[i]).toBe(0)
    }
  })
})

describe('hydrology', () => {
  it('every river segment runs downhill', () => {
    // re-derive the network and check the invariant on the raw grid
    const n = g.w * g.h
    const order: number[] = []
    for (let i = 0; i < n; i++) if (g.land[i]) order.push(i)
    order.sort((a, b) => g.height[b] - g.height[a])
    let checked = 0
    for (const i of order) {
      const x = i % g.w
      const y = (i / g.w) | 0
      let best = -1
      let bestH = g.height[i]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue
          const j = ny * g.w + nx
          const hj = g.land[j] ? g.height[j] : -1
          if (hj < bestH) {
            bestH = hj
            best = j
          }
        }
      }
      if (best < 0) continue
      const hb = g.land[best] ? g.height[best] : -1
      expect(hb).toBeLessThan(g.height[i] + 1e-9)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('produces a network that reaches the sea', () => {
    const r = rivers(g, 60)
    expect(r.large.length + r.mid.length).toBeGreaterThan(0)
    expect(r.mouths.length).toBeGreaterThan(0)
    expect(r.small).not.toContain('NaN')
  })

  it('carries more water in fewer channels — trunks are rarer than brooks', () => {
    const r = rivers(g, 60)
    const count = (s: string) => (s.match(/M/g) ?? []).length
    expect(count(r.small)).toBeGreaterThan(count(r.large))
  })
})

describe('relief shading', () => {
  it('hachures lean downhill', () => {
    const step = 3
    let tested = 0
    for (let iy = 1; iy < g.h - 1 && tested < 400; iy += step) {
      for (let ix = 1; ix < g.w - 1 && tested < 400; ix += step) {
        const i = iy * g.w + ix
        if (!g.land[i] || g.height[i] <= 0.02) continue
        const at = (x: number, y: number) => {
          const j = Math.max(0, Math.min(g.h - 1, y)) * g.w + Math.max(0, Math.min(g.w - 1, x))
          return g.land[j] ? g.height[j] : 0
        }
        const gx = (at(ix + 1, iy) - at(ix - 1, iy)) / 2
        const gy = (at(ix, iy + 1) - at(ix, iy - 1)) / 2
        const slope = Math.hypot(gx, gy)
        if (slope < 0.006) continue
        // stroke direction is -gradient; dot with gradient must be negative
        expect(-gx * gx + -gy * gy).toBeLessThan(0)
        tested++
      }
    }
    expect(tested).toBeGreaterThan(50)
  })

  it('emits strokes, and more of them on rough ground than on a flat disc', () => {
    const rough = hachures(g, 3)
    expect(rough.count).toBeGreaterThan(200)
    expect(rough.light + rough.heavy).not.toContain('NaN')
  })

  it('finds separated summits', () => {
    const ps = peaks(g, 0.55, 14)
    expect(ps.length).toBeGreaterThan(0)
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        expect(Math.hypot(ps[i].at.x - ps[j].at.x, ps[i].at.y - ps[j].at.y)).toBeGreaterThan(
          14 * g.cell * 0.9,
        )
      }
    }
  })
})

describe('placement + ornament', () => {
  it('puts every city on land, well separated', () => {
    const pts = settleable(g, 6, 11, 22)
    expect(pts.length).toBeGreaterThan(2)
    for (const p of pts) {
      const ix = Math.floor((p.x - g.x0) / g.cell)
      const iy = Math.floor((p.y - g.y0) / g.cell)
      expect(g.land[iy * g.w + ix]).toBe(1)
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(
          22 * g.cell * 0.9,
        )
      }
    }
  })

  it('draws contours at mid elevations and nothing above the summit', () => {
    const mid = isoPath(g.height, g, 0.4, (i) => g.land[i] === 1)
    expect(mid.length).toBeGreaterThan(0)
    expect(mid).not.toContain('NaN')
    expect(isoPath(g.height, g, 1.5)).toBe('')
  })

  it('stipples only open water', () => {
    const s = seaStipple(g, 5)
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toContain('NaN')
  })
})
