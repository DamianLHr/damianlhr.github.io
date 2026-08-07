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

      // Domain warping: sample the noise at coordinates that are themselves
      // displaced by noise. Plain fBm gives isotropic lumps; warping bends them
      // into ridges, hooks and basins that read as real landform rather than
      // as a heightfield.
      const wx = nx + (fbm(nx * 0.45 + 11.2, ny * 0.45 - 3.4, seed + 111, 4) - 0.5) * 2.4
      const wy = ny + (fbm(nx * 0.45 - 7.8, ny * 0.45 + 19.6, seed + 222, 4) - 0.5) * 2.4
      let h = fbm(wx, wy, seed, 7)
      h = h * 0.72 + fbm(wx * 2.1 + h * 1.5, wy * 2.1 - h * 1.2, seed + 555, 5) * 0.28
      // ridged noise gives mountain *chains* with valleys between them
      // Gating ridges on existing elevation piles every range into one central
      // massif, which then drains radially. Applying them evenly puts mountain
      // chains wherever the warped noise runs, so the island has several
      // separate uplands and the divides between them are real.
      const ridge = 1 - Math.abs(fbm(wx * 0.9 + 7.1, wy * 0.9 + 3.3, seed + 4242, 5) * 2 - 1)
      h += ridge * ridge * 0.46

      if (islandFalloff) {
        // *Subtracting* a radial falloff flattens the coast into a smooth ring
        // and makes a dinner plate, however much the radius is perturbed.
        // Multiplying by a mask that is itself noisy keeps full detail right up
        // to the waterline, so the sea eats in wherever the mask dips — which is
        // what gives bays, peninsulas and offshore islets instead of a circle.
        const ax = ((x / size) * 2 - 1) * 1.14
        const ay = ((y / size) * 2 - 1) * 0.88
        const d = Math.sqrt(ax * ax + ay * ay)
        // A radial term that only ruffles the rim still yields an oval. Instead
        // a *low-frequency* continent field decides land from sea across the
        // whole map — at this frequency it spans only two or three lobes, so
        // whole regions can drop below the waterline and open gulfs, straits and
        // peninsulas. The radial term is now just a gentle bias keeping the
        // landmass off the border.
        const radial = 1 - smooth(Math.max(0, Math.min(1, (d - 0.18) / 0.86)))
        const continent = fbm(nx * 0.62 + 51.3, ny * 0.62 - 29.7, seed + 321, 5)
        const detail = fbm(nx * 2.4 + 8.9, ny * 2.4 - 4.1, seed + 654, 4)
        const landness = continent * 0.9 + detail * 0.18 + radial * 0.26
        const inland = smooth(Math.max(0, Math.min(1, (landness - 0.5) / 0.34)))
        // Multiplying elevation by this mask is what made every previous island a
        // dome: height becomes proportional to distance from the coast, which is
        // a cone, and a cone drains in straight radial spokes no matter what
        // noise is layered on top. Adding the mask as a *bias* instead keeps the
        // noise at full amplitude inland, so the interior has its own basins and
        // divides and the rivers follow those instead of the fall line.
        h = h * 0.92 + (inland - 0.46) * 0.95
      }

      // Guarantee open water around the frame. Land touching the border has
      // nowhere to drain — flow arrives at the edge and stops, stranding every
      // cell upstream of it — and a coastline sliced off by the map edge looks
      // wrong from any angle.
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / size
      h -= smooth(Math.max(0, Math.min(1, (0.05 - edge) / 0.05))) * 1.3

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
  // Split the elevation range in two rather than curving it smoothly.
  //
  // A single power curve gives a hill that is gentler at the bottom, but its
  // gradient never actually approaches zero, and a river needs somewhere very
  // nearly level to wander across — measured, the old lowland still fell at
  // 0.021 per cell, which is quite steep enough to hold every channel on its
  // fall line. So the lower `plainSplit` of the range is compressed into
  // `plainHeight` of the final height: a real coastal plain, with the uplands
  // expanded into everything above it so the island keeps its mountains.
  const PLAIN_SPLIT = 0.52
  const PLAIN_HEIGHT = 0.17
  for (let i = 0; i < height.length; i++) {
    const t = (height[i] - lo) / (hi - lo)
    height[i] =
      t < PLAIN_SPLIT
        ? Math.pow(t / PLAIN_SPLIT, 1.25) * PLAIN_HEIGHT
        : PLAIN_HEIGHT + Math.pow((t - PLAIN_SPLIT) / (1 - PLAIN_SPLIT), 1.35) * (1 - PLAIN_HEIGHT)
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

  // A mantle of loose material over bedrock, sorted by grain size (SoilMachine's
  // layered soil, cut down to the three grades that change what the ground
  // looks like and how it stands). Water takes them fine-first, each holds a
  // different angle, and each is dropped by a different strength of flow — so
  // gravel lines the fast channels, sand banks the shores and silt spreads flat
  // across the slack lowland. That silt is what a meander needs: a floodplain
  // loose and level enough for a river to wander across.
  const gravel = new Float32Array(size * size)
  const sand = new Float32Array(size * size)
  const silt = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * scale
      const ny = (y / size) * scale
      const i = y * size + x
      const weathered = 0.006 + 0.02 * fbm(nx * 1.7 + 91.4, ny * 1.7 - 63.2, seed + 777, 4)
      // never more loose material than there is ground to stand on — the deep
      // sea floor sits below the mantle's own thickness
      const room = Math.max(0, height[i])
      gravel[i] = Math.min(room * 0.4, weathered * 0.45)
      sand[i] = Math.min(room * 0.3, weathered * 0.35)
      silt[i] = Math.min(room * 0.3, weathered * 0.2)
    }
  }

  return {
    size,
    height,
    /** repose per grade, in height-per-cell for *this* grid size */
    repose: reposeTable(size),
    gravel,
    sand,
    silt,
    discharge: new Float32Array(size * size),
    momentumX: new Float32Array(size * size),
    momentumY: new Float32Array(size * size),
    dischargeTrack: new Float32Array(size * size),
    momentumXTrack: new Float32Array(size * size),
    momentumYTrack: new Float32Array(size * size),
  }
}

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * The grades of loose material, coarsest first, over bedrock.
 *
 * `repose` is SoilMachine's `maxdiff` — the steepest height difference a grade
 * will hold before it slides. The spread across the table is the whole point:
 * bedrock stands as cliff, gravel piles into scree, silt lies almost dead flat.
 * `drop` is the flow speed below which the grade settles out, which is what
 * sorts the bed — coarse where the water is quick, fine where it slackens.
 */
