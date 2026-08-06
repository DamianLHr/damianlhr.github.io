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
  /** the run's own maxima, so surface.png decodes back to what was baked */
  grainScale?: number
  lakeScale?: number
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
  /** thickness of each loose grade above bedrock; all zero means bare rock */
  gravel: Float32Array
  sand: Float32Array
  silt: Float32Array
  /** depth of standing water on the land — the lakes the drainage filled */
  lake: Float32Array
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
  const [terrain, basinImg, surfaceImg, meta] = await Promise.all([
    decode(`${root}terrain.png`),
    decode(`${root}basin.png`),
    decode(`${root}surface.png`),
    fetch(`${root}world.json`).then((r) => r.json() as Promise<WorldMeta>),
  ])

  const n = terrain.w * terrain.h
  const height = new Float32Array(n)
  const discharge = new Float32Array(n)
  const basin = new Uint8Array(n)
  const gravel = new Float32Array(n)
  const sand = new Float32Array(n)
  const silt = new Float32Array(n)
  const lake = new Float32Array(n)
  const grainScale = meta.grainScale ?? 1
  const lakeScale = meta.lakeScale ?? 1
  for (let i = 0; i < n; i++) {
    const o = i * 4
    // height is 16-bit across R,G — see scripts/watershed/png.mjs
    height[i] = ((terrain.data[o] << 8) | terrain.data[o + 1]) / 65535
    discharge[i] = terrain.data[o + 2] / 255
    basin[i] = basinImg.data[i * 4]
    gravel[i] = (surfaceImg.data[o] / 255) * grainScale
    sand[i] = (surfaceImg.data[o + 1] / 255) * grainScale
    silt[i] = (surfaceImg.data[o + 2] / 255) * grainScale
    lake[i] = (surfaceImg.data[o + 3] / 255) * lakeScale
  }
  return {
    size: terrain.w,
    seaLevel: meta.seaLevel,
    height,
    discharge,
    basin,
    gravel,
    sand,
    silt,
    lake,
    meta,
  }
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
  /** loose stone gathered below a face — warmer and lighter than the cliff itself */
  scree: [number, number, number]
  /** fine alluvium over the slack lowland */
  silt: [number, number, number]
  snow: [number, number, number]
  river: [number, number, number]
  lake: [number, number, number]
}

/**
 * The water colours, in the renderer's **linear** working space.
 *
 * These are the single source of truth and are deliberately not hex literals.
 * Vertex colours are consumed as linear, whereas `new THREE.Color(0xRRGGBB)`
 * reads the hex as sRGB and converts — so a hand-matched hex and palette entry
 * silently differ by a gamma curve. That mismatch is what drew a bright polygon
 * edge across the ocean wherever the terrain mesh stopped: the seabed plane and
 * the terrain's own deep water were nowhere near the same colour on screen.
 *
 * scene.ts builds its materials with `Color.setRGB(...)`, which also defaults to
 * the working space, so both sides agree exactly with no conversion by hand.
 */
export const SEABED_LINEAR: [number, number, number] = [0.015, 0.045, 0.095]
export const SEA_LINEAR: [number, number, number] = [0.045, 0.13, 0.26]
/** Rivers and lakes: the pale blue measured off the reference render. */
export const FRESH_LINEAR: [number, number, number] = [0.185, 0.372, 0.604]

const toSRGB = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

/**
 * Snap a channel to a fixed number of steps. Quantising per channel keeps the
 * *ordering* of the shading intact, so the baked sun and ambient occlusion
 * survive as visible bands — the retro look while the valleys still read.
 * Snapping to a hand-picked set of hues would throw that away.
 *
 * Crucially this steps in **sRGB**, not in the linear working space. Linear
 * values bunch up near zero — deep water sits around 0.04 — so evenly spaced
 * linear steps swallow every dark tone and fling it to the nearest coarse rung.
 * Quantising linearly turned the ocean bright teal and washed the land yellow.
 */
export const POSTER_LEVELS = 7

/**
 * Band a colour's *brightness* and leave its hue alone.
 *
 * Rounding R, G and B independently lets the three channels land on different
 * rungs, which drags the hue around — it turned the dirt and rock bands pink.
 * Stepping the peak channel and rescaling the other two by the same factor
 * keeps the ratio between them exactly, so the terrain bands hard into flat
 * tones while brown stays brown.
 */
