// atlas — relief.
//
// Everything visible on the land derives from one heightfield: contours, rivers,
// hachures, peaks and the shore shading all read the same grid. That is what
// makes the plate cohere — rivers run *down* real slopes into real sea, valleys
// sit between real ridges, and hachures lean the way the ground actually falls.
// Decorative scribbles cannot do that, and it shows immediately.
//
// Pure and deterministic: same seed in, same country out.

import type { Pt } from './terrain'

// --- value noise / fBm --------------------------------------------------------

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Fractal Brownian motion — the ridges and basins under the whole continent. */
export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 1013) * amp
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

/** Ridged noise — sharper crests, so mountain chains read as chains. */
export function ridged(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    const v = 1 - Math.abs(valueNoise(x * f, y * f, seed + o * 7717) * 2 - 1)
    sum += v * v * amp
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  return sum / norm
}

// --- the grid -----------------------------------------------------------------

export interface Grid {
  w: number
  h: number
  cell: number
  x0: number
  y0: number
  /** 1 where land */
  land: Uint8Array
  /** cells from the coast, inland (0 at sea) */
  inland: Float32Array
  /** cells from the coast, offshore (0 on land) */
  offshore: Float32Array
  /** 0 at the waterline, 1 at the highest summit */
  height: Float32Array
  toWorld(ix: number, iy: number): Pt
}

/** Scanline polygon fill — O(rows·edges), not O(cells·edges). */
function rasterize(polys: Pt[][], g: Grid): void {
  for (let iy = 0; iy < g.h; iy++) {
    const wy = g.y0 + (iy + 0.5) * g.cell
    const xs: number[] = []
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        if (a.y > wy !== b.y > wy) {
          xs.push(a.x + ((wy - a.y) / (b.y - a.y)) * (b.x - a.x))
        }
      }
    }
    if (xs.length < 2) continue
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - g.x0) / g.cell - 0.5))
      const to = Math.min(g.w - 1, Math.floor((xs[k + 1] - g.x0) / g.cell - 0.5))
      for (let ix = from; ix <= to; ix++) g.land[iy * g.w + ix] = 1
    }
  }
}

/** Two-pass chamfer distance transform, in cells. */
function chamfer(seedIsZero: Uint8Array, w: number, h: number, wantInside: number): Float32Array {
  const D = new Float32Array(w * h)
  const BIG = 1e9
  for (let i = 0; i < w * h; i++) D[i] = seedIsZero[i] === wantInside ? BIG : 0
  const put = (i: number, v: number) => {
    if (v < D[i]) D[i] = v
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (D[i] === 0) continue
      if (x > 0) put(i, D[i - 1] + 1)
      if (y > 0) put(i, D[i - w] + 1)
      if (x > 0 && y > 0) put(i, D[i - w - 1] + 1.414)
      if (x < w - 1 && y > 0) put(i, D[i - w + 1] + 1.414)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (D[i] === 0) continue
      if (x < w - 1) put(i, D[i + 1] + 1)
      if (y < h - 1) put(i, D[i + w] + 1)
      if (x < w - 1 && y < h - 1) put(i, D[i + w + 1] + 1.414)
      if (x > 0 && y < h - 1) put(i, D[i + w - 1] + 1.414)
    }
  }
  return D
}

export interface GridSpec {
  polys: Pt[][]
  x0: number
  y0: number
  x1: number
  y1: number
  cell: number
  seed: number
  /** how many cells inland the ground takes to climb away from the water */
  shore?: number
  /** world units per noise unit — larger means broader landforms */
  scale?: number
}

