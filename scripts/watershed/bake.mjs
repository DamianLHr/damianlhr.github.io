// Bake the watershed world at build time.
//
//   node scripts/watershed/bake.mjs [--size 512] [--steps 2000] [--seed 7] [--preview-only]
//
// Emits data maps the theme loads, plus two preview renders (top-down relief and
// a 2.5D oblique) that exist so the terrain can be judged as an image before any
// renderer is written.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createWorld,
  erode,
  wind,
  lakes,
  pruneIslands,
  topMaterial,
  basins,
  flowField,
  fillDepressions,
  DEFAULTS,
} from './erode.mjs'
import { roadNetwork } from './roads.mjs'
import { writePNG, packTerrain } from './png.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const flag = (name) => process.argv.includes(`--${name}`)

const SIZE = +arg('size', 512)
const STEPS = +arg('steps', 2000)
const SEED = +arg('seed', 7)
const DROPS = +arg('drops', 220)
const OUT = arg('out', join(ROOT, 'public', 'watershed'))
const PREVIEW = arg('preview', join(ROOT, 'design', 'watershed'))
const SEA = +arg('sea', DEFAULTS.seaLevel)

// --- palette (naturalistic) ---------------------------------------------------

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const C = {
  deep: [24, 52, 84],
  shallow: [58, 104, 138],
  sand: [196, 178, 132],
  grass: [96, 122, 62],
  grassDry: [130, 138, 74],
  dirt: [122, 96, 66],
  rock: [122, 118, 112],
  rockHi: [156, 152, 146],
  scree: [146, 138, 126],
  silt: [124, 118, 88],
  snow: [236, 238, 240],
  river: [64, 108, 146],
}

/**
 * Ground colour from elevation, steepness and wetness.
 *
 * The elevation bands are percentiles of the actual land, not fixed constants:
 * erosion changes the hypsometry every run, and hard-coded thresholds put the
 * whole island in one colour band. `band` maps a height to 0..1 through the
 * measured distribution, so there is always a proper spread of shore, meadow,
 * upland and summit. Steepness and wetness then override altitude, which is
 * what makes cliffs grey at any height and valley floors green.
 */
function makeGroundColor(bands, slopeRef, world) {
  const band = (h) => {
    if (h <= bands[0]) return 0
    for (let k = 1; k < bands.length; k++) {
      if (h <= bands[k])
        return (k - 1 + (h - bands[k - 1]) / (bands[k] - bands[k - 1] || 1)) / (bands.length - 1)
    }
    return 1
  }
  return (h, slope, wet, i) => {
    if (h < SEA) {
      const t = Math.max(0, Math.min(1, (SEA - h) / 0.1))
      return mix(C.shallow, C.deep, t)
    }
    // standing water on the land reads as a lake, not as ground
    if (world && i !== undefined && world.lake && world.lake[i] > 0) {
      const t = Math.max(0, Math.min(1, world.lake[i] / 0.03))
      return mix(C.shallow, C.deep, t * 0.8)
    }
    const e = band(h)
    let c
    if (e < 0.06) c = C.sand
    else if (e < 0.34) c = mix(C.grass, C.grassDry, (e - 0.06) / 0.28)
    else if (e < 0.62) c = mix(C.grassDry, C.dirt, (e - 0.34) / 0.28)
    else c = mix(C.dirt, C.rock, Math.min(1, (e - 0.62) / 0.28))

    // cliffs: steep ground shows bare rock whatever the altitude
    const cliff = Math.max(0, Math.min(1, (slope / slopeRef - 1.15) / 1.6))
    c = mix(c, C.rockHi, cliff)
    // read the ground as the grade actually lying on it
    if (world && i !== undefined) {
      const grade = topMaterial(world, i)
      if (grade === 'rock') c = mix(c, C.rock, 0.5)
      else if (grade === 'gravel') c = mix(c, C.scree, 0.42)
      else if (grade === 'sand') c = mix(c, C.sand, 0.3)
      else c = mix(c, C.silt, 0.3)
    }
    // snow only high *and* gentle
    const snow = Math.max(0, Math.min(1, (e - 0.84) / 0.16)) * (1 - cliff * 0.85)
    c = mix(c, C.snow, snow)
    if (wet > 0.3) c = mix(c, C.river, Math.min(1, (wet - 0.3) / 0.35))
    return c
  }
}