export const MATERIALS = {
  gravel: { angle: 36, drop: 0.5, erodibility: 0.55 },
  sand: { angle: 32, drop: 0.17, erodibility: 0.85 },
  silt: { angle: 20, drop: 0.0, erodibility: 1.0 },
  // 52°, not the 65° of a fresh quarry face: this is worn upland, and measured,
  // the steeper figure left channels twice as deeply cut.
  rock: { angle: 62, erodibility: 0.28 },
}

/**
 * The renderer's vertical exaggeration: HEIGHT / PLANE in themes/watershed/scene.ts.
 * Repose has to be expressed against it, because a "height difference per cell"
 * is only an angle once you know how wide a cell is and how tall the world is.
 */
export const WORLD_ASPECT = 21 / 100

/**
 * Angles of repose as height-difference-per-cell, for a given grid size.
 *
 * These were hardcoded, and hardcoded wrong: 0.055 for gravel reads as an 80°
 * face at 512 cells, and silt at 0.009 is a 44° one. Loose sediment standing at
 * 70-80° cannot relax, so every channel the water cut kept vertical walls and
 * the uplands filled with slot canyons. Deriving them from real angles also
 * makes the bake resolution-independent — the same constant meant a different
 * angle at every size the tests ran at.
 */
export function reposeTable(size) {
  const perCell = 1 / ((size - 1) * WORLD_ASPECT)
  const at = (deg) => Math.tan((deg * Math.PI) / 180) * perCell
  return {
    gravel: at(MATERIALS.gravel.angle),
    sand: at(MATERIALS.sand.angle),
    silt: at(MATERIALS.silt.angle),
    rock: at(MATERIALS.rock.angle),
  }
}

/** Total loose cover above bedrock. */
export const loose = (w, i) => w.gravel[i] + w.sand[i] + w.silt[i]