export function buildGrid(spec: GridSpec): Grid {
  const w = Math.max(2, Math.ceil((spec.x1 - spec.x0) / spec.cell))
  const h = Math.max(2, Math.ceil((spec.y1 - spec.y0) / spec.cell))
  const g: Grid = {
    w,
    h,
    cell: spec.cell,
    x0: spec.x0,
    y0: spec.y0,
    land: new Uint8Array(w * h),
    inland: new Float32Array(w * h),
    offshore: new Float32Array(w * h),
    height: new Float32Array(w * h),
    toWorld: (ix, iy) => ({
      x: spec.x0 + (ix + 0.5) * spec.cell,
      y: spec.y0 + (iy + 0.5) * spec.cell,
    }),
  }
  rasterize(spec.polys, g)
  g.inland.set(chamfer(g.land, w, h, 1))
  g.offshore.set(chamfer(g.land, w, h, 0))

  const shore = spec.shore ?? 9
  const scale = spec.scale ?? 260
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      const i = iy * w + ix
      if (!g.land[i]) continue
      const p = g.toWorld(ix, iy)
      const nx = p.x / scale
      const ny = p.y / scale
      // broad basins blended with ridged chains, then forced to zero at the coast
      const base = fbm(nx, ny, spec.seed, 5)
      const chain = ridged(nx * 0.72 + 11.3, ny * 0.72 - 4.1, spec.seed + 99, 4)
      const mix = base * 0.55 + chain * 0.62 * smooth(Math.min(1, base * 1.35))
      const rise = Math.min(1, g.inland[i] / shore)
      g.height[i] = Math.max(0, mix * smooth(rise))
    }
  }
  // normalise so the tallest summit is 1
  let max = 0
  for (let i = 0; i < w * h; i++) if (g.height[i] > max) max = g.height[i]
  if (max > 0) for (let i = 0; i < w * h; i++) g.height[i] /= max
  return g
}

// --- marching squares ---------------------------------------------------------

/**
 * Iso-lines as one path of short segments. Neighbouring segments share
 * endpoints, so they read as continuous engraved lines without the cost of
 * stitching them into polylines.
 */
export function isoPath(
  values: Float32Array,
  g: Grid,
  level: number,
  mask?: (i: number) => boolean,
): string {
  const parts: string[] = []
  const { w, h, cell, x0, y0 } = g
  const lerp = (ax: number, ay: number, av: number, bx: number, by: number, bv: number): Pt => {
    const t = Math.abs(bv - av) < 1e-9 ? 0.5 : (level - av) / (bv - av)
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t }
  }
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const i00 = iy * w + ix
      const i10 = i00 + 1
      const i01 = i00 + w
      const i11 = i01 + 1
      if (mask && !(mask(i00) || mask(i10) || mask(i01) || mask(i11))) continue
      const v00 = values[i00]
      const v10 = values[i10]
      const v01 = values[i01]
      const v11 = values[i11]
      const code =
        (v00 > level ? 1 : 0) |
        (v10 > level ? 2 : 0) |
        (v11 > level ? 4 : 0) |
        (v01 > level ? 8 : 0)
      if (code === 0 || code === 15) continue
      const px = x0 + (ix + 0.5) * cell
      const py = y0 + (iy + 0.5) * cell
      const qx = px + cell
      const qy = py + cell
      const top = () => lerp(px, py, v00, qx, py, v10)
      const right = () => lerp(qx, py, v10, qx, qy, v11)
      const bottom = () => lerp(px, qy, v01, qx, qy, v11)
      const left = () => lerp(px, py, v00, px, qy, v01)
      const seg = (a: Pt, b: Pt) =>
        parts.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`)
      switch (code) {
        case 1:
        case 14:
          seg(left(), top())
          break
        case 2:
        case 13:
          seg(top(), right())
          break
        case 3:
        case 12:
          seg(left(), right())
          break
        case 4:
        case 11:
          seg(right(), bottom())
          break
        case 6:
        case 9:
          seg(top(), bottom())
          break
        case 7:
        case 8:
          seg(left(), bottom())
          break
        case 5:
          seg(left(), top())
          seg(right(), bottom())
          break
        case 10:
          seg(top(), right())
          seg(left(), bottom())
          break
      }
    }
  }
  return parts.join('')
}

// --- hydrology ----------------------------------------------------------------

export interface RiverResult {
  /** paths bucketed by discharge, so trunk rivers engrave heavier than brooks */
  small: string
  mid: string
  large: string
  mouths: Pt[]
}

/**
 * Steepest-descent flow accumulation. Every land cell sheds one unit of rain
 * into its lowest neighbour; processing from the summits down means each cell is
 * resolved before whatever it drains into. Rivers are the cells carrying more
 * than a threshold — a genuine dendritic network, not drawn squiggles.
 */
export function rivers(g: Grid, minFlow = 60): RiverResult {
  const n = g.w * g.h
  const order: number[] = []
  for (let i = 0; i < n; i++) if (g.land[i]) order.push(i)
  order.sort((a, b) => g.height[b] - g.height[a])

  const down = new Int32Array(n).fill(-1)
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
    down[i] = best
  }

  const flow = new Float32Array(n)
  for (const i of order) flow[i] += 1
  for (const i of order) {
    const j = down[i]
    if (j >= 0 && g.land[j]) flow[j] += flow[i]
  }

  const buckets: [string[], string[], string[]] = [[], [], []]
  const mouths: Pt[] = []
  for (const i of order) {
    if (flow[i] < minFlow) continue
    const j = down[i]
    if (j < 0) continue
    const a = g.toWorld(i % g.w, (i / g.w) | 0)
    const b = g.toWorld(j % g.w, (j / g.w) | 0)
    const b3 = flow[i] > minFlow * 9 ? 2 : flow[i] > minFlow * 3 ? 1 : 0
    buckets[b3].push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`)
    if (!g.land[j] && flow[i] > minFlow * 3) mouths.push(b)
  }
  return {
    small: buckets[0].join(''),
    mid: buckets[1].join(''),
    large: buckets[2].join(''),
    mouths,
  }
}