/** Elevation percentiles of land, plus a reference slope, for adaptive colour. */
function hypsometry(w) {
  const land = []
  for (let i = 0; i < w.size * w.size; i++) if (w.height[i] >= SEA) land.push(w.height[i])
  land.sort((a, b) => a - b)
  const q = (p) => land[Math.min(land.length - 1, Math.floor(p * land.length))] ?? SEA
  return [SEA, q(0.25), q(0.5), q(0.7), q(0.85), q(0.94), q(0.99), land[land.length - 1] ?? 1]
}

function analyse(w) {
  const s = w.size
  const h = w.height
  const at = (x, y) => h[Math.max(0, Math.min(s - 1, y)) * s + Math.max(0, Math.min(s - 1, x))]
  const slope = new Float32Array(s * s)
  const nrm = new Float32Array(s * s * 3)
  let maxD = 0
  for (let i = 0; i < s * s; i++) if (w.discharge[i] > maxD) maxD = w.discharge[i]
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5
      const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5
      slope[i] = Math.hypot(gx, gy)
      // normal of the surface z = h(x,y), with z scaled for a readable relief
      const zs = 0.9
      const nx = -gx / zs
      const ny = -gy / zs
      const nz = 1
      const l = Math.hypot(nx, ny, nz)
      nrm[i * 3] = nx / l
      nrm[i * 3 + 1] = ny / l
      nrm[i * 3 + 2] = nz / l
    }
  }
  const ls = []
  for (let i = 0; i < s * s; i++) if (h[i] >= SEA) ls.push(slope[i])
  ls.sort((a, b) => a - b)
  const slopeRef = ls[Math.floor(ls.length * 0.6)] || 0.01
  return { slope, nrm, maxD, slopeRef }
}

/**
 * Where towns go. Real settlements sit on gentle, low ground beside fresh water
 * and within reach of the coast — and the simulation already knows all three,
 * so the sites come out of the terrain rather than being sprinkled on top.
 * Returns normalised 0..1 coordinates with the basin each site belongs to.
 */
function townSites(w, a, bas, count, lakeDepth) {
  const s = w.size
  const cand = []
  for (let y = 2; y < s - 2; y += 2) {
    for (let x = 2; x < s - 2; x += 2) {
      const i = y * s + x
      if (w.height[i] < SEA) continue
      // a lake bed is above sea level but still under water
      if (lakeDepth && lakeDepth[i] > 0) continue
      // distance to water, in cells, capped. A lake shore counts as fresh water
      // just as a river does — those are the places worth settling.
      let nearWater = 99
      for (let dy = -6; dy <= 6 && nearWater > 1; dy += 2) {
        for (let dx = -6; dx <= 6; dx += 2) {
          const j = (y + dy) * s + (x + dx)
          if (j < 0 || j >= s * s) continue
          if (
            w.height[j] < SEA ||
            w.discharge[j] > a.maxD * 0.06 ||
            (lakeDepth && lakeDepth[j] > 0)
          ) {
            nearWater = Math.min(nearWater, Math.hypot(dx, dy))
          }
        }
      }
      if (nearWater > 7) continue
      // separately: how far to *open sea*, which is what makes a harbour
      let coast = 99
      for (let dy = -10; dy <= 10 && coast > 1; dy += 2) {
        for (let dx = -10; dx <= 10; dx += 2) {
          const nx2 = x + dx
          const ny2 = y + dy
          if (nx2 < 0 || ny2 < 0 || nx2 >= s || ny2 >= s) continue
          if (w.height[ny2 * s + nx2] < SEA) coast = Math.min(coast, Math.hypot(dx, dy))
        }
      }
      const elev = (w.height[i] - SEA) / Math.max(1e-6, 1 - SEA)
      const score =
        1 / (1 + (a.slope[i] / Math.max(1e-6, a.slopeRef)) * 2.2) + // gentle ground
        1 / (1 + Math.abs(nearWater - 2.5) * 0.5) + // beside water, not in it
        (1 - Math.min(1, elev * 2.4)) * 0.8 // lowland
      cand.push({ x, y, i, score, coast: Math.round(Math.min(99, coast)) })
    }
  }
  cand.sort((p, q) => q.score - p.score)
  const kept = []
  const sep = Math.round(s * 0.09)
  for (const c of cand) {
    if (kept.length >= count) break
    if (kept.every((k) => Math.hypot(k.x - c.x, k.y - c.y) > sep)) kept.push(c)
  }
  // The score already says how good a site is — gentle ground, fresh water, low
  // and near the coast. Shipping it lets a theme build a town the size the land
  // deserves instead of dropping the same dot on every one.
  const best = kept.length ? kept[0].score : 1
  const worst = kept.length ? kept[kept.length - 1].score : 0
  return kept.map((k) => ({
    x: +(k.x / s).toFixed(4),
    y: +(k.y / s).toFixed(4),
    h: +w.height[k.i].toFixed(4),
    basin: bas.label[k.i],
    /** 0..1 across the sites this run kept */
    score: +((k.score - worst) / Math.max(1e-6, best - worst)).toFixed(3),
    /** cells to open water, capped — a low number means a harbour is possible */
    coast: k.coast,
  }))
}