/** The grade a cascade or a colour should read at this cell. */
export function topMaterial(w, i, cover = 0.0015) {
  if (w.silt[i] > cover) return 'silt'
  if (w.sand[i] > cover) return 'sand'
  if (w.gravel[i] > cover) return 'gravel'
  return 'rock'
}

/**
 * Remove `amount` of surface, fine grades first, and report what came away.
 * Rock only yields once everything loose above it is gone, and then grudgingly —
 * that difference is what leaves hard ribs standing out of worn ground.
 */
function strip(w, i, amount, rockErodibility = MATERIALS.rock.erodibility) {
  let want = amount
  let got = 0
  for (const grade of ['silt', 'sand', 'gravel']) {
    if (want <= 0) break
    const have = w[grade][i]
    if (have <= 0) continue
    const take = Math.min(have, want / MATERIALS[grade].erodibility)
    w[grade][i] -= take
    got += take
    want -= take * MATERIALS[grade].erodibility
  }
  if (want > 0) got += want * rockErodibility
  w.height[i] -= got
  return got
}

/**
 * Lay `amount` down as whichever grade this strength of flow can no longer
 * carry: a busy channel keeps the fines moving and leaves gravel behind, slack
 * water drops silt. `flow` is normalised discharge, 0..1.
 *
 * Grading on the particle's raw speed instead looked right and wasn't — that
 * value is renormalised to a constant step length every iteration, so it sat
 * above the coarse threshold almost always and the bed came out gravel
 * everywhere, with silt at 0.00001 and two of the three grades doing nothing.
 */
function lay(w, i, amount, flow) {
  const grade =
    flow >= MATERIALS.gravel.drop ? 'gravel' : flow >= MATERIALS.sand.drop ? 'sand' : 'silt'
  w[grade][i] += amount
  w.height[i] += amount
}

/**
 * SimpleHydrology's `cascade`, run at the particle's own position every step
 * rather than as an occasional sweep of the whole map.
 *
 * This is the piece that was missing. Sediment dropped by a particle is spread
 * by the next one that passes, so valley floors level off into real floodplains
 * instead of staying as the lumpy fall line they were deposited on — and a flat
 * floodplain is the precondition for a river to meander across it at all.
 */