// --- relief shading -----------------------------------------------------------

function gradient(g: Grid, ix: number, iy: number): { gx: number; gy: number; slope: number } {
  const at = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(g.w - 1, x))
    const cy = Math.max(0, Math.min(g.h - 1, y))
    const i = cy * g.w + cx
    return g.land[i] ? g.height[i] : 0
  }
  const gx = (at(ix + 1, iy) - at(ix - 1, iy)) / 2
  const gy = (at(ix, iy + 1) - at(ix, iy - 1)) / 2
  return { gx, gy, slope: Math.hypot(gx, gy) }
}

/**
 * Lehmann hachures: strokes run straight down the slope, and steeper ground gets
 * longer, denser, darker strokes. This is how engravers drew relief before
 * contours won, and it is what gives a pure line drawing its 2.5D read.
 * Returns two paths so steep ground can be inked more heavily than gentle.
 */
export function hachures(
  g: Grid,
  step = 3,
  minSlope = 0.006,
): { light: string; heavy: string; count: number } {
  const light: string[] = []
  const heavy: string[] = []
  for (let iy = 1; iy < g.h - 1; iy += step) {
    for (let ix = 1; ix < g.w - 1; ix += step) {
      const i = iy * g.w + ix
      if (!g.land[i] || g.height[i] <= 0.02) continue
      const { gx, gy, slope } = gradient(g, ix, iy)
      if (slope < minSlope) continue
      // jitter keeps the strokes off a visible lattice
      const j = hash2(ix, iy, 8081)
      const p = g.toWorld(ix, iy)
      const len = Math.min(g.cell * 2.6, g.cell * (0.7 + slope * 90))
      const inv = 1 / (slope || 1)
      const dx = -gx * inv
      const dy = -gy * inv
      const ox = (j - 0.5) * g.cell * 0.8
      const oy = (hash2(iy, ix, 3313) - 0.5) * g.cell * 0.8
      const seg = `M${(p.x + ox).toFixed(1)} ${(p.y + oy).toFixed(1)}l${(dx * len).toFixed(1)} ${(dy * len).toFixed(1)}`
      ;(slope > minSlope * 4 ? heavy : light).push(seg)
    }
  }
  return { light: light.join(''), heavy: heavy.join(''), count: light.length + heavy.length }
}

