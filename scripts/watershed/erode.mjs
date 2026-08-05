// Particle-based hydraulic erosion with meandering rivers.
//
// After Nick McDonald's SimpleHydrology / soillib work
// (nickmcd.me/2023/12/12/meandering-rivers-in-particle-based-hydraulic-erosion-simulations).
//
// Water particles descend the heightmap by gravity, exchanging sediment with the
// ground through an equilibrium mass-transfer law. The meanders come from a
// second pair of maps: discharge (how much water passes a cell) and momentum
// (which way, how hard), both exponentially averaged across timesteps. A
// particle is pushed by the accumulated stream momentum in proportion to how
// aligned it already is with the stream, which couples particles that would
// otherwise be independent — that coupling is what cuts the outer bank of a bend
// and makes rivers wander instead of running straight down the fall line.
//
// Build-time only. Pure and seeded: same seed in, same world out.

// --- seeded noise -------------------------------------------------------------

export function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)

function valueNoise(x, y, seed) {
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

export function fbm(x, y, seed, octaves = 7) {
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

// --- world --------------------------------------------------------------------

export function createWorld({
  size = 512,
  seed = 1,
  scale = 3.2,
  islandFalloff = true,
  landFraction = 0.44,
  seaLevel = 0.32,
}) {
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * scale
      const ny = (y / size) * scale
      let h = fbm(nx, ny, seed, 7)
      // a second, warped octave set breaks up the grid-aligned look
      h = h * 0.72 + fbm(nx * 2.1 + h * 1.5, ny * 2.1 - h * 1.2, seed + 555, 5) * 0.28
      // ridged noise gives mountain *chains* with valleys between them, which is
      // where meanders can form; pure fBm only makes rolling hills
      const ridge = 1 - Math.abs(fbm(nx * 0.85 + 7.1, ny * 0.85 + 3.3, seed + 4242, 5) * 2 - 1)
      // only a light gate on elevation, so ranges run across the island instead
      // of piling into one central massif
      h += ridge * ridge * 0.5 * (0.45 + 0.55 * smooth(Math.min(1, h * 1.4)))
      if (islandFalloff) {
        // Radial falloff ends the landmass in sea rather than at the border, but
        // a clean circle reads as a dinner plate — so the radius itself is
        // perturbed by low-frequency noise, giving bays, capes and peninsulas.
        const dx = (x / size) * 2 - 1
        const dy = (y / size) * 2 - 1
        // A gentle falloff turns the island into a cone, and every river then
        // runs straight down the fall line. Keeping it as a late, steep coastal
        // shelf leaves the interior governed by noise — which is where the low
        // gradients that let rivers wander actually come from.
        // Too narrow a shelf makes the whole coast one uniformly steep ring,
        // which then reads as a continuous cliff of bare rock all the way round.
        const warp = (fbm(nx * 0.55 + 31.7, ny * 0.55 - 17.3, seed + 909, 4) - 0.5) * 0.42
        const d = Math.sqrt(dx * dx + dy * dy) + warp
        h -= smooth(Math.max(0, Math.min(1, (d - 0.5) / 0.46))) * 1.55
      }
      height[y * size + x] = h
    }
  }
  // normalise to 0..1
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < height.length; i++) {
    if (height[i] < lo) lo = height[i]
    if (height[i] > hi) hi = height[i]
  }
  // A linear stretch leaves a dome of high ground; this curve pulls the mid
  // range down so most of the island is workable lowland with a few real
  // uplands, which is also what gives erosion somewhere to carry sediment to.
  for (let i = 0; i < height.length; i++) {
    const t = (height[i] - lo) / (hi - lo)
    height[i] = Math.pow(t, 1.45)
  }

  // Calibrate against the distribution rather than trusting a magic constant:
  // pick the elevation that leaves `landFraction` of the map above water and
  // rescale so it lands exactly on seaLevel. Changing the noise or the curve
  // then can't accidentally drown or flood the island.
  const sorted = Float32Array.from(height).sort()
  const shoreValue = sorted[Math.floor((1 - landFraction) * (sorted.length - 1))]
  const top = sorted[sorted.length - 1]
  for (let i = 0; i < height.length; i++) {
    const h = height[i]
    height[i] =
      h >= shoreValue
        ? seaLevel + ((h - shoreValue) / Math.max(1e-6, top - shoreValue)) * (1 - seaLevel)
        : (h / Math.max(1e-6, shoreValue)) * seaLevel
  }

  return {
    size,
    height,
    discharge: new Float32Array(size * size),
    momentumX: new Float32Array(size * size),
    momentumY: new Float32Array(size * size),
    dischargeTrack: new Float32Array(size * size),
    momentumXTrack: new Float32Array(size * size),
    momentumYTrack: new Float32Array(size * size),
  }
}

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Surface normal from finite differences — no triangulation, no directional bias. */
function normalAt(w, x, y) {
  const s = w.size
  const h = w.height
  const at = (a, b) => h[clampi(b, 0, s - 1) * s + clampi(a, 0, s - 1)]
  // scale exaggerates the gradient so gravity has something to work with
  const nx = (at(x - 1, y) - at(x + 1, y)) * 0.5
  const ny = (at(x, y - 1) - at(x, y + 1)) * 0.5
  return { x: nx, y: ny }
}