/** Sun-lit shaded relief, top-down. */
function renderTop(w, a, gc) {
  const s = w.size
  const px = new Uint8Array(s * s * 3)
  const L = (() => {
    const v = [-0.55, -0.62, 0.56]
    const l = Math.hypot(...v)
    return v.map((c) => c / l)
  })()
  for (let i = 0; i < s * s; i++) {
    const h = w.height[i]
    const wet = a.maxD > 0 ? Math.min(1, w.discharge[i] / (a.maxD * 0.12)) : 0
    let c = gc(h, a.slope[i], wet, i)
    if (h >= SEA) {
      const lam = Math.max(
        0,
        a.nrm[i * 3] * L[0] + a.nrm[i * 3 + 1] * L[1] + a.nrm[i * 3 + 2] * L[2],
      )
      const shade = 0.45 + 0.75 * lam
      c = [c[0] * shade, c[1] * shade, c[2] * shade]
    }
    px[i * 3] = Math.max(0, Math.min(255, c[0]))
    px[i * 3 + 1] = Math.max(0, Math.min(255, c[1]))
    px[i * 3 + 2] = Math.max(0, Math.min(255, c[2]))
  }
  return px
}

/**
 * 2.5D oblique preview: columns drawn back-to-front, the classic voxel-terrain
 * projection. Not the real renderer — just enough to judge whether the land has
 * cliffs, valleys and meanders before committing to a three.js build.
 */
function renderOblique(w, a, gc, { width = 1200, height = 760, zScale = 300, tilt = 0.52 } = {}) {
  const s = w.size
  const px = new Uint8Array(width * height * 3)
  // sky
  for (let y = 0; y < height; y++) {
    const t = y / height
    const c = mix([196, 210, 226], [232, 232, 224], t)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
    }
  }
  const L = (() => {
    const v = [-0.55, -0.62, 0.56]
    const l = Math.hypot(...v)
    return v.map((c) => c / l)
  })()
  const sx = width / s
  const sy = (height * tilt) / s
  const originY = height * 0.3

  // Sea backdrop below the horizon. Without it, tall land columns near the front
  // draw down past where the foreground sea rows begin, leaving vertical smears
  // hanging under the island.
  const horizon = Math.round(originY - SEA * zScale)
  for (let y = Math.max(0, horizon); y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      px[i] = C.deep[0]
      px[i + 1] = C.deep[1]
      px[i + 2] = C.deep[2]
    }
  }
  const rng = (n) => (((Math.sin(n * 12.9898) * 43758.5453) % 1) + 1) % 1

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x
      const h = w.height[i]
      const wet = a.maxD > 0 ? Math.min(1, w.discharge[i] / (a.maxD * 0.12)) : 0
      let c = gc(h, a.slope[i], wet, i)
      if (h >= SEA) {
        const lam = Math.max(
          0,
          a.nrm[i * 3] * L[0] + a.nrm[i * 3 + 1] * L[1] + a.nrm[i * 3 + 2] * L[2],
        )
        const shade = 0.4 + 0.8 * lam
        c = [c[0] * shade, c[1] * shade, c[2] * shade]
      }
      const screenX = Math.round(x * sx)
      const top = Math.round(originY + y * sy - Math.max(h, SEA) * zScale)
      const colW = Math.max(1, Math.ceil(sx))
      for (let dx = 0; dx < colW; dx++) {
        const px0 = screenX + dx
        if (px0 < 0 || px0 >= width) continue
        // Draw each column all the way to the bottom of the frame. Back-to-front
        // order means nearer rows paint over it, so this both hides what is
        // behind and stops gaps opening between rows where the ground drops.
        for (let yy = Math.max(0, top); yy < Math.min(height, top + 90); yy++) {
          const o = (yy * width + px0) * 3
          // the exposed earth below the surface darkens with depth
          const depth = Math.min(1, (yy - top) / 26)
          const f = yy > top + 1 ? 0.78 - depth * 0.22 : 1
          px[o] = Math.max(0, Math.min(255, c[0] * f))
          px[o + 1] = Math.max(0, Math.min(255, c[1] * f))
          px[o + 2] = Math.max(0, Math.min(255, c[2] * f))
        }
      }

      // trees: gentle, low-to-mid ground with some moisture nearby
      const treeOK = h >= SEA + 0.015 && a.slope[i] < 0.03 && wet < 0.3 && rng(i * 1.7 + 3) < 0.055
      if (treeOK) {
        const tx = screenX + Math.floor(rng(i * 3.1) * colW)
        const ty = top
        const th = 5 + Math.floor(rng(i * 5.3) * 5)
        const dark = [38 + rng(i) * 18, 66 + rng(i * 2) * 26, 34 + rng(i * 3) * 16]
        for (let k = 0; k < th; k++) {
          const yy = ty - k
          const rad = Math.max(0, Math.round((1 - k / th) * 2.2))
          for (let dx = -rad; dx <= rad; dx++) {
            const xx = tx + dx
            if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue
            const o = (yy * width + xx) * 3
            px[o] = dark[0]
            px[o + 1] = dark[1]
            px[o + 2] = dark[2]
          }
        }
      }
    }
  }
  return { px, width, height }
}

