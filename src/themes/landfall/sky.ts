import * as THREE from 'three'
import type { World } from './world'

// Weather, and the things that live in it.
//
// Everything here is a sprite, so it faces the camera whatever the orbit does —
// a horizontal cloud deck looks right from above and disappears entirely when
// you drop to the waterline, which is exactly where this theme likes to sit.
//
// Two things are taken from the simulation rather than scattered at random: the
// cloud field is biased to the windward flank, using the same prevailing wind
// the erosion bake blows sand with, and the mist pools in the low ground the
// water actually left behind.

/** The bake's prevailing wind (scripts/watershed/erode.mjs DEFAULTS.windDir). */
const WIND = new THREE.Vector2(0.82, -0.57).normalize()

/** 4×4 ordered dither — breaks the alpha steps up instead of ringing them. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/**
 * A cumulus puff: several lobes unioned, with a dithered edge.
 *
 * A single radial gradient quantised into a few alpha steps draws perfect
 * concentric rings — at cloud size they read as ripples on a pond, not weather.
 * Lobes give it a silhouette and the ordered dither scatters the step
 * boundaries, so it still bands like the rest of the world without the rings.
 */
function puffTexture(rnd: () => number, steps = 6): THREE.Texture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const g = c.getContext('2d')!
  const img = g.createImageData(s, s)

  const lobes: [number, number, number][] = []
  const n = 5 + Math.floor(rnd() * 3)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.7
    const d = 0.1 + rnd() * 0.22
    lobes.push([0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.6, 0.16 + rnd() * 0.14])
  }
  lobes.push([0.5, 0.5, 0.26])

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x / s
      const py = y / s
      let dens = 0
      for (const [lx, ly, lr] of lobes) {
        const d = Math.hypot(px - lx, py - ly) / lr
        if (d < 1) dens = Math.max(dens, 1 - d * d)
      }
      // fade out towards the tile edge so nothing is cut off square
      const edge = 1 - Math.min(1, Math.hypot(px - 0.5, py - 0.5) / 0.5)
      dens *= Math.min(1, edge * 2.4)
      const dith = (BAYER[y & 3][x & 3] / 16 - 0.5) / steps
      const stepped = Math.round((dens + dith) * steps) / steps
      const o = (y * s + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(Math.max(0, Math.min(1, stepped)) * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  return t
}

/** A bird, at the size the rest of this world is drawn: a few hard pixels. */
function birdTexture(): THREE.Texture {
  const w = 16
  const h = 8
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.clearRect(0, 0, w, h)
  g.fillStyle = '#20282e'
  // a shallow V — two strokes, no anti-aliasing
  for (let i = 0; i < 5; i++) {
    g.fillRect(3 + i, 4 - Math.round(i * 0.6), 1, 1)
    g.fillRect(w - 4 - i, 4 - Math.round(i * 0.6), 1, 1)
  }
  g.fillRect(w / 2 - 1, 4, 2, 1)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  return t
}

export interface Sky {
  update: (dt: number, now: number) => void
  dispose: () => void
  setWeather: (wet: number) => void
}

export function createSky(
  scene: THREE.Scene,
  world: World,
  {
    plane,
    height,
    seed = 7,
    clouds = 34,
    mists = 22,
    birds = 16,
  }: {
    plane: number
    height: number
    seed?: number
    clouds?: number
    mists?: number
    birds?: number
  },
): Sky {
  let s = seed >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }

  const size = world.size
  const groundAt = (x: number, z: number) => {
    const gx = Math.round((x / plane + 0.5) * (size - 1))
    const gy = Math.round((z / plane + 0.5) * (size - 1))
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) return world.seaLevel * height
    return Math.max(world.height[gy * size + gx], world.seaLevel) * height
  }

  // a few silhouettes so the sky is not one shape repeated
  const puffs = [puffTexture(rnd), puffTexture(rnd), puffTexture(rnd), puffTexture(rnd)]
  const bird = birdTexture()
  const half = plane * 0.62

  // --- clouds: high, drifting downwind ---------------------------------------
  const cloudMats = puffs.map(
    (m) =>
      new THREE.SpriteMaterial({
        map: m,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        color: new THREE.Color(0.96, 0.98, 1),
        fog: true,
      }),
  )
  const cloudList: { sp: THREE.Sprite; drift: number; bob: number }[] = []
  for (let i = 0; i < clouds; i++) {
    const sp = new THREE.Sprite(cloudMats[i % cloudMats.length])
    // windward flank gets the weather: bias the field upwind of centre
    const bias = (rnd() - 0.62) * half
    sp.position.set(
      -WIND.x * bias + (rnd() - 0.5) * half * 2,
      height * (1.7 + rnd() * 0.9),
      -WIND.y * bias + (rnd() - 0.5) * half * 2,
    )
    const scl = plane * (0.06 + rnd() * 0.09)
    sp.scale.set(scl, scl * (0.42 + rnd() * 0.16), 1)
    sp.renderOrder = 4
    scene.add(sp)
    cloudList.push({ sp, drift: 1.4 + rnd() * 1.6, bob: rnd() * Math.PI * 2 })
  }

  // --- mist: low, pooled in the valleys --------------------------------------
  const mistMat = new THREE.SpriteMaterial({
    map: puffs[1],
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    color: new THREE.Color(0.9, 0.94, 0.97),
    fog: true,
  })
  const mistList: { sp: THREE.Sprite; drift: number; bob: number; base: number }[] = []
  for (let i = 0; i < mists; i++) {
    // hunt for genuinely low ground, so the mist sits where water would
    let x = 0
    let z = 0
    let best = Infinity
    for (let k = 0; k < 24; k++) {
      const cx = (rnd() - 0.5) * plane * 0.82
      const cz = (rnd() - 0.5) * plane * 0.82
      const g = groundAt(cx, cz)
      if (g > world.seaLevel * height + 0.4 && g < best) {
        best = g
        x = cx
        z = cz
      }
    }
    if (!Number.isFinite(best)) continue
    const sp = new THREE.Sprite(mistMat)
    const base = best + height * 0.035
    sp.position.set(x, base, z)
    const scl = plane * (0.09 + rnd() * 0.1)
    sp.scale.set(scl, scl * 0.26, 1)
    sp.renderOrder = 4
    scene.add(sp)
    mistList.push({ sp, drift: 0.3 + rnd() * 0.4, bob: rnd() * Math.PI * 2, base })
  }

  // --- birds: a loose flock working the updraughts ----------------------------
  const birdMat = new THREE.SpriteMaterial({
    map: bird,
    transparent: true,
    depthWrite: false,
    fog: true,
  })
  const birdList: {
    sp: THREE.Sprite
    r: number
    a: number
    speed: number
    y: number
    bob: number
    scl: number
  }[] = []
  for (let i = 0; i < birds; i++) {
    const sp = new THREE.Sprite(birdMat)
    const scl = plane * (0.014 + rnd() * 0.01)
    sp.scale.set(scl, scl * 0.5, 1)
    sp.renderOrder = 5
    scene.add(sp)
    birdList.push({
      sp,
      r: plane * (0.1 + rnd() * 0.28),
      a: rnd() * Math.PI * 2,
      speed: 0.12 + rnd() * 0.16,
      y: height * (0.85 + rnd() * 0.5),
      bob: rnd() * Math.PI * 2,
      scl,
    })
  }

  const wrap = (v: number) => {
    const span = half * 2
    return ((((v + half) % span) + span) % span) - half
  }

  let wet = 0.35

  return {
    setWeather(v: number) {
      wet = Math.max(0, Math.min(1, v))
      for (const m of cloudMats) m.opacity = 0.32 + wet * 0.34
      mistMat.opacity = 0.14 + wet * 0.3
    },
    update(dt, now) {
      for (const c of cloudList) {
        c.sp.position.x = wrap(c.sp.position.x + WIND.x * c.drift * dt)
        c.sp.position.z = wrap(c.sp.position.z + WIND.y * c.drift * dt)
        c.sp.position.y += Math.sin(now * 0.0004 + c.bob) * dt * 0.4
      }
      for (const m of mistList) {
        m.sp.position.x = wrap(m.sp.position.x + WIND.x * m.drift * dt)
        m.sp.position.z = wrap(m.sp.position.z + WIND.y * m.drift * dt)
        // breathe, and stay just off the ground it is lying on
        m.sp.position.y = m.base + Math.sin(now * 0.0006 + m.bob) * height * 0.012
      }
      for (const b of birdList) {
        b.a += b.speed * dt
        b.sp.position.set(
          Math.cos(b.a) * b.r,
          b.y + Math.sin(now * 0.0011 + b.bob) * 1.2,
          Math.sin(b.a) * b.r,
        )
        // the flap: the sprite squashes as the wings go through the stroke
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(now * 0.006 + b.bob))
        b.sp.scale.set(b.scl, b.scl * 0.5 * flap, 1)
      }
    },
    dispose() {
      for (const c of cloudList) scene.remove(c.sp)
      for (const m of mistList) scene.remove(m.sp)
      for (const b of birdList) scene.remove(b.sp)
      for (const m of cloudMats) m.dispose()
      mistMat.dispose()
      birdMat.dispose()
      for (const m of puffs) m.dispose()
      bird.dispose()
    },
  }
}