/** erf approximation — normalises unbounded discharge into 0..1 */
function erf(v) {
  const t = 1 / (1 + 0.3275911 * Math.abs(v))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-v * v)
  return v >= 0 ? y : -y
}

export const DEFAULTS = {
  // particle
  dropVolume: 1.0,
  minVolume: 0.01,
  density: 1.0,
  evapRate: 0.001,
  depositionRate: 0.12,
  entrainment: 3.0,
  /** hard ceiling on suspended load — the guard against runaway entrainment */
  maxConcentration: 0.012,
  maxSteps: 1200,
  // stream coupling — this is what makes rivers meander
  momentumTransfer: 2.0,
  dischargeScale: 0.4,
  // maps
  averaging: 0.02,
  // land
  seaLevel: 0.32,
  /** Angle of repose, as height per cell. Too tight and avalanching planes the
   *  whole island into a smooth dome — this is what cliffs live or die by. */
  repose: 0.042,
  thermalRate: 0.35,
  /** run avalanching every N timesteps rather than every one */
  thermalEvery: 5,
}

/**
 * Descend one water particle, eroding and depositing as it goes.
 * Returns the number of steps it survived.
 */
function descend(w, px, py, P) {
  const s = w.size
  let x = px
  let y = py
  let vx = 0
  let vy = 0
  let volume = P.dropVolume
  let sediment = 0
  let steps = 0

  while (volume > P.minVolume && steps++ < P.maxSteps) {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 1 || iy < 1 || ix >= s - 1 || iy >= s - 1) break
    const i = iy * s + ix

    // stop once the particle reaches standing water
    if (w.height[i] < P.seaLevel) break

    const n = normalAt(w, ix, iy)

    // effective parameters weaken where a river already runs — established
    // channels transport rather than dig
    const d = erf(P.dischargeScale * w.discharge[i])
    const effD = P.depositionRate * Math.max(0, 1 - d)
    const effR = P.evapRate * (1 - 0.5 * d)

    // gravity
    vx += n.x / (volume * P.density)
    vy += n.y / (volume * P.density)

    // stream momentum: push proportional to alignment with the existing flow
    const mx = w.momentumX[i]
    const my = w.momentumY[i]
    const ml = Math.hypot(mx, my)
    const vl = Math.hypot(vx, vy)
    if (ml > 0 && vl > 0) {
      const align = (mx * vx + my * vy) / (ml * vl)
      const k = (P.momentumTransfer * align) / (volume + w.discharge[i])
      vx += k * mx
      vy += k * my
    }

    // normalise the step so a particle always lands in a neighbouring cell
    const sp = Math.hypot(vx, vy)
    if (sp === 0) break
    vx = (vx / sp) * Math.SQRT2
    vy = (vy / sp) * Math.SQRT2

    // lay down this particle's contribution before moving
    w.dischargeTrack[i] += volume
    w.momentumXTrack[i] += volume * vx
    w.momentumYTrack[i] += volume * vy

    const nxp = x + vx
    const nyp = y + vy
    const jx = Math.floor(nxp)
    const jy = Math.floor(nyp)
    if (jx < 1 || jy < 1 || jx >= s - 1 || jy >= s - 1) break
    const j = jy * s + jx

    // Equilibrium concentration from the drop the particle just took. Bounded
    // on purpose: unbounded entrainment is a positive feedback loop — deposit
    // raises the ground, the next drop is larger, which entrains more still —
    // and it ends with spikes and a silted-up sea.
    const drop = w.height[i] - w.height[j]
    let cEq = drop > 0 ? drop * P.entrainment : 0
    if (cEq > P.maxConcentration) cEq = P.maxConcentration
    const cDiff = cEq - sediment

    sediment += effD * cDiff
    w.height[i] -= effD * cDiff

    // evaporate
    sediment /= 1 - effR
    volume *= 1 - effR

    x = nxp
    y = nyp
  }

  // Whatever the particle still carries is laid down where it stops — silently
  // discarding it drains mass from the world on every drop and planes the island
  // flat over a long run. Sediment that makes it to open water is genuinely lost
  // to the sea floor, which is both physical and what stops the sea silting up.
  const fx = clampi(Math.floor(x), 1, s - 2)
  const fy = clampi(Math.floor(y), 1, s - 2)
  const fi = fy * s + fx
  if (sediment > 0 && w.height[fi] >= P.seaLevel) {
    w.height[fi] += Math.min(sediment, P.maxConcentration)
  }

  return steps
}

