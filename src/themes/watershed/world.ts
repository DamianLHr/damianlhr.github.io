// watershed — loading the baked world.
//
// The erosion simulation runs at build time (scripts/watershed), so the theme
// only decodes what it produced: a heightfield, the discharge that carved it,
// drainage basins and the town sites the terrain chose. Nothing is simulated in
// the browser.

export interface WorldMeta {
  size: number
  seaLevel: number
  maxDischarge: number
  basins: number
  sites: { x: number; y: number; h: number; basin: number }[]
}

export interface World {
  size: number
  seaLevel: number
  /** 0..1, normalised so the tallest summit is 1 */
  height: Float32Array
  /** 0..1 flow through each cell */
  discharge: Float32Array
  /** drainage basin id, 0 for sea */
  basin: Uint8Array
  meta: WorldMeta
}

/** Read an image back as raw bytes through a canvas. */
async function decode(url: string): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('watershed: no 2d context to decode terrain')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  return { w: c.width, h: c.height, data }
}

export async function loadWorld(base = import.meta.env.BASE_URL): Promise<World> {
  const root = `${base}watershed/`.replace(/\/+watershed\//, '/watershed/')
  const [terrain, basinImg, meta] = await Promise.all([
    decode(`${root}terrain.png`),
    decode(`${root}basin.png`),
    fetch(`${root}world.json`).then((r) => r.json() as Promise<WorldMeta>),
  ])

  const n = terrain.w * terrain.h
  const height = new Float32Array(n)
  const discharge = new Float32Array(n)
  const basin = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    // height is 16-bit across R,G — see scripts/watershed/png.mjs
    height[i] = ((terrain.data[o] << 8) | terrain.data[o + 1]) / 65535
    discharge[i] = terrain.data[o + 2] / 255
    basin[i] = basinImg.data[i * 4]
  }
  return { size: terrain.w, seaLevel: meta.seaLevel, height, discharge, basin, meta }
}

// --- shading ------------------------------------------------------------------

export interface Palette {
  deep: [number, number, number]
  shallow: [number, number, number]
  sand: [number, number, number]
  grass: [number, number, number]
  grassDry: [number, number, number]
  dirt: [number, number, number]
  rock: [number, number, number]
  rockHi: [number, number, number]
  snow: [number, number, number]
  river: [number, number, number]
}

export const NATURAL: Palette = {
  deep: [0.07, 0.16, 0.28],
  shallow: [0.2, 0.39, 0.53],
  sand: [0.78, 0.71, 0.53],
  grass: [0.34, 0.47, 0.22],
  grassDry: [0.51, 0.54, 0.29],
  dirt: [0.46, 0.36, 0.25],
  rock: [0.47, 0.45, 0.43],
  rockHi: [0.62, 0.6, 0.58],
  snow: [0.93, 0.94, 0.95],
  river: [0.22, 0.4, 0.56],
}

const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export interface Surface {
  /** per-vertex RGB with sun and occlusion already applied */
  colors: Float32Array
  /** slope magnitude per cell */
  slope: Float32Array
  /** 0..1 sky visibility per cell */
  ao: Float32Array
  /** elevation percentile bands used for colour */
  bands: number[]
}

/**
 * Bake the whole look into vertex colours: hypsometric tint, then a fixed sun,
 * then ambient occlusion.
 *
 * The sun never moves, so lighting it per frame would be paying repeatedly for
 * an answer that cannot change — and this way the mesh needs no lit material at
 * all. The occlusion term is the part that makes valleys read as valleys rather
 * than as blue lines drawn on a hillside.
 */