function cascade(w, x, y, P) {
  const s = w.size
  if (x < 1 || y < 1 || x >= s - 1 || y >= s - 1) return
  const i = y * s + x
  const neighbours = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const j = (y + dy) * s + (x + dx)
      neighbours.push(j)
    }
  }
  neighbours.sort((a, b) => w.height[a] - w.height[b])

  for (const j of neighbours) {
    // Both directions. This used to break out as soon as a neighbour stood
    // higher than the centre, so material could only ever be pushed *out* of a
    // cell and never pulled *down into* one — which meant a channel's own walls
    // could never collapse into it, however far past their angle of repose they
    // stood. That is what cut slot canyons through the uplands: the water dug,
    // and nothing was permitted to fall back in behind it.
    const [hi, lo] = w.height[j] > w.height[i] ? [j, i] : [i, j]
    if (w.height[hi] <= w.height[lo]) continue
    const grade = topMaterial(w, hi)
    const diff = w.height[hi] - w.height[lo]

    if (grade === 'rock') {
      // Bedrock shears too — slowly, and only past a much steeper angle, but it
      // has to give at all. Skipping it entirely meant that the moment a
      // channel cut down to rock its walls could never relax, so every river
      // sawed a slot canyon through the uplands and left it standing. What
      // comes away arrives below as scree.
      const excess = diff - w.repose.rock
      if (excess <= 0) continue
      const transfer = ((P.settling * excess) / 2) * P.rockCascadeRate
      if (transfer <= 0) continue
      w.height[hi] -= transfer
      w.gravel[lo] += transfer
      w.height[lo] += transfer
      continue
    }

    const excess = diff - w.repose[grade]
    if (excess <= 0) continue
    const transfer = Math.min(w[grade][hi], (P.settling * excess) / 2)
    if (transfer <= 0) continue
    w[grade][hi] -= transfer
    w.height[hi] -= transfer
    w[grade][lo] += transfer
    w.height[lo] += transfer
  }
}

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
  /** The reference's own value. With capacity scaled by discharge this sets how
   *  much more a river can carry than open hillside. */
  entrainment: 10.0,
  /** Normalises unbounded discharge into 0..1 for the capacity term. */
  entrainScale: 0.4,
  /** Hard ceiling on suspended load — the guard against runaway entrainment.
   *  Raised from 0.03 once capacity became discharge-scaled: the cap was
   *  binding in every channel, which flattened the difference between a river
   *  and a rivulet that the whole model turns on. */
  maxConcentration: 0.08,
  maxSteps: 1200,
  /** Stream coupling — measured to be the single strongest control on whether
   *  flow gathers into rivers at all. Raising it from 2 to 8 took the share of
   *  water carried by the busiest 1% of cells from 0.11 to 0.27. */
  momentumTransfer: 8.0,
  /** Normalises discharge for the evaporation damper: water is slower to leave
   *  ground that is already wet. */
  dischargeScale: 0.12,
  // maps
  averaging: 0.02,
  // land
  seaLevel: 0.32,
  /** How much of the excess over the angle of repose moves per cascade. The
   *  reference runs this hot (0.8) and cascades at every particle step, which
   *  is what levels valley floors into floodplains instead of leaving the
   *  lumpy fall line the sediment was dropped on. */
  settling: 0.8,
  /** How much of the excess over bedrock's repose shears per cascade. Far
   *  slower than loose material — that gap is what keeps cliffs — but not zero,
   *  or channels cut slot canyons that stand forever. */
  rockCascadeRate: 0.45,
  /** How readily running water cuts bedrock. This is the control on how deep a
   *  valley gets: the loose mantle is thin, so a channel reaches rock quickly
   *  and everything after that is set by this number. */
  rockErodibility: MATERIALS.rock.erodibility,
  /** Bedrock creeps as an occasional whole-map sweep as well, which catches
   *  faces no particle happens to pass. */
  thermalRate: 0.25,
  thermalEvery: 12,
  // wind (see `wind()`) — a light pass, run after the water has done its work
  windDir: [0.82, -0.57],
  windSuspension: 0.0009,
  windAbrasion: 0.0006,
  windSettle: 0.06,
  windSteps: 160,
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

    // Water is slower to evaporate off ground that already carries a stream.
    // Cutting used to be damped here too, on the theory that an established
    // channel transports rather than digs — but now that capacity itself scales
    // with discharge, that damper only cancelled the mechanism that makes
    // rivers. Removing it is worth ~40% more channelisation on its own.
    const d = erf(P.dischargeScale * w.discharge[i])
    const effD = P.depositionRate
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

    // Equilibrium concentration from the drop the particle just took, scaled by
    // how much water already passes here. This is the meander mechanism: a cell
    // the stream runs through can hold far more sediment than open hillside, so
    // the fast outer bank of a bend keeps cutting while the slow inner bank
    // drops its load, and the channel wanders instead of running straight down
    // the fall line. Still bounded — unbounded entrainment is a positive
    // feedback loop (deposit raises the ground, the next drop is larger, which
    // entrains more still) and it ends in spikes and a silted-up sea.
    const drop = w.height[i] - w.height[j]
    const dCap = erf(P.entrainScale * w.discharge[i])
    let cEq = drop > 0 ? drop * (1 + P.entrainment * dCap) : 0
    if (cEq > P.maxConcentration) cEq = P.maxConcentration
    const cDiff = cEq - sediment

    // Take the fine grades first and only then bite into rock, which yields a
    // fraction of the same effort. Channels cut quickly through the mantle and
    // then slow against bedrock, so hard ground stands out as ribs and cliffs
    // rather than everything wearing down together.
    const change = effD * cDiff
    if (change > 0) sediment += strip(w, i, change, P.rockErodibility)
    else {
      const add = -change
      lay(w, i, add, dCap)
      sediment -= add
    }

    // evaporate
    sediment /= 1 - effR
    volume *= 1 - effR

    x = nxp
    y = nyp

    // settle the ground the particle just worked, right where it worked it
    cascade(w, jx, jy, P)
  }

  // Whatever the particle still carries is laid down where it stops — silently
  // discarding it drains mass from the world on every drop and planes the island
  // flat over a long run. Sediment that makes it to open water is genuinely lost
  // to the sea floor, which is both physical and what stops the sea silting up.
  const fx = clampi(Math.floor(x), 1, s - 2)
  const fy = clampi(Math.floor(y), 1, s - 2)
  const fi = fy * s + fx
  if (sediment > 0 && w.height[fi] >= P.seaLevel) {
    // a particle that has run out of water is not carrying anything coarse
    lay(w, fi, Math.min(sediment, P.maxConcentration), 0)
    cascade(w, fx, fy, P)
  }

  return steps
}