/** Avalanching: material above the angle of repose slides to lower neighbours. */
function thermal(w, P, iterations = 1) {
  const s = w.size
  const h = w.height
  const delta = new Float32Array(s * s)
  for (let it = 0; it < iterations; it++) {
    delta.fill(0)
    for (let y = 1; y < s - 1; y++) {
      for (let x = 1; x < s - 1; x++) {
        const i = y * s + x
        if (h[i] < P.seaLevel) continue
        let lowest = -1
        let maxDiff = P.repose
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const j = (y + dy) * s + (x + dx)
            const diff = h[i] - h[j]
            if (diff > maxDiff) {
              maxDiff = diff
              lowest = j
            }
          }
        }
        if (lowest >= 0) {
          const move = (maxDiff - P.repose) * P.thermalRate
          delta[i] -= move
          delta[lowest] += move
        }
      }
    }
    for (let i = 0; i < s * s; i++) h[i] += delta[i]
  }
}

/**
 * Run the simulation. Each timestep rains a batch of particles, then folds the
 * per-step tracks into the exponentially averaged discharge and momentum maps —
 * the averaging is what gives rivers memory across steps.
 */
export function erode(w, { steps = 2000, dropsPerStep = 220, seed = 7, params = {}, onStep } = {}) {
  const P = { ...DEFAULTS, ...params }
  const rng = mulberry32(seed)
  const s = w.size
  const n = s * s
  let totalSteps = 0

  for (let t = 0; t < steps; t++) {
    w.dischargeTrack.fill(0)
    w.momentumXTrack.fill(0)
    w.momentumYTrack.fill(0)

    for (let k = 0; k < dropsPerStep; k++) {
      const px = 1 + rng() * (s - 2)
      const py = 1 + rng() * (s - 2)
      if (w.height[Math.floor(py) * s + Math.floor(px)] < P.seaLevel) continue
      totalSteps += descend(w, px, py, P)
    }

    const a = P.averaging
    for (let i = 0; i < n; i++) {
      w.discharge[i] = (1 - a) * w.discharge[i] + a * w.dischargeTrack[i]
      w.momentumX[i] = (1 - a) * w.momentumX[i] + a * w.momentumXTrack[i]
      w.momentumY[i] = (1 - a) * w.momentumY[i] + a * w.momentumYTrack[i]
    }

    if (t % P.thermalEvery === 0) thermal(w, P, 1)
    if (onStep && t % 100 === 0) onStep(t, steps, totalSteps)
  }
  return { totalSteps }
}

// --- derived fields -----------------------------------------------------------

/**
 * Priority-flood depression fill (Barnes et al.). Raises every pit to the level
 * of its lowest spill point, so water routed over the filled surface always
 * finds the sea. Without this, drainage dead-ends in the countless small pits
 * that noise and erosion leave behind, and the basins mean nothing.
 *
 * Returns a *copy* — the visible terrain keeps its pits (they read as ponds);
 * only routing uses the filled surface. `epsilon` gives filled flats a faint
 * gradient so flow still has a direction across them.
 */