export function posterise(c: [number, number, number]): [number, number, number] {
  const r = toSRGB(clamp01(c[0]))
  const g = toSRGB(clamp01(c[1]))
  const b = toSRGB(clamp01(c[2]))
  const peak = Math.max(r, g, b)
  if (peak <= 1e-6) return [0, 0, 0]
  const stepped = Math.max(
    1 / (POSTER_LEVELS - 1),
    Math.round(peak * (POSTER_LEVELS - 1)) / (POSTER_LEVELS - 1),
  )
  const k = stepped / peak
  return [toLinear(Math.min(1, r * k)), toLinear(Math.min(1, g * k)), toLinear(Math.min(1, b * k))]
}

/**
 * Sampled off the reference render (nickmcd.me, meandering-rivers post) rather
 * than picked by eye: a dark forest canopy over warm cream ground, grey-brown
 * stone, and pale blue water bright enough to be the thing you see first.
 *
 * These are albedos, and the bake multiplies them by sun and occlusion before
 * posterising, so they sit brighter than the lit values measured in the source
 * image. The old palette read as pale sage and tan because it was built the
 * other way round — lit values used as albedo, then lit again.
 */
export const NATURAL: Palette = {
  // must equal the seabed plane — see SEABED_LINEAR above
  deep: SEABED_LINEAR,
  shallow: [0.16, 0.34, 0.52],
  sand: [0.72, 0.66, 0.49],
  grass: [0.1, 0.18, 0.05],
  grassDry: [0.24, 0.3, 0.09],
  dirt: [0.3, 0.25, 0.16],
  rock: [0.16, 0.15, 0.11],
  rockHi: [0.44, 0.42, 0.36],
  scree: [0.62, 0.58, 0.46],
  silt: [0.34, 0.31, 0.19],
  snow: [0.86, 0.87, 0.85],
  river: [0.26, 0.48, 0.7],
  lake: [0.22, 0.44, 0.66],
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

  // How far the submerged colour has to travel to reach the flat seabed plane.
  // The depth ramp alone does not get there: the bake's border falloff leaves the
  // outer ring only just under water, so it stays near `shallow` and the mesh
  // edge drew a straight lighter-blue line across the ocean against the seabed.
  // Fading to `deep` by the border makes the two agree exactly at the seam, while
  // the shelf around the island keeps its shoals.
  const EDGE_MARGIN = Math.max(1, s * 0.14)

  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const hv = h[i]
    let c: [number, number, number]
    if (hv < sea) {
      c = mix3(pal.shallow, pal.deep, clamp01((sea - hv) / 0.1))
      const x = i % s
      const y = (i / s) | 0
      const edge = clamp01(Math.min(x, y, s - 1 - x, s - 1 - y) / EDGE_MARGIN)
      c = mix3(pal.deep, c, edge)
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
      // The reference has no snowline at all — its summits are bare stone and
      // pale soil. A white cap on this island read as a different picture
      // entirely, so it is kept to a trace on the very highest gentle ground.
      const snow = clamp01((e - 0.96) / 0.04) * (1 - cliff * 0.9) * 0.35
      c = mix3(c, pal.snow, snow)

      // What the ground is *made of*, not just how high it sits. The bake sorts
      // the loose cover into grades and this reads whichever one is lying on
      // top: bare rock on the stripped faces, gravel where a channel or a cliff
      // foot has left it, sand along the wind-worked shores, silt over the
      // slack lowland. That sorting is emergent, so the colour follows the
      // simulation rather than the elevation band.
      //
      // Weighted rather than switched: a hard cut between grades tiles the
      // island into flat patches, and the grades genuinely overlap on the ground.
      const cover = w.gravel[i] + w.sand[i] + w.silt[i]
      if (cover > 1e-6) {
        const k = 1 / cover
        const stony = clamp01(slope[i] / slopeRef - 1.2)
        c = mix3(c, pal.scree, Math.min(0.45, w.gravel[i] * k * (0.3 + stony * 0.5)))
        c = mix3(c, pal.sand, Math.min(0.3, w.sand[i] * k * 0.34))
        c = mix3(c, pal.silt, Math.min(0.34, w.silt[i] * k * 0.36))
      }
      // stripped to bedrock, and steep enough that it shows
      const bare = clamp01((0.004 - cover) / 0.004)
      c = mix3(c, pal.rock, Math.min(0.5, bare * clamp01(slope[i] / slopeRef - 1.1) * 0.85))

      // Rivers are the first thing you see in the reference, so the bed is
      // tinted well before the water surface goes over it — a channel one cell
      // wide otherwise disappears the moment the frame is downscaled.
      const wet = w.discharge[i]
      if (wet > 0.2) c = mix3(c, pal.river, Math.min(0.9, (wet - 0.2) / 0.25))

      // standing water the drainage left behind: a tarn reads as water, not turf
      if (w.lake[i] > 0) {
        c = mix3(c, pal.lake, clamp01(0.45 + w.lake[i] / 0.02))
      }

      const lam = Math.max(
        0,
        nrm[i * 3] * SUN[0] + nrm[i * 3 + 1] * SUN[1] + nrm[i * 3 + 2] * SUN[2],
      )
      const light = (0.42 + 0.78 * lam) * (0.35 + 0.65 * ao[i])
      c = [c[0] * light, c[1] * light, c[2] * light]
    }
    // Posterise last, once the tint, sun and occlusion are all folded in, so the
    // banding follows the light rather than cutting across it. Water included:
    // the seabed plane is posterised the same way, and any difference would put
    // the seam back.
    const p = posterise(c)
    colors[i * 3] = p[0]
    colors[i * 3 + 1] = p[1]
    colors[i * 3 + 2] = p[2]
  }

  return { colors, slope, ao, bands }
}