/**
 * Bedrock creep: rock standing steeper than it can hold shears off and arrives
 * below as gravel. Loose material is handled by `cascade` at the particle, so
 * this pass only ever looks at faces that are bare rock — which is what keeps
 * cliffs from being quietly rounded away between particle visits.
 */
function thermal(w, P, iterations = 1) {
  const s = w.size
  const h = w.height
  const delta = new Float32Array(s * s)
  const gravelDelta = new Float32Array(s * s)
  const repose = w.repose.rock
  for (let it = 0; it < iterations; it++) {
    delta.fill(0)
    gravelDelta.fill(0)
    for (let y = 1; y < s - 1; y++) {
      for (let x = 1; x < s - 1; x++) {
        const i = y * s + x
        if (h[i] < P.seaLevel) continue
        if (topMaterial(w, i) !== 'rock') continue
        let lowest = -1
        let maxDiff = repose
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
          const move = (maxDiff - repose) * P.thermalRate
          delta[i] -= move
          delta[lowest] += move
          gravelDelta[lowest] += move // shattered rock lands as scree
        }
      }
    }
    for (let i = 0; i < s * s; i++) {
      h[i] += delta[i]
      w.gravel[i] = Math.max(0, w.gravel[i] + gravelDelta[i])
    }
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

/**
 * A light pass of particle-based wind erosion, after the water has done its work
 * (nickmcd.me/2020/11/23/particle-based-wind-erosion).
 *
 * Grains are lifted off ground that stands into the prevailing wind and dropped
 * again in its lee, so exposed shoulders lose their loose cover down to rock
 * while hollows and leeward slopes gather it. Abrasion does not remove rock, it
 * *loosens* it — bare stone in the wind weathers into material the next particle
 * can carry — which is what puts sand at the feet of the exposed faces instead
 * of simply sanding the island down.
 */
export function wind(w, { particles = 9000, seed = 21, params = {} } = {}) {
  const P = { ...DEFAULTS, ...params }
  const s = w.size
  const rng = mulberry32(seed)
  const wl = Math.hypot(P.windDir[0], P.windDir[1]) || 1
  const wx = P.windDir[0] / wl
  const wy = P.windDir[1] / wl
  let moved = 0

  for (let p = 0; p < particles; p++) {
    // Seed on land. Launching from the upwind edge of the map is the tidier
    // picture but the frame is open water by construction, so every particle
    // died on its first step out at sea and the pass did nothing at all.
    const x0 = 1 + rng() * (s - 3)
    const y0 = 1 + rng() * (s - 3)
    if (w.height[Math.floor(y0) * s + Math.floor(x0)] < P.seaLevel) continue
    let x = x0
    let y = y0
    let vx = wx
    let vy = wy
    let carrying = 0

    for (let step = 0; step < P.windSteps; step++) {
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      if (ix < 1 || iy < 1 || ix >= s - 1 || iy >= s - 1) break
      const i = iy * s + ix
      // grains blown out over water are gone
      if (w.height[i] < P.seaLevel) break

      const n = normalAt(w, ix, iy)
      // the wind keeps pushing, the slope deflects — this is what steers
      // particles around obstacles rather than through them
      vx = vx * 0.86 + wx * 0.3 + n.x * 2.2
      vy = vy * 0.86 + wy * 0.3 + n.y * 2.2
      const sp = Math.hypot(vx, vy)
      if (sp < 1e-9) break
      vx /= sp
      vy /= sp

      // ground rising into the wind is exposed; ground falling away is sheltered
      const facing = -(n.x * wx + n.y * wy) * 40
      const hit = Math.max(0, Math.min(1, facing))
      const shelter = Math.max(0, Math.min(1, -facing))

      // Wind moves sand. Gravel is too heavy for it and silt is bound into the
      // damp floodplain, so a breeze that shifted every grade equally would
      // quietly undo the sorting the water spent the whole run establishing.
      if (w.sand[i] > 0) {
        const lift = Math.min(w.sand[i], P.windSuspension * (0.25 + hit))
        w.sand[i] -= lift
        w.height[i] -= lift
        carrying += lift
        moved += lift
      } else if (topMaterial(w, i) === 'rock') {
        // bare rock: weather it into sand in place, no height change
        w.sand[i] = Math.min(w.height[i], w.sand[i] + P.windAbrasion * hit)
      }

      const settle = carrying * P.windSettle * (1 + shelter * 6)
      if (settle > 0) {
        carrying -= settle
        w.height[i] += settle
        w.sand[i] += settle
      }

      x += vx
      y += vy
    }

    // whatever is still airborne lands where the particle gave out
    const fx = clampi(Math.floor(x), 1, s - 2)
    const fy = clampi(Math.floor(y), 1, s - 2)
    const fi = fy * s + fx
    if (carrying > 0 && w.height[fi] >= P.seaLevel) {
      w.height[fi] += carrying
      w.sand[fi] += carrying
    }
  }
  return { moved }
}

/**
 * Take the open sea down to real depth, leaving only the island's own shelf.
 *
 * The renderer decides where waves break from how deep the water is, so *any*
 * shallow ground offshore breaks surf on it — and the map is littered with
 * drowned islets and shoals, both the ones the erosion left and the ones
 * `pruneIslands` sank. Every one of them grew its own ring of foam out in open
 * water, which reads as a reef that is not there.
 *
 * Distance from land is measured by a flood fill, so the shelf that survives is
 * the one actually attached to the coast. Beyond it the floor ramps down past
 * anything the surf can see.
 */
export function deepenOffshore(w, seaLevel, { shelf = 10, ramp = 14, floor = 0.3 } = {}) {
  const s = w.size
  const n = s * s
  const dist = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  for (let i = 0; i < n; i++) {
    if (w.height[i] >= seaLevel) {
      dist[i] = 0
      queue[tail++] = i
    }
  }
  while (head < tail) {
    const i = queue[head++]
    const x = i % s
    const y = (i / s) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
        const j = ny * s + nx
        if (dist[j] !== -1) continue
        dist[j] = dist[i] + 1
        queue[tail++] = j
      }
    }
  }

  let deepened = 0
  const target = seaLevel - floor
  for (let i = 0; i < n; i++) {
    if (dist[i] <= shelf) continue
    const t = Math.min(1, (dist[i] - shelf) / ramp)
    // ease so the shelf runs out into deep water instead of stepping off it
    const k = t * t * (3 - 2 * t)
    const want = w.height[i] + (target - w.height[i]) * k
    if (want < w.height[i]) {
      w.height[i] = want
      deepened++
    }
  }
  return { deepened }
}