export function fillDepressions(w, seaLevel, epsilon = 1e-5) {
  const s = w.size
  const n = s * s
  const filled = Float32Array.from(w.height)
  const closed = new Uint8Array(n)
  // binary heap of [height, index]
  const hv = new Float64Array(n + 1)
  const hi32 = new Int32Array(n + 1)
  let len = 0
  const push = (v, i) => {
    let k = ++len
    hv[k] = v
    hi32[k] = i
    while (k > 1) {
      const p = k >> 1
      if (hv[p] <= hv[k]) break
      ;[hv[p], hv[k]] = [hv[k], hv[p]]
      ;[hi32[p], hi32[k]] = [hi32[k], hi32[p]]
      k = p
    }
  }
  const pop = () => {
    const topV = hv[1]
    const topI = hi32[1]
    hv[1] = hv[len]
    hi32[1] = hi32[len]
    len--
    let k = 1
    for (;;) {
      const l = k << 1
      if (l > len) break
      const r = l + 1
      const m = r <= len && hv[r] < hv[l] ? r : l
      if (hv[k] <= hv[m]) break
      ;[hv[m], hv[k]] = [hv[k], hv[m]]
      ;[hi32[m], hi32[k]] = [hi32[k], hi32[m]]
      k = m
    }
    return [topV, topI]
  }

  // seed with everything at or below sea level, plus the border
  for (let i = 0; i < n; i++) {
    const x = i % s
    const y = (i / s) | 0
    if (filled[i] < seaLevel || x === 0 || y === 0 || x === s - 1 || y === s - 1) {
      closed[i] = 1
      push(filled[i], i)
    }
  }

  while (len > 0) {
    const [v, i] = pop()
    const x = i % s
    const y = (i / s) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
        const j = ny * s + nx
        if (closed[j]) continue
        closed[j] = 1
        if (filled[j] <= v) filled[j] = v + epsilon
        push(filled[j], j)
      }
    }
  }
  return filled
}

/**
 * Downhill neighbour index per land cell, or -1. Routes over the depression-
 * filled surface so every cell has somewhere to send its water.
 */
export function flowField(w, seaLevel, surface) {
  const s = w.size
  const h = surface ?? fillDepressions(w, seaLevel)
  const down = new Int32Array(s * s).fill(-1)
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      const i = y * s + x
      if (w.height[i] < seaLevel) continue
      let best = -1
      let bestH = h[i]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const j = (y + dy) * s + (x + dx)
          if (h[j] < bestH) {
            bestH = h[j]
            best = j
          }
        }
      }
      down[i] = best
    }
  }
  return down
}

/**
 * Drainage basins: follow every land cell downhill until it reaches the sea (or
 * a sink) and label it by the outlet it arrives at. These are the watersheds the
 * theme uses as provinces — boundaries the terrain itself decides.
 */
export function basins(w, seaLevel, minCells = 400, surface) {
  const s = w.size
  const n = s * s
  const down = flowField(w, seaLevel, surface)
  const label = new Int32Array(n).fill(-1)
  const outletOf = new Map()
  const path = []

  for (let i = 0; i < n; i++) {
    if (w.height[i] < seaLevel || label[i] !== -1) continue
    path.length = 0
    let cur = i
    let guard = 0
    while (cur >= 0 && label[cur] === -1 && guard++ < n) {
      path.push(cur)
      const nxt = down[cur]
      if (nxt < 0) break
      if (w.height[nxt] < seaLevel) {
        // reached the coast: this outlet names the basin
        cur = -2 - nxt
        break
      }
      cur = nxt
    }
    let id
    if (cur <= -2) {
      const outlet = -2 - cur
      if (!outletOf.has(outlet)) outletOf.set(outlet, outletOf.size)
      id = outletOf.get(outlet)
    } else if (cur >= 0 && label[cur] !== -1) {
      id = label[cur]
    } else {
      const sink = path[path.length - 1]
      if (!outletOf.has(sink)) outletOf.set(sink, outletOf.size)
      id = outletOf.get(sink)
    }
    for (const p of path) label[p] = id
  }

  // count and keep only basins worth naming
  const counts = new Map()
  for (let i = 0; i < n; i++) if (label[i] >= 0) counts.set(label[i], (counts.get(label[i]) ?? 0) + 1)
  const big = [...counts.entries()].filter(([, c]) => c >= minCells).sort((a, b) => b[1] - a[1])
  const remap = new Map(big.map(([id], k) => [id, k]))
  for (let i = 0; i < n; i++) label[i] = label[i] >= 0 ? (remap.get(label[i]) ?? -1) : -1

  return { label, count: big.length, sizes: big.map(([, c]) => c) }
}