/** Grove size, in grid cells — the wavelength of the stand/clearing pattern. */
const GROVE_SCALE = 22

/**
 * Smoothed value noise in [0,1], used only to decide where stands of trees sit.
 * Hash-based so it needs no table and stays deterministic for a given seed.
 */
function groveMask(x: number, y: number, seed: number): number {
  const h2 = (ix: number, iy: number) => {
    let v = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 69069)) >>> 0
    v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296
  }
  const fx = x / GROVE_SCALE
  const fy = y / GROVE_SCALE
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const sx = (t => t * t * (3 - 2 * t))(fx - ix)
  const sy = (t => t * t * (3 - 2 * t))(fy - iy)
  const top = h2(ix, iy) + (h2(ix + 1, iy) - h2(ix, iy)) * sx
  const bot = h2(ix, iy + 1) + (h2(ix + 1, iy + 1) - h2(ix, iy + 1)) * sx
  return top + (bot - top) * sy
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
  // The stronger erosion leaves a steeper island, and at the old cap the forest
  // retreated to the few gentle shelves left. Trees hold ground rather steeper
  // than that in reality, and the island needs the cover.
  const slopeCap = 1.35
  for (let i = 0; i < s * s; i++) {
    const hv = w.height[i]
    if (hv < w.seaLevel + 0.012 || hv > upper) continue
    if (surf.slope[i] > slopeCap * 0.02) continue
    if (w.discharge[i] > 0.22) continue
    const x = i % s
    const y = (i / s) | 0
    // denser in sheltered ground, thinner on exposed shoulders
    let p = 0.55 * (0.35 + 0.65 * surf.ao[i])
    // Per-cell probability alone is a uniform sprinkle, and once the frame is
    // pixelated an even sprinkle is just green noise over the relief. Gating on
    // a low-frequency mask gathers trees into stands with clearings between
    // them, so the erosion fans and bare faces stay readable. The gate is wide
    // now — the reference is closer to continuous forest than to groves, and
    // the clearings it does have are cut by slope, not by the mask.
    p *= clamp01((groveMask(x, y, seed) - 0.26) / 0.3)
    if (p <= 0 || rnd() > p) continue
    out.push({
      x: x + rnd() - 0.5,
      y: y + rnd() - 0.5,
      h: hv,
      scale: 0.7 + rnd() * 0.7,
    })
  }
  // `max` is a budget, not a stopping point. Breaking out of the scan the moment
  // it filled cut the forest by raster order — a spatial cut, not a thinning, so
  // the rows the scan never reached went bald while the first rows stayed dense.
  // Walking the finished list at a fixed stride thins evenly across the island.
  if (out.length <= max) return out
  const stride = out.length / max
  const kept: typeof out = []
  for (let i = 0; i < max; i++) kept.push(out[Math.floor(i * stride)])
  return kept
}