/**
 * Standing water on the land: the depth between the terrain and the level its
 * depression fills to before spilling. This is the cheap, deterministic cousin
 * of the flood step in nickmcd.me/2020/04/15/procedural-hydrology — we already
 * compute the filled surface for routing, and the difference between the two
 * *is* the lake. `minDepth` discards the epsilon the fill leaves on flats.
 */
export function lakes(w, seaLevel, minDepth = 0.002, surface) {
  const n = w.size * w.size
  const filled = surface ?? fillDepressions(w, seaLevel)
  const depth = new Float32Array(n)
  let cells = 0
  for (let i = 0; i < n; i++) {
    if (w.height[i] < seaLevel) continue
    const d = filled[i] - w.height[i]
    if (d > minDepth) {
      depth[i] = d
      cells++
    }
  }
  return { depth, cells }
}

/**
 * Drop the offshore specks and anything clinging to the frame, keeping the
 * island the site is actually about.
 *
 * Land is labelled into connected components; a component is sunk unless it is
 * big enough to read as land and sits clear of the border. Sinking is smoothed
 * afterwards so what is left is a shoal on the sea floor rather than a drowned
 * plateau with a cliff around it.
 */
export function pruneIslands(
  w,
  seaLevel,
  { minCells = 260, borderMargin = 0.14, keep = 3, nearMainland = 0.07 } = {},
) {
  const s = w.size
  const n = s * s
  const label = new Int32Array(n).fill(-1)
  const comps = []
  const stack = []
  const margin = Math.round(s * borderMargin)

  for (let start = 0; start < n; start++) {
    if (w.height[start] < seaLevel || label[start] !== -1) continue
    const id = comps.length
    let size = 0
    let touchesBorder = false
    let sumX = 0
    let sumY = 0
    let minX = s
    let maxX = -1
    let minY = s
    let maxY = -1
    stack.length = 0
    stack.push(start)
    label[start] = id
    while (stack.length) {
      const i = stack.pop()
      const x = i % s
      const y = (i / s) | 0
      size++
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x < margin || y < margin || x >= s - margin || y >= s - margin) touchesBorder = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
          const j = ny * s + nx
          if (label[j] !== -1 || w.height[j] < seaLevel) continue
          label[j] = id
          stack.push(j)
        }
      }
    }
    comps.push({
      id,
      size,
      touchesBorder,
      cx: sumX / size,
      cy: sumY / size,
      minX,
      maxX,
      minY,
      maxY,
    })
  }

  const ranked = [...comps].sort((a, b) => b.size - a.size)
  const main = ranked[0]
  const reach = s * nearMainland
  /** Gap between two components' bounding boxes, in cells. */
  const gapTo = (c, m) =>
    Math.hypot(
      Math.max(0, Math.max(m.minX - c.maxX, c.minX - m.maxX)),
      Math.max(0, Math.max(m.minY - c.maxY, c.minY - m.maxY)),
    )
  const kept = new Set()
  for (const c of ranked) {
    if (c === main) {
      kept.add(c.id) // the mainland survives whatever it touches
      continue
    }
    if (kept.size >= keep) break
    // An islet earns its place by being substantial, clear of the frame, and
    // close enough to read as this island's own skerry rather than a stray lump
    // of noise stranded out at the edge of the map.
    if (!c.touchesBorder && c.size >= minCells && gapTo(c, main) <= reach) kept.add(c.id)
  }

  let sunk = 0
  for (let i = 0; i < n; i++) {
    if (label[i] < 0 || kept.has(label[i])) continue
    // Sink well past the shallows. Dropping them just under the waterline left
    // pale shoals exactly where the islands had been — the ghost of the thing
    // we removed, since the water colour only reaches full depth at 0.1 down.
    w.height[i] = seaLevel - 0.12 - (w.height[i] - seaLevel) * 0.1
    w.gravel[i] = 0
    w.sand[i] = 0
    w.silt[i] = 0
    sunk++
  }

  // feather the sunken ground into the sea floor around it
  if (sunk > 0) {
    const h = w.height
    for (let pass = 0; pass < 6; pass++) {
      const copy = Float32Array.from(h)
      for (let y = 1; y < s - 1; y++) {
        for (let x = 1; x < s - 1; x++) {
          const i = y * s + x
          if (copy[i] >= seaLevel) continue
          let sum = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) sum += copy[(y + dy) * s + (x + dx)]
          h[i] = Math.min(seaLevel - 0.004, sum / 9)
        }
      }
    }
  }

  return { components: comps.length, kept: kept.size, sunk }
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
  for (let i = 0; i < n; i++)
    if (label[i] >= 0) counts.set(label[i], (counts.get(label[i]) ?? 0) + 1)
  const big = [...counts.entries()].filter(([, c]) => c >= minCells).sort((a, b) => b[1] - a[1])
  const remap = new Map(big.map(([id], k) => [id, k]))
  for (let i = 0; i < n; i++) label[i] = label[i] >= 0 ? (remap.get(label[i]) ?? -1) : -1

  // Dropping the small basins leaves holes — mostly the coastal strips where
  // towns want to sit, so every site would report "no basin". Grow the surviving
  // labels outward over that land instead, so all ground belongs somewhere.
  const queue = []
  for (let i = 0; i < n; i++) if (label[i] >= 0) queue.push(i)
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]
    const x = i % s
    const y = (i / s) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
        const j = ny * s + nx
        if (label[j] !== -1 || w.height[j] < seaLevel) continue
        label[j] = label[i]
        queue.push(j)
      }
    }
  }

  return { label, count: big.length, sizes: big.map(([, c]) => c) }
}