/** Local maxima, thinned by a separation radius — the summits worth naming. */
export function peaks(g: Grid, minHeight = 0.55, separation = 14): { at: Pt; h: number }[] {
  const found: { at: Pt; h: number; ix: number; iy: number }[] = []
  for (let iy = 2; iy < g.h - 2; iy++) {
    for (let ix = 2; ix < g.w - 2; ix++) {
      const i = iy * g.w + ix
      if (!g.land[i] || g.height[i] < minHeight) continue
      const v = g.height[i]
      let top = true
      for (let dy = -2; dy <= 2 && top; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue
          const j = (iy + dy) * g.w + (ix + dx)
          if (g.height[j] > v) {
            top = false
            break
          }
        }
      }
      if (top) found.push({ at: g.toWorld(ix, iy), h: v, ix, iy })
    }
  }
  found.sort((a, b) => b.h - a.h)
  const kept: typeof found = []
  for (const p of found) {
    if (kept.every((q) => Math.hypot(q.ix - p.ix, q.iy - p.iy) > separation)) kept.push(p)
  }
  return kept.map((p) => ({ at: p.at, h: p.h }))
}

/**
 * Somewhere to put a city: low, gentle, near enough the coast to trade, and far
 * enough from its neighbours to deserve its own name.
 */
export function settleable(g: Grid, count: number, seed: number, separation = 22): Pt[] {
  const cand: { i: number; score: number; ix: number; iy: number }[] = []
  for (let iy = 1; iy < g.h - 1; iy += 2) {
    for (let ix = 1; ix < g.w - 1; ix += 2) {
      const i = iy * g.w + ix
      if (!g.land[i]) continue
      const inl = g.inland[i]
      if (inl < 2) continue
      const { slope } = gradient(g, ix, iy)
      // prefer gentle ground, moderate elevation, a few cells in from the water
      const score =
        1 / (1 + slope * 120) +
        1 / (1 + Math.abs(inl - 6) * 0.35) +
        (1 - g.height[i]) * 0.6 +
        hash2(ix, iy, seed) * 0.35
      cand.push({ i, score, ix, iy })
    }
  }
  cand.sort((a, b) => b.score - a.score)
  const kept: typeof cand = []
  for (const c of cand) {
    if (kept.length >= count) break
    if (kept.every((k) => Math.hypot(k.ix - c.ix, k.iy - c.iy) > separation)) kept.push(c)
  }
  return kept.map((k) => g.toWorld(k.ix, k.iy))
}

/** Seeded stipple for open water, thinning away from the shore. */
export function seaStipple(g: Grid, seed: number, reach = 26, density = 0.055): string {
  const parts: string[] = []
  for (let iy = 0; iy < g.h; iy++) {
    for (let ix = 0; ix < g.w; ix++) {
      const i = iy * g.w + ix
      if (g.land[i]) continue
      const d = g.offshore[i]
      if (d > reach) continue
      // probability falls off as the square of distance from the shore
      const p = 1 - d / reach
      if (hash2(ix, iy, seed) > density * p * p) continue
      const w = g.toWorld(ix, iy)
      const jx = (hash2(ix, iy, seed + 5) - 0.5) * g.cell
      const jy = (hash2(iy, ix, seed + 9) - 0.5) * g.cell
      const r = 0.5 + hash2(ix + 7, iy, seed + 3) * 0.7
      parts.push(
        `M${(w.x + jx).toFixed(1)} ${(w.y + jy).toFixed(1)}m${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
      )
    }
  }
  return parts.join('')
}
