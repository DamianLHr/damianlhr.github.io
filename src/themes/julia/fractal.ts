// Julia-set renderer for the julia theme — 2D canvas, no GPU, floor-friendly.
// Direction A "obsidian gallery": ember palette on near-black (Gate 2a).

export interface JuliaParams {
  re: number
  im: number
  /** viewport scale, higher = more zoomed out (default 3.0) */
  span?: number
  maxIter?: number
  /** where the set is centered in the canvas, 0..1 (default 0.5/0.5) */
  centerX?: number
  centerY?: number
}

/** Curated constants that render well — indexed by content seed/slug so every
 * project keeps a stable fractal identity (its art-DNA fallback). */
export const C_POOL: JuliaParams[] = [
  { re: -0.7269, im: 0.1889 },
  { re: -0.8, im: 0.156 },
  { re: 0.285, im: 0.01, span: 2.6 },
  { re: -0.4, im: 0.6 },
  { re: -0.70176, im: -0.3842 },
  { re: -0.835, im: -0.2321 },
  { re: 0.35, im: 0.35, span: 2.6 },
  { re: -0.54, im: 0.54 },
]

export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function paramsFor(slug: string, seed?: number): JuliaParams {
  const index = (seed ?? hashString(slug)) % C_POOL.length
  return C_POOL[index]
}

// Heated ember stops (accent #ff6a00 family)
const EMBER: [number, number, number][] = [
  [10, 11, 13],
  [70, 12, 16],
  [188, 38, 22],
  [255, 106, 0],
  [255, 178, 92],
  [255, 236, 200],
]

function ember(v: number): [number, number, number] {
  const t = Math.min(0.999, Math.max(0, v)) * (EMBER.length - 1)
  const i = Math.floor(t)
  const f = t - i
  const a = EMBER[i]
  const b = EMBER[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** Renders the set. `quality` scales the internal resolution (1 = crisp, ~0.3 =
 * fast morph frame that the browser upscales — used while animating). */
export function renderJulia(canvas: HTMLCanvasElement, params: JuliaParams, quality = 1): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25) * quality
  const rect = canvas.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const w = (canvas.width = Math.max(2, Math.round(rect.width * dpr)))
  const h = (canvas.height = Math.max(2, Math.round(rect.height * dpr)))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(w, h)
  const { re, im } = params
  const max = params.maxIter ?? 150
  const scale = (params.span ?? 3.0) / Math.min(w, h)
  const cx = w * (params.centerX ?? 0.5)
  const cy = h * (params.centerY ?? 0.5)
  let p = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let zr = (x - cx) * scale
      let zi = (y - cy) * scale
      let i = 0
      while (i < max && zr * zr + zi * zi < 16) {
        const t = zr * zr - zi * zi + re
        zi = 2 * zr * zi + im
        zr = t
        i++
      }
      let c: [number, number, number]
      if (i === max) {
        // interior: faint ember-tinged depth instead of a flat void
        const v2 = Math.min(4, zr * zr + zi * zi)
        c = [14 + v2 * 9, 8 + v2 * 3, 9 + v2 * 1.5]
      } else {
        c = ember(((i - Math.log2(Math.log2(zr * zr + zi * zi))) / max) * 2.2)
      }
      img.data[p++] = c[0]
      img.data[p++] = c[1]
      img.data[p++] = c[2]
      img.data[p++] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
