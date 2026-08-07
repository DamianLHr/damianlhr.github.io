import type { Surface, World } from './world'

// A top-down shaded relief of the same island, drawn with a 2D context.
//
// This is the theme's floor: no WebGL, no mesh, no instancing. The colours are
// the ones `bakeSurface` already worked out — sun, occlusion and material are
// all folded in per cell — so the fallback is the same island seen from above
// rather than a different, poorer picture of it.
//
// It earns its place twice: it is what a device without WebGL 2 gets, and it is
// what everyone gets if the GL context is lost mid-session.

const toSRGB = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

/** Paint the island into `canvas`, sized to fill it while keeping the map square. */
export function drawRelief(canvas: HTMLCanvasElement, world: World, surf: Surface): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = world.size

  // Build the map at its own resolution, then scale — the browser's own
  // sampling is faster and better than doing it per pixel here.
  const off = document.createElement('canvas')
  off.width = s
  off.height = s
  const octx = off.getContext('2d')
  if (!octx) return
  const img = octx.createImageData(s, s)
  for (let i = 0; i < s * s; i++) {
    const o = i * 4
    img.data[o] = Math.round(Math.min(1, Math.max(0, toSRGB(surf.colors[i * 3]))) * 255)
    img.data[o + 1] = Math.round(Math.min(1, Math.max(0, toSRGB(surf.colors[i * 3 + 1]))) * 255)
    img.data[o + 2] = Math.round(Math.min(1, Math.max(0, toSRGB(surf.colors[i * 3 + 2]))) * 255)
    img.data[o + 3] = 255
  }
  octx.putImageData(img, 0, 0)

  const w = canvas.width
  const h = canvas.height
  ctx.imageSmoothingEnabled = false
  // cover the canvas, cropping the shorter axis rather than distorting the map
  const scale = Math.max(w / s, h / s)
  const dw = s * scale
  const dh = s * scale
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(off, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/** Where a grid cell lands in canvas pixels, matching `drawRelief`'s framing. */
export function reliefPoint(
  canvas: HTMLCanvasElement,
  size: number,
  gx: number,
  gy: number,
): { x: number; y: number } {
  const scale = Math.max(canvas.width / size, canvas.height / size)
  return {
    x: (canvas.width - size * scale) / 2 + gx * scale,
    y: (canvas.height - size * scale) / 2 + gy * scale,
  }
}
