import { useEffect, useRef } from 'react'
import { renderJulia, type JuliaParams } from './fractal'
import { createGlJulia } from './fractal-gl'

// Live fractal engine. WebGL2 renders full resolution every frame (no pixelation,
// ever, on GPU-capable devices); the CPU path is the true floor fallback and uses
// low-res morph frames that sharpen at rest. Pointer tracking is eased, hold-click
// dives into the set, and everything goes still under prefers-reduced-motion.
//
// live modes:
//   'still' — one crisp render (+ resize re-render)
//   'bloom' — blooms into place on mount (zoom + constant settle), then still
//   'hover' — bloom + morphs toward a nearby constant while the host is hovered
//   'hero'  — bloom + ambient drift + pointer follow + hold-click dive

type LiveMode = 'still' | 'bloom' | 'hover' | 'hero'

interface Props {
  params: JuliaParams
  className?: string
  live?: LiveMode
  /** closest() selector for the hover host, e.g. 'a' to react to the whole card */
  hoverHost?: string
  /** set false to skip WebGL (e.g. many low-opacity washes on one page) */
  gl?: boolean
}

export function FractalCanvas({ params, className, live = 'still', hoverHost, gl = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const animated = live !== 'still' && !reduced
    // ?cpufractal forces the CPU floor path (QA tool for the fallback rendering)
    const forceCpu = new URLSearchParams(window.location.search).has('cpufractal')
    const glr = gl && !forceCpu ? createGlJulia(canvas) : null

    const cur = { dre: 0, dim: 0, spanMul: 1 }
    const tgt = { dre: 0, dim: 0, spanMul: 1 }
    const drift = { dre: 0, dim: 0 }
    let raf = 0
    let running = false
    let disposed = false
    let sharp = false
    let lastInput = performance.now()
    let resizeTimer: number | undefined
    const cpuMotionQuality = live === 'hero' ? 0.3 : 0.55

    const draw = (final: boolean) => {
      const p = {
        ...params,
        re: params.re + cur.dre,
        im: params.im + cur.dim,
        span: (params.span ?? 3.0) * cur.spanMul,
      }
      if (glr) {
        glr.render(p)
      } else {
        renderJulia(canvas, { ...p, maxIter: final ? params.maxIter : 100 }, final ? 1 : cpuMotionQuality)
      }
    }

    const settled = () =>
      Math.abs(tgt.dre + drift.dre - cur.dre) < 0.0006 &&
      Math.abs(tgt.dim + drift.dim - cur.dim) < 0.0006 &&
      Math.abs(tgt.spanMul - cur.spanMul) < 0.004

    const loop = (t: number) => {
      if (disposed) return
      if (live === 'hero' && finePointer) {
        const idle = t - lastInput
        const amp = idle < 4000 ? 1 : Math.max(0, 1 - (idle - 4000) / 1500)
        drift.dre = Math.sin(t * 0.00012) * 0.015 * amp
        drift.dim = Math.cos(t * 0.00009) * 0.015 * amp
      }
      cur.dre += (tgt.dre + drift.dre - cur.dre) * 0.14
      cur.dim += (tgt.dim + drift.dim - cur.dim) * 0.14
      cur.spanMul += (tgt.spanMul - cur.spanMul) * 0.14
      const heroActive = live === 'hero' && finePointer && t - lastInput < 5600
      if (settled() && !heroActive) {
        cur.spanMul = tgt.spanMul
        draw(true)
        sharp = true
        running = false
        return
      }
      sharp = false
      draw(false)
      raf = requestAnimationFrame(loop)
    }

    const wake = () => {
      if (!running && !disposed) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }

    // --- initial state ---
    if (animated) {
      cur.spanMul = 1.5
      cur.dre = -0.025
      wake()
    } else {
      raf = requestAnimationFrame(() => draw(true))
    }

    // --- input wiring ---
    const onPointer = (e: PointerEvent) => {
      lastInput = performance.now()
      tgt.dre = (e.clientX / window.innerWidth - 0.5) * 0.075
      tgt.dim = (e.clientY / window.innerHeight - 0.5) * 0.06
      wake()
    }
    const onDown = () => {
      lastInput = performance.now()
      tgt.spanMul = 0.72
      wake()
    }
    const onUp = () => {
      lastInput = performance.now()
      tgt.spanMul = 1
      wake()
    }
    const onEnter = () => {
      tgt.dre = 0.03
      tgt.dim = -0.025
      wake()
    }
    const onLeave = () => {
      tgt.dre = 0
      tgt.dim = 0
      wake()
    }
    const host = (hoverHost ? canvas.closest(hoverHost) : canvas.parentElement) ?? canvas
    if (animated && live === 'hero' && finePointer) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      window.addEventListener('pointerdown', onDown)
      window.addEventListener('pointerup', onUp)
    }
    if (animated && live === 'hover' && finePointer) {
      host.addEventListener('mouseenter', onEnter)
      host.addEventListener('mouseleave', onLeave)
    }

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (!running) draw(sharp || !animated)
      }, 160)
    })
    observer.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      host.removeEventListener('mouseenter', onEnter)
      host.removeEventListener('mouseleave', onLeave)
      observer.disconnect()
      glr?.dispose()
    }
  }, [params, live, hoverHost, gl])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
