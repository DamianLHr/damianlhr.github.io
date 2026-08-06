import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Surface, World } from './world'
import { forest, posterise, FRESH_LINEAR, SEABED_LINEAR, SEA_LINEAR } from './world'

// watershed — the renderer.
//
// A displaced heightmap under an orbiting camera. Deliberately the opposite cost
// profile to the singularity theme: that raymarched a fractal per pixel every
// frame, this uploads static geometry once and then only moves a camera. Colour,
// sun and occlusion are baked into vertex colours, so the terrain needs no lit
// material and no shadow pass — plain WebGL 2, no WebGPU required.

export const PLANE = 100
export const HEIGHT = 21

/**
 * Render small, then let CSS blow it up with nearest-neighbour — the look of
 * the reference engine. Antialiasing is off on purpose: smoothed edges are
 * exactly what stops a low-resolution buffer reading as pixel art.
 */
const PIXEL_SCALE = 0.34

/** Sky at the zenith and at the waterline. The water colours live in world.ts. */
const SKY_TOP = '#b7c8d8'
const SKY_HORIZON = '#8fb0c4'

/** Linear triple → a Color in the same working space the vertex colours use. */
const linear = (rgb: [number, number, number]) => {
  const p = posterise(rgb)
  return new THREE.Color().setRGB(p[0], p[1], p[2])
}

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
      antialias: false,
      powerPreference: 'high-performance',
    })
  } catch (e) {
    console.error('watershed: WebGL unavailable', e)
    return null
  }
  renderer.setPixelRatio(PIXEL_SCALE)

  const size = world.size
  const detail = Math.max(1, Math.round(opts.detail ?? 1))
  const N = Math.floor((size - 1) / detail) + 1

  const scene = new THREE.Scene()

  // A flat clear colour leaves a hard seam where the ocean meets the sky.
  //
  // This has to be a *dome*, not `scene.background`: a background texture is
  // stretched over the whole viewport, so its gradient tracks the screen rather
  // than the world and the horizon tone lands wherever the camera happens to
  // point. Mapping it onto an inverted sphere pins the transition to the actual
  // waterline, and the band below it is the sea's own colour, so ocean and sky
  // meet in the same value. The fog is tinted to match, so distant water
  // dissolves upward instead of ending at a line.
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 4
  skyCanvas.height = 256
  {
    const g = skyCanvas.getContext('2d')!
    // Drawn in discrete steps rather than a smooth ramp, so the sky bands the
    // same way the posterised ground does and the whole image reads as one
    // piece. `getStyle()` converts the linear water colours to sRGB for the 2D
    // canvas, which is the one place the conversion genuinely belongs.
    const grad = g.createLinearGradient(0, 0, 0, 256)
    // canvas top is v = 1 (zenith); bottom is v = 0 (below the horizon)
    grad.addColorStop(0, SKY_TOP)
    grad.addColorStop(0.42, SKY_HORIZON)
    grad.addColorStop(0.5, SKY_HORIZON)
    grad.addColorStop(0.56, linear(SEA_LINEAR).getStyle())
    grad.addColorStop(1, linear(SEABED_LINEAR).getStyle())
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
    const px = g.getImageData(0, 0, 4, 256)
    for (let i = 0; i < px.data.length; i += 4) {
      px.data[i] = Math.round((px.data[i] / 255) * 11) * (255 / 11)
      px.data[i + 1] = Math.round((px.data[i + 1] / 255) * 11) * (255 / 11)
      px.data[i + 2] = Math.round((px.data[i + 2] / 255) * 11) * (255 / 11)
    }
    g.putImageData(px, 0, 0)
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas)
  skyTex.colorSpace = THREE.SRGBColorSpace
  // nearest keeps the bands hard instead of smoothing them back out
  skyTex.magFilter = THREE.NearestFilter
  skyTex.minFilter = THREE.NearestFilter
  const skyGeo = new THREE.SphereGeometry(PLANE * 5, 24, 24)
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  })
  const skydome = new THREE.Mesh(skyGeo, skyMat)
  skydome.renderOrder = -1
  scene.add(skydome)
  scene.fog = new THREE.Fog(new THREE.Color(SKY_HORIZON).getHex(), PLANE * 1.1, PLANE * 3.6)

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
  // Sit the seabed flush with the terrain's lowest point. Parking it far below
  // left a cliff at the mesh boundary — the ocean visibly dropped a step where
  // the island's data ended.
  let floor = Infinity
  for (let i = 0; i < world.height.length; i++) if (world.height[i] < floor) floor = world.height[i]
  const bedGeo = new THREE.PlaneGeometry(PLANE * 24, PLANE * 24)
  const bedMat = new THREE.MeshBasicMaterial({ color: linear(SEABED_LINEAR), fog: true })
  const seabed = new THREE.Mesh(bedGeo, bedMat)
  seabed.rotation.x = -Math.PI / 2
  seabed.position.y = floor * HEIGHT
  scene.add(seabed)

  const seaGeo = new THREE.PlaneGeometry(PLANE * 24, PLANE * 24)
  const seaMat = new THREE.MeshBasicMaterial({
    color: linear(SEA_LINEAR),
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    // The waterline is coplanar with the beach, so the two surfaces resolve to
    // the same depth and shimmer against each other as the camera moves. The
    // offset pushes the water a hair forward and settles it.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const sea = new THREE.Mesh(seaGeo, seaMat)
  sea.rotation.x = -Math.PI / 2
  sea.position.y = world.seaLevel * HEIGHT
  sea.renderOrder = 1
  scene.add(sea)

  // --- lakes -----------------------------------------------------------------
  // Standing water the drainage left in its hollows. Each cell gets a quad at
  // its own filled level rather than one shared plane — these sit at whatever
  // height their basin brimmed to, hundreds of units apart up the mountain, and
  // a single plane could only ever be right for one of them. Same material as
  // the sea, so tarn and ocean are visibly the same substance.
  // Fresh water is its own material, and a pale, bright one. In the reference
  // the river network is the first thing the eye lands on; tinting the bed
  // alone left it as a faint thread that the pixel downscale swallowed.
  const freshMat = new THREE.MeshBasicMaterial({
    color: linear(FRESH_LINEAR),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
  let lakeMesh: THREE.Mesh | null = null
  {
    const cells: number[] = []
    for (let i = 0; i < world.lake.length; i++) if (world.lake[i] > 0) cells.push(i)
    // Rivers get a surface too, not just a tinted bed. Anything carrying a real
    // share of the flow and standing above the waterline.
    const riverCells: number[] = []
    for (let i = 0; i < world.discharge.length; i++) {
      if (world.lake[i] > 0) continue
      if (world.height[i] < world.seaLevel) continue
      // Only a real channel gets a surface. The discharge map is normalised
      // against a quarter of the run's peak, so a low bar here puts water on
      // every trickle and the hillsides come out sheeted in pale blue.
      if (world.discharge[i] > 0.34) riverCells.push(i)
    }
    for (const i of riverCells) cells.push(i)
    if (cells.length > 0) {
      const pos = new Float32Array(cells.length * 4 * 3)
      const idx = new Uint32Array(cells.length * 6)
      const corner = new THREE.Vector3()
      cells.forEach((i, k) => {
        const gx = i % size
        const gy = (i / size) | 0
        // a lake brims to its spill level; a river just skims its own bed
        const level = world.lake[i] > 0 ? world.height[i] + world.lake[i] : world.height[i] + 0.0012
        const quad = [
          [gx - 0.5, gy - 0.5],
          [gx + 0.5, gy - 0.5],
          [gx + 0.5, gy + 0.5],
          [gx - 0.5, gy + 0.5],
        ]
        quad.forEach(([qx, qy], c) => {
          corner.copy(toWorld(qx, qy, level, size))
          const o = (k * 4 + c) * 3
          pos[o] = corner.x
          pos[o + 1] = corner.y
          pos[o + 2] = corner.z
        })
        const v = k * 4
        const t = k * 6
        idx[t] = v
        idx[t + 1] = v + 2
        idx[t + 2] = v + 1
        idx[t + 3] = v
        idx[t + 4] = v + 3
        idx[t + 5] = v + 2
      })
      const lakeGeo = new THREE.BufferGeometry()
      lakeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      lakeGeo.setIndex(new THREE.BufferAttribute(idx, 1))
      lakeMesh = new THREE.Mesh(lakeGeo, freshMat)
      lakeMesh.renderOrder = 2
      scene.add(lakeMesh)
    }
  }

  // --- trees -----------------------------------------------------------------
  // The reference is *forested* — a near-continuous canopy with bare ground
  // showing through only where the slope is too steep to hold it. Scattered
  // trees on open grass was the wrong picture entirely, so this runs many more
  // of them and lets them close up into cover.
  const trees = forest(world, surf, detail > 1 ? 12000 : 22000)
  let treeMesh: THREE.InstancedMesh | null = null
  if (trees.length > 0) {
    const cell = PLANE / (size - 1)
    const trunk = new THREE.CylinderGeometry(cell * 0.22, cell * 0.3, cell * 1.3, 4)
    trunk.translate(0, cell * 0.65, 0)
    const crown = new THREE.ConeGeometry(cell * 1.25, cell * 3.2, 6)
    crown.translate(0, cell * 2.5, 0)
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
      // A stand of one flat green reads as a texture rather than as woodland.
      // Each tree gets a deterministic blend between a cold, dark conifer and a
      // warmer broadleaf, pulled colder as it climbs — so the uplands go dark
      // and the valley woods stay warm, and the treeline reads as a change in
      // species rather than a change in brightness. Kept narrow on purpose: at
      // this pixel size anything wider turns the forest into confetti.
      const hash = ((Math.imul(i + 1, 2654435761) >>> 9) & 2047) / 2047
      const climb = Math.max(0, Math.min(1, (t.h - world.seaLevel) / 0.3))
      const warmth = Math.max(0, Math.min(1, hash * 0.7 + (1 - climb) * 0.5 - 0.2))
      // darker and less saturated than before — the reference canopy is nearly
      // black-green in shadow, which is what lets the bare ground read as bright
      const tc = posterise([
        (0.028 + 0.055 * warmth) * shade,
        (0.062 + 0.05 * warmth) * shade,
        (0.022 - 0.008 * warmth) * shade,
      ])
      col.setRGB(tc[0], tc[1], tc[2])
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

    // Ride the dome along with the camera, or the far plane eats a hole in the
    // sky. Parked at the origin, its far side sits `radius + cameraDistance`
    // away — past `camera.far` as soon as the camera backs off the island — and
    // the clipped facets read as a black lozenge hanging over the horizon.
    // Only x/z follow: the centre stays at y = 0 so the gradient's horizon band
    // keeps meeting the water exactly where it does now.
    skydome.position.set(camera.position.x, 0, camera.position.z)

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
    // expose the graph so a headless review can toggle pieces to isolate a bug
    ;(w as unknown as { __wsScene?: unknown }).__wsScene = {
      scene,
      camera,
      controls,
      terrain,
      sea,
      seabed,
      skydome,
      get trees() {
        return treeMesh
      },
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
      lakeMesh?.geometry.dispose()
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
