// Phase 3 spike: real-time raymarched Mandelbulb in Three.js TSL.
// One shader → WGSL on WebGPU, GLSL on WebGL 2 (?webgl forces the fallback tier).
// Scroll dives: camera speed scales with the distance estimator, so you glide into
// the folds without clipping. Beauty-at-60fps scope: orbit-trap palette, AO, rim,
// fog and near-miss glow.

import * as THREE from 'three/webgpu'
import {
  Break,
  Fn,
  If,
  Loop,
  acos,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  length,
  log,
  max,
  min,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

export interface BulbPalette {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
}

export interface Bulb {
  setPalette: (p: BulbPalette) => void
  setPixelRatio: (r: number) => void
  stats: () => { fps: number; backend: string; width: number; height: number; dist: number }
  dispose: () => void
}

const POWER = 8
const DE_ITER = 9
const MARCH_STEPS = 110

// CPU mirror of the distance estimator — one evaluation per frame drives the
// collision-aware dive speed.
function deJS(px: number, py: number, pz: number): number {
  let zx = px
  let zy = py
  let zz = pz
  let dr = 1
  let r = 0
  for (let i = 0; i < DE_ITER; i++) {
    r = Math.sqrt(zx * zx + zy * zy + zz * zz)
    if (r > 2) break
    const theta = Math.acos(zz / (r || 1e-9)) * POWER
    const phi = Math.atan2(zy, zx) * POWER
    const zr = Math.pow(r, POWER)
    dr = Math.pow(r, POWER - 1) * POWER * dr + 1
    zx = zr * Math.sin(theta) * Math.cos(phi) + px
    zy = zr * Math.sin(theta) * Math.sin(phi) + py
    zz = zr * Math.cos(theta) + pz
  }
  return (0.5 * Math.log(Math.max(r, 1e-9)) * r) / dr
}

export async function createBulb(canvas: HTMLCanvasElement): Promise<Bulb | null> {
  const forceWebGL = new URLSearchParams(window.location.search).has('webgl')
  let renderer: InstanceType<typeof THREE.WebGPURenderer>
  try {
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL })
    await renderer.init()
  } catch (e) {
    console.error('spike: renderer init failed', e)
    return null
  }

  // --- uniforms ---
  const uCamPos = uniform(new THREE.Vector3(0, 0.4, 3.4))
  const uFwd = uniform(new THREE.Vector3(0, 0, -1))
  const uRight = uniform(new THREE.Vector3(1, 0, 0))
  const uUp = uniform(new THREE.Vector3(0, 1, 0))
  const uAspect = uniform(1)

  // TSL's typings are narrower than its runtime for generic shader helpers;
  // the spike opts out locally rather than fighting them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type TSLNode = any
  const uPalA = uniform(new THREE.Vector3(0.16, 0.04, 0.03))
  const uPalB = uniform(new THREE.Vector3(1.0, 0.42, 0.0))
  const uPalC = uniform(new THREE.Vector3(1.0, 0.91, 0.78))

  // --- TSL shader ---
  const mapDE = Fn(([p]: [TSLNode]) => {
    const z = vec3(p).toVar()
    const dr = float(1).toVar()
    const r = float(0).toVar()
    const trap = float(1e5).toVar()
    Loop(DE_ITER, () => {
      r.assign(length(z))
      If(r.greaterThan(2.0), () => {
        Break()
      })
      trap.assign(min(trap, r))
      const theta = acos(z.z.div(max(r, 1e-9))).mul(POWER)
      const phi = atan(z.y, z.x).mul(POWER)
      const zr = pow(r, POWER)
      dr.assign(pow(r, POWER - 1).mul(POWER).mul(dr).add(1.0))
      z.assign(
        vec3(
          sin(theta).mul(cos(phi)),
          sin(theta).mul(sin(phi)),
          cos(theta),
        )
          .mul(zr)
          .add(p),
      )
    })
    const de = log(max(r, 1e-9)).mul(0.5).mul(r).div(dr)
    return vec2(de, trap)
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

  const shade = Fn(() => {
    const ndc = uv().mul(2).sub(1).toVar()
    const rd = normalize(
      uFwd.add(uRight.mul(ndc.x.mul(uAspect).mul(0.85))).add(uUp.mul(ndc.y.mul(0.85))),
    ).toVar()
    const ro = vec3(uCamPos).toVar()

    const t = float(0).toVar()
    const hit = float(0).toVar()
    const trapOut = float(0).toVar()
    const minRel = float(10).toVar()
    Loop(MARCH_STEPS, () => {
      const pos = ro.add(rd.mul(t))
      const res = mapDE(pos)
      const d = res.x
      minRel.assign(min(minRel, d.div(max(t, 0.02))))
      If(d.lessThan(max(t.mul(0.0009), 0.00018)), () => {
        hit.assign(1)
        trapOut.assign(res.y)
        Break()
      })
      t.addAssign(d.mul(0.9))
      If(t.greaterThan(9.0), () => {
        Break()
      })
    })

    // background: deep vertical gradient + near-miss ember halo
    const bg = mix(vec3(0.006, 0.007, 0.01), vec3(0.028, 0.012, 0.008), smoothstep(-1, 1, ndc.y).oneMinus())
    const halo = exp(minRel.mul(-30.0)).mul(0.3)
    const missCol = bg.add(uPalB.mul(halo))

    // hit shading
    const pos = ro.add(rd.mul(t))
    const n = normalAt(pos, t)
    const lightDir = normalize(vec3(0.62, 0.7, 0.35))
    const diff = clamp(dot(n, lightDir), 0.0, 1.0)
    // AO: DE samples along the normal
    const ao = float(0).toVar()
    Loop(4, ({ i }) => {
      const h = float(i).add(1).mul(0.012)
      ao.addAssign(clamp(mapDE(pos.add(n.mul(h))).x.div(h), 0.0, 1.0))
    })
    ao.assign(ao.mul(0.25).mul(0.7).add(0.3))
    const fresnel = pow(clamp(dot(n, rd.negate()), 0.0, 1.0).oneMinus(), 3.0)
    const bandv = clamp(trapOut.mul(0.55), 0.0, 1.0)
    const base = mix(uPalA, uPalB, smoothstep(0.18, 0.95, bandv))
    const litRaw = base
      .mul(diff.mul(0.85).add(0.18))
      .add(uPalC.mul(fresnel).mul(0.55))
      .mul(ao)
    // distance fog into the background
    const lit = mix(litRaw, bg, clamp(t.mul(0.16), 0.0, 1.0).mul(0.85))

    const col = mix(missCol, lit, hit)
    // gentle tonemap + gamma-ish lift
    return vec4(pow(col.div(col.add(0.75)).mul(1.45), vec3(0.95)), 1.0)
  })

  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = shade()
  const scene = new THREE.Scene()
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // --- camera state & input ---
  const pos = new THREE.Vector3(0, 0.35, 3.4)
  let yaw = Math.PI // looking toward -z... forward computed below
  let pitch = -0.1
  let vel = 0
  let dragging = false
  let lastX = 0
  let lastY = 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    vel += -e.deltaY * 0.0011
    vel = Math.max(-2.4, Math.min(2.4, vel))
  }
  const onDown = (e: PointerEvent) => {
    dragging = true
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  const frame = (now: number) => {
    if (disposed) return
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    fps = fps * 0.92 + (dt > 0 ? 1 / dt : 0) * 0.08

    // orientation
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize()
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
    setPixelRatio(r: number) {
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