// --- run ----------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })
mkdirSync(PREVIEW, { recursive: true })

const t0 = Date.now()
console.log(`watershed: ${SIZE}x${SIZE}, ${STEPS} steps x ${DROPS} drops, seed ${SEED}`)
const world = createWorld({
  size: SIZE,
  seed: SEED,
  seaLevel: SEA,
  landFraction: +arg('land', 0.44),
})

// Clear the offshore specks before spending any particles on them, so the
// simulation's whole budget goes into the island the site is about.
const prunedBefore = pruneIslands(world, SEA)

const { totalSteps } = erode(world, {
  steps: STEPS,
  dropsPerStep: DROPS,
  seed: SEED + 1,
  params: { seaLevel: SEA },
  onStep: (t, n) => process.stdout.write(`\r  eroding ${((t / n) * 100).toFixed(0)}%   `),
})
process.stdout.write('\r')

// Wind comes after the water: it works on what the rivers exposed, stripping
// the loose cover off ground that stands into the prevailing wind and banking it
// in the lee.
const blown = wind(world, {
  particles: Math.round(SIZE * 18),
  seed: SEED + 2,
  params: { seaLevel: SEA },
})

// Erosion calves off new specks of its own — cut them too.
const prunedAfter = pruneIslands(world, SEA)
const simMs = Date.now() - t0

const a = analyse(world)
const routed = fillDepressions(world, SEA)
const lake = lakes(world, SEA, 0.002, routed)
const bas = basins(world, SEA, Math.round(SIZE * SIZE * 0.004), routed)
const down = flowField(world, SEA, routed)

// stats worth asserting on
let landCells = 0
let riverCells = 0
let maxH = 0
for (let i = 0; i < SIZE * SIZE; i++) {
  if (world.height[i] >= SEA) landCells++
  if (world.discharge[i] > a.maxD * 0.12) riverCells++
  if (world.height[i] > maxH) maxH = world.height[i]
}
let reachSea = 0
for (let i = 0; i < SIZE * SIZE; i++) {
  if (world.height[i] < SEA) continue
  let cur = i
  let guard = 0
  while (cur >= 0 && world.height[cur] >= SEA && guard++ < 4000) cur = down[cur]
  if (cur >= 0 && world.height[cur] < SEA) reachSea++
}

const grades = { rock: 0, gravel: 0, sand: 0, silt: 0 }
let maxGrain = 0
let maxLake = 0
for (let i = 0; i < SIZE * SIZE; i++) {
  if (world.height[i] >= SEA) {
    grades[topMaterial(world, i)]++
    maxGrain = Math.max(maxGrain, world.gravel[i], world.sand[i], world.silt[i])
  }
  if (lake.depth[i] > maxLake) maxLake = lake.depth[i]
}
const pct = (n) => `${((n / landCells) * 100).toFixed(0)}%`

