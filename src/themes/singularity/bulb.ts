// singularity — the flagship renderer. Raymarched BoxFoldBulbPow2 (Mandelbulber's
// foldingIntPow: mandelbox box/sphere folds feeding a quadratic bulb) in Three.js
// TSL. One shader → WGSL on WebGPU, GLSL on WebGL 2 (?webgl forces the fallback).
// Navigation is a dive: the theme flies the camera between authored poses per
// route (flyTo), scroll dives with DE-scaled collision-aware speed, drag looks.
// Art: black→fire ramp from the route palette, warm key + soft raymarched
// shadows, cool fill, heat-gated glints, crevice embers, fog, ACES-ish tonemap.
// Resolution adapts to hold fps; the HUD (?hud) can pin it manually.
//
// QA params: ?cam=x,y,z ?yaw= ?pitch= ?ff= ?zf=
//            ?dbg=hit|heat|ao|trap|base|embers|glow|lit

import * as THREE from 'three/webgpu'
import {
  Break,
  Fn,
  If,
  Loop,
  clamp,
  dot,
  exp,
  float,
  log,
  max,
  min,
  mix,
  normalize,
  pow,
  reflect,
  smoothstep,
  sqrt,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl'

export interface BulbPalette {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
}

export interface BulbPose {
  pos: [number, number, number]
  yaw: number
  pitch: number
}

export interface Bulb {
  setPalette: (p: BulbPalette) => void
  flyTo: (pose: BulbPose, instant?: boolean) => void
  setPixelRatio: (r: number) => void
  stats: () => { fps: number; backend: string; width: number; height: number; dist: number }
  dispose: () => void
}

const DE_ITER = 12
const MARCH_STEPS = 96
const SHADOW_STEPS = 20
const BOUND_R = 1.6 // bounding sphere around the set (probed set radius ≈ 1.3)
const SET_R = 1.3
// sphere fold radii fR2=1.0, mR2=0.25 → branchless factor = clamp(1/r², 1, fR2/mR2=4)
// Outside BOUND_R the iteration has false attractors (orbits cycle below bailout and
// the log-DE collapses to 0), so the estimator answers with the bounding-sphere
// distance out there instead of iterating.

function urlNum(key: string, fallback: number): number {
  const v = new URLSearchParams(window.location.search).get(key)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? n : fallback
}

// CPU mirror of the distance estimator — one evaluation per frame drives the
// collision-aware dive speed. Must match mapDE below.
function makeDeJS(fold: number, zfac: number) {
  return (px: number, py: number, pz: number): number => {
    let zx = px
    let zy = py
    let zz = pz
    let dr = 1
    let r2 = zx * zx + zy * zy + zz * zz
    if (r2 > BOUND_R * BOUND_R) return Math.sqrt(r2) - SET_R
    for (let i = 0; i < DE_ITER; i++) {
      // box fold
      zx = Math.min(Math.max(zx, -fold), fold) * 2 - zx
      zy = Math.min(Math.max(zy, -fold), fold) * 2 - zy
      zz = Math.min(Math.max(zz, -fold), fold) * 2 - zz
      // sphere fold (fR2=1, mR2=0.25) — factor clamps to fR2/mR2 = 4
      r2 = zx * zx + zy * zy + zz * zz
      const factor = Math.min(Math.max(1 / Math.max(r2, 1e-12), 1), 4)
      zx *= factor
      zy *= factor
      zz *= factor
      dr *= factor
      // scale
      zx *= 2
      zy *= 2
      zz *= 2
      dr *= 2
      // quadratic bulb
      const x2 = zx * zx
      const y2 = zy * zy
      const z2 = zz * zz
      const xy2 = Math.max(x2 + y2, 1e-12)
      const temp = 1 - z2 / xy2
      const rNow = Math.sqrt(x2 + y2 + z2)
      dr = 2 * rNow * dr + 1
      const nx = (x2 - y2) * temp
      const ny = 2 * zx * zy * temp
      const nz = -2 * zz * Math.sqrt(xy2) * zfac
      zx = nx + px
      zy = ny + py
      zz = nz + pz
      r2 = zx * zx + zy * zy + zz * zz
      if (r2 > 100) break
    }
    const r = Math.sqrt(Math.max(r2, 1e-12))
    return (0.5 * Math.log(r) * r) / dr
  }
}

const shortestAngle = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export async function createBulb(
  canvas: HTMLCanvasElement,
  start: BulbPose,
): Promise<Bulb | null> {
  const forceWebGL = new URLSearchParams(window.location.search).has('webgl')
  let renderer: InstanceType<typeof THREE.WebGPURenderer>
  try {
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL })
    await renderer.init()
  } catch (e) {
    console.error('singularity: renderer init failed', e)
    return null
  }

  const foldFactor = urlNum('ff', 1.0)
  const zFactor = urlNum('zf', 1.0)
  const deJS = makeDeJS(foldFactor, zFactor)
  // ?dbg=… — shader is built with the channel visualized (QA only)
  const dbgMode = new URLSearchParams(window.location.search).get('dbg')

  // --- uniforms ---
  const uCamPos = uniform(new THREE.Vector3(...start.pos))
  const uFwd = uniform(new THREE.Vector3(0, 0, -1))
  const uRight = uniform(new THREE.Vector3(1, 0, 0))
  const uUp = uniform(new THREE.Vector3(0, 1, 0))
  const uAspect = uniform(1)
  const uFold = uniform(foldFactor)
  const uZfac = uniform(zFactor)

  // TSL's typings are narrower than its runtime for generic shader helpers;
  // the theme opts out locally rather than fighting them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type TSLNode = any
  const uPalA = uniform(new THREE.Vector3(0.16, 0.04, 0.03))
  const uPalB = uniform(new THREE.Vector3(1.0, 0.42, 0.0))
  const uPalC = uniform(new THREE.Vector3(1.0, 0.91, 0.78))

  // --- TSL shader ---
  // BoxFoldBulbPow2 distance estimator. Returns vec3(de, min-r orbit trap, escape frac).
  const mapDE = Fn(([p]: [TSLNode]) => {
    const out = vec3(0, 0, 0).toVar()
    const r02 = dot(p, p)
    If(r02.greaterThan(BOUND_R * BOUND_R), () => {
      out.assign(vec3(sqrt(r02).sub(SET_R), 2.0, 0.0))
    }).Else(() => {
      const z = vec3(p).toVar()
      const dr = float(1).toVar()
      const r2 = float(0).toVar()
      const trap = float(1e5).toVar()
      const it = float(0).toVar()
      Loop(DE_ITER, () => {
        it.addAssign(1)
        // box fold: x = clamp(x,-F,F)*2 - x
        z.assign(clamp(z, vec3(uFold.negate()), vec3(uFold)).mul(2.0).sub(z))
        // sphere fold (fR2=1, mR2=0.25) — branchless
        r2.assign(dot(z, z))
        const factor = clamp(float(1).div(max(r2, 1e-12)), 1.0, 4.0)
        z.mulAssign(factor)
        dr.mulAssign(factor)
        // scale *2
        z.mulAssign(2.0)
        dr.mulAssign(2.0)
        // quadratic bulb (pow2 with inverted z)
        const x2 = z.x.mul(z.x)
        const y2 = z.y.mul(z.y)
        const z2 = z.z.mul(z.z)
        const xy2 = max(x2.add(y2), 1e-12)
        const temp = float(1).sub(z2.div(xy2))
        const rNow = sqrt(x2.add(y2).add(z2))
        dr.assign(rNow.mul(2.0).mul(dr).add(1.0))
        z.assign(
          vec3(
            x2.sub(y2).mul(temp),
            z.x.mul(z.y).mul(2.0).mul(temp),
            z.z.mul(sqrt(xy2)).mul(-2.0).mul(uZfac),
          ).add(p),
        )
        r2.assign(dot(z, z))
        trap.assign(min(trap, r2))
        If(r2.greaterThan(100.0), () => {
          Break()
        })
      })
      const r = sqrt(max(r2, 1e-12))
      out.assign(vec3(log(r).mul(0.5).mul(r).div(dr), sqrt(trap), it.div(DE_ITER)))
    })
    return out
  })

  const normalAt = Fn(([p, t]: [TSLNode, TSLNode]) => {
    const e = max(t.mul(0.0007), 0.00012)
    const n = vec3(
      mapDE(p.add(vec3(e, 0, 0))).x.sub(mapDE(p.sub(vec3(e, 0, 0))).x),
      mapDE(p.add(vec3(0, e, 0))).x.sub(mapDE(p.sub(vec3(0, e, 0))).x),
      mapDE(p.add(vec3(0, 0, e))).x.sub(mapDE(p.sub(vec3(0, 0, e))).x),
    )
    return normalize(n)
  })

  // soft shadow: cheap penumbra march toward the key light
  const softShadow = Fn(([p, l]: [TSLNode, TSLNode]) => {
    const sh = float(1).toVar()
    const tt = float(0.004).toVar()
    Loop(SHADOW_STEPS, () => {
      const d = mapDE(p.add(l.mul(tt))).x
      sh.assign(min(sh, d.mul(10.0).div(tt)))
      tt.addAssign(clamp(d, 0.002, 0.06))
      If(sh.lessThan(0.03), () => {
        Break()
      })
      If(tt.greaterThan(1.6), () => {
        Break()
      })
    })
    return smoothstep(0.0, 1.0, clamp(sh, 0.0, 1.0))
  })

  // black → deep ember → fire → white-hot, driven by the route palette
  const fireRamp = Fn(([v]: [TSLNode]) => {
    const c1 = mix(vec3(0.004, 0.004, 0.007), vec3(uPalA), smoothstep(0.0, 0.38, v))
    const c2 = mix(c1, vec3(uPalB), smoothstep(0.34, 0.78, v))
    return mix(c2, vec3(uPalC), smoothstep(0.76, 1.0, v))
  })

  const shade = Fn(() => {
    const ndc = uv().mul(2).sub(1).toVar()
    const rd = normalize(
      uFwd.add(uRight.mul(ndc.x.mul(uAspect).mul(0.85))).add(uUp.mul(ndc.y.mul(0.85))),
    ).toVar()
    const ro = vec3(uCamPos).toVar()

    // bounding-sphere clip: background rays never march the fractal
    const t = float(0).toVar()
    const kill = float(0).toVar()
    const b = dot(ro, rd)
    const cc = dot(ro, ro).sub(BOUND_R * BOUND_R)
    If(cc.greaterThan(0.0), () => {
      const disc = b.mul(b).sub(cc)
      If(disc.lessThan(0.0).or(b.greaterThan(0.0)), () => {
        kill.assign(1)
      }).Else(() => {
        t.assign(max(b.negate().sub(sqrt(disc)), 0.0))
      })
    })

    const hit = float(0).toVar()
    const trapOut = float(0).toVar()
    const minRel = float(10).toVar()
    const glow = float(0).toVar()
    If(kill.lessThan(0.5), () => {
      Loop(MARCH_STEPS, () => {
        const pos = ro.add(rd.mul(t))
        const res = mapDE(pos)
        const d = res.x
        minRel.assign(min(minRel, d.div(max(t, 0.02))))
        glow.addAssign(exp(d.mul(-46.0)).mul(0.004))
        If(d.lessThan(max(t.mul(0.0009), 0.00018)), () => {
          hit.assign(1)
          trapOut.assign(res.y)
          Break()
        })
        t.addAssign(d.mul(0.85))
        If(t.greaterThan(9.0), () => {
          Break()
        })
      })
      // step-exhausted rays crawled up to a surface without formally hitting it —
      // shade them as hits so dense interiors read as walls, not halo wash
      If(hit.lessThan(0.5).and(t.lessThan(8.5)), () => {
        hit.assign(1)
        trapOut.assign(mapDE(ro.add(rd.mul(t))).y)
      })
    })

    // background: void gradient with a faint ember floor + near-miss halo
    const bg = mix(
      vec3(0.004, 0.005, 0.009),
      vec3(0.030, 0.011, 0.007),
      smoothstep(-1, 1, ndc.y).oneMinus(),
    )
    const halo = exp(minRel.mul(-60.0)).mul(0.14)
    const missCol = bg.add(uPalB.mul(halo))

    // hit shading
    const pos = ro.add(rd.mul(t))
    const n = normalAt(pos, t)
    const keyDir = normalize(vec3(0.55, 0.72, 0.42))
    const fillDir = normalize(vec3(-0.6, -0.15, -0.5))
    const sh = softShadow(pos.add(n.mul(0.002)), keyDir)
    const diff = clamp(dot(n, keyDir), 0.0, 1.0).mul(sh)
    const fill = clamp(dot(n, fillDir), 0.0, 1.0)
    // AO: DE samples along the normal
    const ao = float(0).toVar()
    Loop(4, ({ i }) => {
      const h = float(i).add(1).mul(0.012)
      ao.addAssign(clamp(mapDE(pos.add(n.mul(h))).x.div(h), 0.0, 1.0))
    })
    ao.assign(ao.mul(0.25).mul(0.72).add(0.28))
    const fresnel = pow(clamp(dot(n, rd.negate()), 0.0, 1.0).oneMinus(), 3.0)
    const spec = pow(clamp(dot(reflect(rd, n), keyDir), 0.0, 1.0), 28.0)
      .mul(sh)
      .mul(0.5)

    // heat: measured surface trap median ≈ 3.25 (min |z| over the orbit) — steep
    // curve around it spreads the ramp; radial depth adds the geode gradient
    // (black shell, fire toward the core)
    const heat = smoothstep(3.05, 3.95, trapOut)
      .mul(0.6)
      .add(smoothstep(1.35, 0.78, sqrt(dot(pos, pos))).mul(0.4))
    const base = fireRamp(heat)
    const embers = vec3(uPalB).mul(pow(ao.oneMinus(), 3.0)).mul(heat.mul(0.9).add(0.1)).mul(1.1)
    // cold obsidian stays matte; only hot material glints and rims
    const glintGate = heat.mul(0.85).add(0.15)
    const litRaw = base
      .mul(diff.mul(1.05).add(0.06))
      .add(vec3(0.05, 0.07, 0.12).mul(fill).mul(0.5))
      .add(mix(vec3(uPalB), vec3(uPalC), heat).mul(spec).mul(glintGate))
      .add(vec3(uPalC).mul(fresnel).mul(0.25).mul(glintGate))
      .mul(ao)
      .add(embers)
    // distance fog into the void
    const lit = mix(litRaw, bg, clamp(t.sub(1.0).mul(0.22), 0.0, 0.9))

    // QA debug channels (compiled in only when ?dbg= is set)
    if (dbgMode === 'hit') return vec4(vec3(hit, minRel.min(1), 0), 1.0)
    if (dbgMode === 'heat') return vec4(vec3(heat), 1.0)
    if (dbgMode === 'ao') return vec4(vec3(ao), 1.0)
    if (dbgMode === 'trap') return vec4(vec3(trapOut.mul(0.25)), 1.0)
    if (dbgMode === 'base') return vec4(base.mul(hit), 1.0)
    if (dbgMode === 'embers') return vec4(embers.mul(hit), 1.0)
    if (dbgMode === 'glow') return vec4(vec3(min(glow, 0.5)), 1.0)
    if (dbgMode === 'lit') return vec4(litRaw.mul(hit), 1.0)

    const col = mix(missCol, lit, hit).add(vec3(uPalB).mul(min(glow, 0.35)).mul(0.35)).toVar()
    // ACES-ish tonemap, gentle gamma, corner vignette
    const tone = col
      .mul(col.mul(2.51).add(0.03))
      .div(col.mul(col.mul(2.43).add(0.59)).add(0.14))
    const vig = float(1).sub(dot(ndc, ndc).mul(0.16))
    return vec4(pow(clamp(tone.mul(vig), 0.0, 1.0), vec3(0.92)), 1.0)
  })

  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = shade()
  const scene = new THREE.Scene()
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // --- camera state & input ---
  // ?cam=x,y,z / ?yaw= / ?pitch= override the start pose (QA/motion-tile scouting)
  const camParam = new URLSearchParams(window.location.search).get('cam')
  const camStart = camParam?.split(',').map(Number) ?? []
  const pos =
    camStart.length === 3 && camStart.every(Number.isFinite)
      ? new THREE.Vector3(camStart[0], camStart[1], camStart[2])
      : new THREE.Vector3(...start.pos)
  let yaw = urlNum('yaw', start.yaw)
  let pitch = urlNum('pitch', start.pitch)
  let vel = 0
  let dragging = false
  let lastX = 0
  let lastY = 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // --- flight (navigation-as-dive) ---
  const flight = {
    active: false,
    t: 0,
    dur: 1.7,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromYaw: 0,
    dYaw: 0,
    fromPitch: 0,
    dPitch: 0,
  }
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

  const cancelFlight = () => {
    flight.active = false
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    cancelFlight()
    vel += -e.deltaY * 0.0011
    vel = Math.max(-2.4, Math.min(2.4, vel))
  }
  const onDown = (e: PointerEvent) => {
    dragging = true
    cancelFlight()
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    yaw -= (e.clientX - lastX) * 0.0032
    pitch -= (e.clientY - lastY) * 0.0032
    pitch = Math.max(-1.45, Math.min(1.45, pitch))
    lastX = e.clientX
    lastY = e.clientY
  }
  const onUp = () => {
    dragging = false
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  // --- palette lerp ---
  const palFrom: BulbPalette = { a: [0.16, 0.04, 0.03], b: [1.0, 0.42, 0.0], c: [1.0, 0.91, 0.78] }
  const palTo: BulbPalette = { ...palFrom }
  let palT = 1

  // --- adaptive resolution: hold ~60fps; manual DPR buttons take over ---
  const DPR_CAP = Math.min(window.devicePixelRatio || 1, 1.5)
  let pixelRatio = DPR_CAP
  let autoRes = true
  let tuneAt = performance.now() + 1500

  // --- loop ---
  let raf = 0
  let lastT = performance.now()
  let fps = 0
  let dist = 0
  let disposed = false
  const up0 = new THREE.Vector3(0, 1, 0)
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  const upv = new THREE.Vector3()

  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    uAspect.value = w / h
  }
  renderer.setPixelRatio(pixelRatio)
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  const frame = (now: number) => {
    if (disposed) return
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    fps = fps * 0.92 + (dt > 0 ? 1 / dt : 0) * 0.08

    // adaptive resolution: trade pixels for frame rate, never below 0.55×
    if (autoRes && now > tuneAt) {
      if (fps < 50 && pixelRatio > 0.55) {
        pixelRatio = Math.max(0.55, pixelRatio - 0.15)
        renderer.setPixelRatio(pixelRatio)
        resize()
        tuneAt = now + 1200
      } else if (fps > 72 && pixelRatio < DPR_CAP) {
        pixelRatio = Math.min(DPR_CAP, pixelRatio + 0.1)
        renderer.setPixelRatio(pixelRatio)
        resize()
        tuneAt = now + 1200
      }
    }

    // flight easing between authored poses
    if (flight.active) {
      flight.t = Math.min(1, flight.t + dt / flight.dur)
      const k = easeInOut(flight.t)
      pos.lerpVectors(flight.fromPos, flight.toPos, k)
      yaw = flight.fromYaw + flight.dYaw * k
      pitch = flight.fromPitch + flight.dPitch * k
      if (flight.t >= 1) flight.active = false
    }

    // orientation
    fwd
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .normalize()
    right.crossVectors(fwd, up0).normalize()
    upv.crossVectors(right, fwd).normalize()

    // collision-aware dive: speed scales with distance to the surface
    dist = Math.max(deJS(pos.x, pos.y, pos.z), 0.00004)
    if (!reduced && Math.abs(vel) > 0.0001) {
      const step = Math.min(dist * 0.6, 0.18) * vel * dt * 3.2
      pos.addScaledVector(fwd, step)
      vel *= Math.exp(-dt * 2.1)
    }

    // palette easing
    if (palT < 1) {
      palT = Math.min(1, palT + dt * 1.8)
      const l = (i: number, from: number[], to: number[]) => from[i] + (to[i] - from[i]) * palT
      ;(uPalA.value as THREE.Vector3).set(l(0, palFrom.a, palTo.a), l(1, palFrom.a, palTo.a), l(2, palFrom.a, palTo.a))
      ;(uPalB.value as THREE.Vector3).set(l(0, palFrom.b, palTo.b), l(1, palFrom.b, palTo.b), l(2, palFrom.b, palTo.b))
      ;(uPalC.value as THREE.Vector3).set(l(0, palFrom.c, palTo.c), l(1, palFrom.c, palTo.c), l(2, palFrom.c, palTo.c))
    }

    ;(uCamPos.value as THREE.Vector3).copy(pos)
    ;(uFwd.value as THREE.Vector3).copy(fwd)
    ;(uRight.value as THREE.Vector3).copy(right)
    ;(uUp.value as THREE.Vector3).copy(upv)

    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  // Dev QA hook: hidden windows never fire rAF, so preview tooling can pump
  // frames manually. Not part of the theme contract.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __bulbStep?: (n?: number) => void }).__bulbStep = (n = 1) => {
      // cancel the pending rAF before each manual call so frame()'s own
      // scheduling never stacks parallel loops; the last call leaves one alive
      for (let i = 0; i < n; i++) {
        cancelAnimationFrame(raf)
        frame(performance.now())
      }
    }
  }

  const backendName = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } })
    .backend?.isWebGPUBackend
    ? 'WebGPU'
    : 'WebGL 2'

  return {
    setPalette(p: BulbPalette) {
      const cur = {
        a: (uPalA.value as THREE.Vector3).toArray() as [number, number, number],
        b: (uPalB.value as THREE.Vector3).toArray() as [number, number, number],
        c: (uPalC.value as THREE.Vector3).toArray() as [number, number, number],
      }
      Object.assign(palFrom, cur)
      Object.assign(palTo, p)
      palT = 0
    },
    flyTo(pose: BulbPose, instant = false) {
      if (instant || reduced) {
        pos.set(...pose.pos)
        yaw = pose.yaw
        pitch = pose.pitch
        cancelFlight()
        return
      }
      flight.fromPos.copy(pos)
      flight.toPos.set(...pose.pos)
      flight.fromYaw = yaw
      flight.dYaw = shortestAngle(yaw, pose.yaw)
      flight.fromPitch = pitch
      flight.dPitch = pose.pitch - pitch
      flight.t = 0
      flight.active = true
      vel = 0
    },
    setPixelRatio(r: number) {
      autoRes = false
      pixelRatio = r
      renderer.setPixelRatio(r)
      resize()
    },
    stats() {
      const size = new THREE.Vector2()
      renderer.getSize(size)
      const pr = renderer.getPixelRatio()
      return {
        fps: Math.round(fps),
        backend: backendName,
        width: Math.round(size.x * pr),
        height: Math.round(size.y * pr),
        dist,
      }
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      renderer.dispose()
    },
  }
}