export function bakeSurface(w: World, pal: Palette = NATURAL): Surface {
  const s = w.size
  const n = s * s
  const h = w.height
  const sea = w.seaLevel
  const at = (x: number, y: number) =>
    h[(y < 0 ? 0 : y > s - 1 ? s - 1 : y) * s + (x < 0 ? 0 : x > s - 1 ? s - 1 : x)]

  // slope + normals
  const slope = new Float32Array(n)
  const nrm = new Float32Array(n * 3)
  const zs = 0.55 // vertical exaggeration used for shading only
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5
      slope[i] = Math.hypot(gx, gy)
      const nx = -gx / zs
      const ny = -gy / zs
      const l = Math.hypot(nx, ny, 1)
      nrm[i * 3] = nx / l
      nrm[i * 3 + 1] = ny / l
      nrm[i * 3 + 2] = 1 / l
    }
  }

  // Ambient occlusion by horizon sampling: how much of the surrounding terrain
  // rises above this point. Cheap, and it darkens exactly the gorges and
  // valley floors that flat shading loses.
  const ao = new Float32Array(n)
  const RADII = [2, 4, 7, 11, 16]
  const DIRS = 8
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x
      const hi = h[i]
      let occ = 0
      for (let d = 0; d < DIRS; d++) {
        const a = (d / DIRS) * Math.PI * 2
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        let maxRise = 0
        for (const r of RADII) {
          const rise = (at(Math.round(x + dx * r), Math.round(y + dy * r)) - hi) / (r * 0.012)
          if (rise > maxRise) maxRise = rise
        }
        occ += Math.min(1, Math.max(0, maxRise))
      }
      ao[i] = 1 - (occ / DIRS) * 0.85
    }
  }

  // hypsometric bands from the land's own distribution
  const land: number[] = []
  for (let i = 0; i < n; i++) if (h[i] >= sea) land.push(h[i])
  land.sort((a, b) => a - b)
  const q = (p: number) => land[Math.min(land.length - 1, Math.floor(p * land.length))] ?? sea
  const bands = [
    sea,
    q(0.25),
    q(0.5),
    q(0.7),
    q(0.85),
    q(0.94),
    q(0.99),
    land[land.length - 1] ?? 1,
  ]
  const bandOf = (v: number) => {
    if (v <= bands[0]) return 0
    for (let k = 1; k < bands.length; k++) {
      if (v <= bands[k]) {
        return (k - 1 + (v - bands[k - 1]) / (bands[k] - bands[k - 1] || 1)) / (bands.length - 1)
      }
    }
    return 1
  }
  const ls: number[] = []
  for (let i = 0; i < n; i++) if (h[i] >= sea) ls.push(slope[i])
  ls.sort((a, b) => a - b)
  const slopeRef = ls[Math.floor(ls.length * 0.6)] || 0.01

  // fixed sun, low in the west so relief casts long gradients
  const SUN = (() => {
    const v = [-0.52, -0.58, 0.63]
    const l = Math.hypot(v[0], v[1], v[2])
    return v.map((c) => c / l)
  })()

  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const hv = h[i]
    let c: [number, number, number]
    if (hv < sea) {
      c = mix3(pal.shallow, pal.deep, clamp01((sea - hv) / 0.1))
    } else {
      const e = bandOf(hv)
      if (e < 0.06) c = pal.sand as [number, number, number]
      else if (e < 0.34) c = mix3(pal.grass, pal.grassDry, (e - 0.06) / 0.28)
      else if (e < 0.62) c = mix3(pal.grassDry, pal.dirt, (e - 0.34) / 0.28)
      else c = mix3(pal.dirt, pal.rock, Math.min(1, (e - 0.62) / 0.28))

      // Only genuinely steep ground should strip to bare rock. A low threshold
      // greys out whole hillsides that ought to read as forest and meadow.
      const cliff = clamp01((slope[i] / slopeRef - 2.6) / 3.2)
      c = mix3(c, pal.rockHi, cliff)
      const snow = clamp01((e - 0.84) / 0.16) * (1 - cliff * 0.85)
      c = mix3(c, pal.snow, snow)
      const wet = w.discharge[i]
      if (wet > 0.18) c = mix3(c, pal.river, Math.min(1, (wet - 0.18) / 0.3))

      const lam = Math.max(
        0,
        nrm[i * 3] * SUN[0] + nrm[i * 3 + 1] * SUN[1] + nrm[i * 3 + 2] * SUN[2],
      )
      const light = (0.42 + 0.78 * lam) * (0.35 + 0.65 * ao[i])
      c = [c[0] * light, c[1] * light, c[2] * light]
    }
    colors[i * 3] = clamp01(c[0])
    colors[i * 3 + 1] = clamp01(c[1])
    colors[i * 3 + 2] = clamp01(c[2])
  }

  return { colors, slope, ao, bands }
}

/** Where trees grow: sheltered, gentle, low-to-mid ground away from open water. */
export function forest(
  w: World,
  surf: Surface,
  max: number,
  seed = 99,
): { x: number; y: number; h: number; scale: number }[] {
  const s = w.size
  const out: { x: number; y: number; h: number; scale: number }[] = []
  const bands = surf.bands
  const upper = bands[5]
  let state = seed >>> 0
  const rnd = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const slopeCap = 0.9
  for (let i = 0; i < s * s && out.length < max; i++) {
    const hv = w.height[i]
    if (hv < w.seaLevel + 0.012 || hv > upper) continue
    if (surf.slope[i] > slopeCap * 0.02) continue
    if (w.discharge[i] > 0.22) continue
    // denser in sheltered ground, thinner on exposed shoulders
    const p = 0.16 * (0.35 + 0.65 * surf.ao[i])
    if (rnd() > p) continue
    const x = i % s
    const y = (i / s) | 0
    out.push({
      x: x + rnd() - 0.5,
      y: y + rnd() - 0.5,
      h: hv,
      scale: 0.7 + rnd() * 0.7,
    })
  }
  return out
}