console.log(
  [
    `  sim ${(simMs / 1000).toFixed(1)}s · ${(totalSteps / 1e6).toFixed(1)}M particle-steps`,
    `  land ${((landCells / (SIZE * SIZE)) * 100).toFixed(1)}% · rivers ${((riverCells / landCells) * 100).toFixed(1)}% of land`,
    `  drains to sea ${((reachSea / landCells) * 100).toFixed(1)}% · basins ${bas.count}`,
    `  max height ${maxH.toFixed(3)} · max discharge ${a.maxD.toFixed(1)}`,
    `  islands ${prunedBefore.components}→${prunedBefore.kept} before, ${prunedAfter.components}→${prunedAfter.kept} after (${prunedBefore.sunk + prunedAfter.sunk} cells sunk)`,
    `  surface: rock ${pct(grades.rock)} · gravel ${pct(grades.gravel)} · sand ${pct(grades.sand)} · silt ${pct(grades.silt)} · wind moved ${blown.moved.toFixed(2)}`,
    `  lakes ${lake.cells} cells (${((lake.cells / landCells) * 100).toFixed(1)}% of land) · deepest ${maxLake.toFixed(3)}`,
  ].join('\n'),
)

if (!flag('preview-only')) {
  // terrain.png: height (16-bit across R,G) + discharge (B). Slope and normals
  // are derived in the shader from height rather than shipped.
  const wet = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < SIZE * SIZE; i++) wet[i] = Math.min(1, world.discharge[i] / (a.maxD * 0.25))
  writePNG(join(OUT, 'terrain.png'), SIZE, SIZE, packTerrain(world.height, wet, SIZE, SIZE), 3)

  // basins as a single greyscale channel — flat regions, so it compresses hard
  const basin = new Uint8Array(SIZE * SIZE)
  for (let i = 0; i < SIZE * SIZE; i++)
    basin[i] = bas.label[i] < 0 ? 0 : Math.min(255, bas.label[i] + 1)
  writePNG(join(OUT, 'basin.png'), SIZE, SIZE, basin, 1)

  // surface.png: what the ground is made of, and where water stands on it.
  //   R,G,B — thickness of gravel / sand / silt (bedrock shows where all are 0)
  //   A     — lake depth
  // Normalised against the run's own maxima, which travel in world.json so the
  // theme decodes exactly what was baked.
  const grainScale = Math.max(1e-6, maxGrain)
  const lakeScale = Math.max(1e-6, maxLake)
  const surface = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    surface[i * 4] = Math.round(Math.min(1, world.gravel[i] / grainScale) * 255)
    surface[i * 4 + 1] = Math.round(Math.min(1, world.sand[i] / grainScale) * 255)
    surface[i * 4 + 2] = Math.round(Math.min(1, world.silt[i] / grainScale) * 255)
    surface[i * 4 + 3] = Math.round(Math.min(1, lake.depth[i] / lakeScale) * 255)
  }
  writePNG(join(OUT, 'surface.png'), SIZE, SIZE, surface, 4)

  // town sites and basin metadata the theme places content on
  const sites = townSites(world, a, bas, 26, lake.depth)
  // Roads are worn between the towns the same way everything else here is
  // decided — by walking the terrain, not by drawing on it.
  const gridSites = sites.map((p) => ({ x: p.x * SIZE, y: p.y * SIZE }))
  const net = roadNetwork(world, gridSites, { seaLevel: SEA, lake: lake.depth })
  console.log(
    `  roads ${net.roads.length} between ${sites.length} towns` +
      (net.unreachable ? ` · ${net.unreachable} unreachable` : ''),
  )

  const meta = {
    size: SIZE,
    seaLevel: SEA,
    maxDischarge: a.maxD,
    basins: bas.count,
    grainScale: +grainScale.toFixed(6),
    lakeScale: +lakeScale.toFixed(6),
    sites,
    roads: net.roads,
  }
  writeFileSync(join(OUT, 'world.json'), JSON.stringify(meta))
  console.log(`  wrote terrain.png + basin.png + world.json to ${OUT}`)
}

world.lake = lake.depth
const gc = makeGroundColor(hypsometry(world), a.slopeRef, world)
writePNG(join(PREVIEW, 'preview-top.png'), SIZE, SIZE, renderTop(world, a, gc), 3)
const ob = renderOblique(world, a, gc)
writePNG(join(PREVIEW, 'preview-oblique.png'), ob.width, ob.height, ob.px, 3)
console.log(`  wrote previews to ${PREVIEW}`)
