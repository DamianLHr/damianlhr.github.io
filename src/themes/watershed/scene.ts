import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Surface, World } from './world'
import { forest } from './world'

// watershed — the renderer.
//
// A displaced heightmap under an orbiting camera. Deliberately the opposite cost
// profile to the singularity theme: that raymarched a fractal per pixel every
// frame, this uploads static geometry once and then only moves a camera. Colour,
// sun and occlusion are baked into vertex colours, so the terrain needs no lit
// material and no shadow pass — plain WebGL 2, no WebGPU required.

export const PLANE = 100
export const HEIGHT = 21

export interface SceneOpts {
  /** 1 = full heightmap resolution, 2 = every other cell, … */
  detail?: number
  reducedMotion?: boolean
}

export interface Marker {
  id: string
  pos: THREE.Vector3
}

export interface Scene {
  dispose: () => void
  resize: () => void
  /** world position → normalised screen coords, or null when behind the camera */
  project: (p: THREE.Vector3, out: { x: number; y: number; visible: boolean }) => void
  worldPointAt: (gx: number, gy: number, h: number) => THREE.Vector3
  flyTo: (target: THREE.Vector3, distance: number, instant?: boolean) => void
  /** register a per-frame callback; returns an unsubscribe */
  onFrame: (cb: () => void) => () => void
  stats: () => { fps: number; tris: number; detail: number }
  setAutoRotate: (on: boolean) => void
  /**
   * Push the rendered subject away from an overlay, as a fraction of the
   * viewport. The interface is a fixed panel over a fixed canvas, so without
   * this the island simply sits underneath it.
   */
  setFraming: (dx: number, dy: number) => void
}

/** grid coords → world space */
function toWorld(gx: number, gy: number, h: number, size: number): THREE.Vector3 {
  return new THREE.Vector3(
    (gx / (size - 1) - 0.5) * PLANE,
    h * HEIGHT,
    (gy / (size - 1) - 0.5) * PLANE,
  )
}

export function createScene(
  canvas: HTMLCanvasElement,
  world: World,
  surf: Surface,
  opts: SceneOpts = {},
): Scene | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
  } catch (e) {
    console.error('watershed: WebGL unavailable', e)
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setClearColor(0xbcc9d6)

  const size = world.size
  const detail = Math.max(1, Math.round(opts.detail ?? 1))
  const N = Math.floor((size - 1) / detail) + 1

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xbcc9d6, PLANE * 0.9, PLANE * 2.1)

  // --- terrain ---------------------------------------------------------------
  const positions = new Float32Array(N * N * 3)
  const colors = new Float32Array(N * N * 3)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const gx = Math.min(size - 1, i * detail)
      const gy = Math.min(size - 1, j * detail)
      const src = gy * size + gx
      const dst = j * N + i
      positions[dst * 3] = (gx / (size - 1) - 0.5) * PLANE
      positions[dst * 3 + 1] = world.height[src] * HEIGHT
      positions[dst * 3 + 2] = (gy / (size - 1) - 0.5) * PLANE
      colors[dst * 3] = surf.colors[src * 3]
      colors[dst * 3 + 1] = surf.colors[src * 3 + 1]
      colors[dst * 3 + 2] = surf.colors[src * 3 + 2]
    }
  }
  const quads = (N - 1) * (N - 1)
  const index = new Uint32Array(quads * 6)
  let q = 0
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i
      const b = a + 1
      const c = a + N
      const d = c + 1
      index[q++] = a
      index[q++] = c
      index[q++] = b
      index[q++] = b
      index[q++] = c
      index[q++] = d
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeBoundingSphere()
  const terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true })
  const terrain = new THREE.Mesh(geo, terrainMat)
  scene.add(terrain)

  // --- sea -------------------------------------------------------------------
  // Reaches well past the island so the horizon is water, not a cut edge.
  // An opaque seabed sits under the translucent surface. Without it the water
  // composites over the terrain on the island's shelf but over empty sky beyond
  // the mesh edge, and that difference draws a hard diagonal across the ocean.
  const bedGeo = new THREE.PlaneGeometry(PLANE * 24, PLANE * 24)
  const bedMat = new THREE.MeshBasicMaterial({ color: 0x14283f })
  const seabed = new THREE.Mesh(bedGeo, bedMat)
  seabed.rotation.x = -Math.PI / 2
  seabed.position.y = -HEIGHT * 0.5
  scene.add(seabed)

  const seaGeo = new THREE.PlaneGeometry(PLANE * 24, PLANE * 24)
  const seaMat = new THREE.MeshBasicMaterial({
    color: 0x2f5f86,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  })
  const sea = new THREE.Mesh(seaGeo, seaMat)
  sea.rotation.x = -Math.PI / 2
  sea.position.y = world.seaLevel * HEIGHT
  sea.renderOrder = 1
  scene.add(sea)

  // --- trees -----------------------------------------------------------------
  const trees = forest(world, surf, 9000)
  let treeMesh: THREE.InstancedMesh | null = null
  if (trees.length > 0) {
    const cell = PLANE / (size - 1)
    const trunk = new THREE.CylinderGeometry(cell * 0.16, cell * 0.22, cell * 1.1, 4)
    trunk.translate(0, cell * 0.55, 0)
    const crown = new THREE.ConeGeometry(cell * 0.85, cell * 2.6, 6)
    crown.translate(0, cell * 2.1, 0)
    const treeGeo = mergeGeometries([trunk, crown])
    // Per-instance colour only reaches the fragment stage when USE_COLOR is
    // defined, so the geometry needs a (white) vertex-colour attribute for
    // instanceColor to multiply into. Without it the tint silently disappears.
    const white = new Float32Array(treeGeo.getAttribute('position').count * 3).fill(1)
    treeGeo.setAttribute('color', new THREE.BufferAttribute(white, 3))
    const treeMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, trees.length)
    treeMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    const m = new THREE.Matrix4()
    const col = new THREE.Color()
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]
      const p = toWorld(t.x, t.y, t.h, size)
      m.makeScale(t.scale, t.scale * (0.85 + (i % 5) * 0.07), t.scale)
      m.setPosition(p)
      treeMesh.setMatrixAt(i, m)
      // shade each tree by the ground's occlusion so groves darken in valleys
      const gi = Math.min(size - 1, Math.round(t.y)) * size + Math.min(size - 1, Math.round(t.x))
      const shade = 0.5 + 0.6 * surf.ao[gi]
      col.setRGB(0.1 * shade, (0.2 + (i % 7) * 0.012) * shade, 0.085 * shade)
      treeMesh.setColorAt(i, col)
    }
    treeMesh.instanceMatrix.needsUpdate = true
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true
    treeMesh.frustumCulled = false
    scene.add(treeMesh)
  }

  // --- camera ----------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, PLANE * 6)
  camera.position.set(PLANE * 0.62, PLANE * 0.46, PLANE * 0.72)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.rotateSpeed = 0.55
  controls.zoomSpeed = 0.8
  controls.minDistance = PLANE * 0.12
  controls.maxDistance = PLANE * 1.9
  // never let the camera drop under the sea or look straight down
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI * 0.46
  controls.target.set(0, HEIGHT * 0.22, 0)
  controls.autoRotateSpeed = 0.35
  controls.update()

  const framing = { dx: 0, dy: 0 }
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // a negative x offset slides the rendered content to the right
    camera.setViewOffset(w, h, -framing.dx * w, -framing.dy * h, w, h)
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  // --- flight ----------------------------------------------------------------
  const flight = {
    active: false,
    t: 0,
    dur: 1.5,
    fromT: new THREE.Vector3(),
    toT: new THREE.Vector3(),
    fromD: 0,
    toD: 0,
  }
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

  // --- loop ------------------------------------------------------------------
  let raf = 0
  let disposed = false
  let last = performance.now()
  let fps = 0
  const frameCbs: (() => void)[] = []

  const frame = (now: number) => {
    if (disposed) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    fps = fps * 0.92 + (dt > 0 ? 1 / dt : 0) * 0.08

    if (flight.active) {
      flight.t = Math.min(1, flight.t + dt / flight.dur)
      const k = easeInOut(flight.t)
      controls.target.lerpVectors(flight.fromT, flight.toT, k)
      const dist = flight.fromD + (flight.toD - flight.fromD) * k
      const dir = camera.position.clone().sub(controls.target).normalize()
      camera.position.copy(controls.target).addScaledVector(dir, dist)
      if (flight.t >= 1) flight.active = false
    }

    controls.update()
    renderer.render(scene, camera)
    for (const cb of frameCbs) cb()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  // Dev QA hook: a hidden window never fires rAF, so preview tooling can pump
  // frames by hand. Not part of the theme contract.
  if (import.meta.env.DEV) {
    const w = window as unknown as {
      __wsStep?: (n?: number) => void
      __shoot?: (name: string, width?: number) => Promise<string>
    }
    w.__wsStep = (n = 1) => {
      for (let i = 0; i < n; i++) {
        cancelAnimationFrame(raf)
        frame(performance.now())
      }
    }
    // hand the rendered frame to the dev server (see vite.config.ts) so a
    // headless review can actually look at what the GPU produced
    w.__shoot = async (name, width = 1280) => {
      w.__wsStep?.(1)
      const off = document.createElement('canvas')
      off.width = width
      off.height = Math.round((width * canvas.height) / canvas.width)
      off.getContext('2d')?.drawImage(canvas, 0, 0, off.width, off.height)
      const res = await fetch('/__shot', {
        method: 'POST',
        body: JSON.stringify({ name, dataUrl: off.toDataURL('image/png') }),
      })
      return res.text()
    }
  }

  const projV = new THREE.Vector3()
  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      geo.dispose()
      terrainMat.dispose()
      seaGeo.dispose()
      seaMat.dispose()
      bedGeo.dispose()
      bedMat.dispose()
      treeMesh?.geometry.dispose()
      ;(treeMesh?.material as THREE.Material | undefined)?.dispose()
      renderer.dispose()
    },
    resize,
    /**
     * World point → CSS pixels within the canvas. Deliberately pixels rather
     * than container-query units: those need the container to have a definite
     * size, and a `min-height` root silently resolves `cqh` to zero, which
     * collapses every marker onto one line.
     */
    project(p, out) {
      projV.copy(p).project(camera)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      out.x = (projV.x * 0.5 + 0.5) * w
      out.y = (-projV.y * 0.5 + 0.5) * h
      out.visible = projV.z < 1 && out.x > -60 && out.x < w + 60 && out.y > -40 && out.y < h + 40
    },
    worldPointAt: (gx, gy, h) => toWorld(gx, gy, h, size),
    flyTo(target, distance, instant = false) {
      if (instant || opts.reducedMotion) {
        controls.target.copy(target)
        const dir = camera.position.clone().sub(controls.target).normalize()
        camera.position.copy(target).addScaledVector(dir, distance)
        flight.active = false
        return
      }
      flight.fromT.copy(controls.target)
      flight.toT.copy(target)
      flight.fromD = camera.position.distanceTo(controls.target)
      flight.toD = distance
      flight.t = 0
      flight.active = true
    },
    onFrame(cb) {
      frameCbs.push(cb)
      return () => {
        const i = frameCbs.indexOf(cb)
        if (i >= 0) frameCbs.splice(i, 1)
      }
    },
    stats: () => ({ fps: Math.round(fps), tris: quads * 2, detail }),
    setAutoRotate(on) {
      controls.autoRotate = on && !opts.reducedMotion
    },
    setFraming(dx, dy) {
      framing.dx = dx
      framing.dy = dy
      resize()
    },
  }
}

/** Minimal geometry merge — avoids pulling in the BufferGeometryUtils example. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0
  let iCount = 0
  for (const g of geos) {
    vCount += g.getAttribute('position').count
    iCount += g.getIndex()?.count ?? g.getAttribute('position').count
  }
  const pos = new Float32Array(vCount * 3)
  const idx = new Uint32Array(iCount)
  let vo = 0
  let io = 0
  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    pos.set(p.array as Float32Array, vo * 3)
    const gi = g.getIndex()
    if (gi) {
      for (let k = 0; k < gi.count; k++) idx[io++] = gi.getX(k) + vo
    } else {
      for (let k = 0; k < p.count; k++) idx[io++] = k + vo
    }
    vo += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  return out
}
