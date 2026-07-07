import { useEffect, useRef } from 'react'
import { renderJulia, type JuliaParams } from './fractal'

// Live fractal engine (emil rules applied): pointer tracking is eased with
// spring-like smoothing, morph frames render at reduced resolution and sharpen
// once motion settles, everything goes still under prefers-reduced-motion.
//
// live modes:
//   'still' — one crisp render (+ resize re-render)
//   'bloom' — blooms into place on mount (zoom + constant settle), then still
//   'hover' — bloom + morphs toward a nearby constant on fine-pointer hover
//   'hero'  — bloom + ambient drift + follows the pointer across the window;
//             drift fades after a few idle seconds and the set sharpens

type LiveMode = 'still' | 'bloom' | 'hover' | 'hero'

interface Props {
  params: JuliaParams
  className?: string
  live?: LiveMode
}

export function FractalCanvas({ params, className, live = 'still' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const animated = live !== 'still' && !reduced

    const cur = { dre: 0, dim: 0, spanMul: 1 }
    const tgt = { dre: 0, dim: 0 }
    const drift = { dre: 0, dim: 0 }
    let raf = 0
    let running = false
    let disposed = false
    let sharp = false
    let lastInput = performance.now()
    let resizeTimer: number | undefined
    const motionQuality = live === 'hero' ? 0.3 : 0.55

    const draw = (quality: number) => {
      renderJulia(
        canvas,
        {
          ...params,
          re: params.re + cur.dre,
          im: params.im + cur.dim,
          span: (params.span ?? 3.0) * cur.spanMul,
          maxIter: quality < 1 ? 100 : params.maxIter,
        },
        quality,
      )
    }

    const settled = () =>
      Math.abs(tgt.dre + drift.dre - cur.dre) < 0.0006 &&
      Math.abs(tgt.dim + drift.dim - cur.dim) < 0.0006 &&
      Math.abs(1 - cur.spanMul) < 0.004

    const loop = (t: number) => {
      if (disposed) return
      if (live === 'hero' && finePointer) {
        const idle = t - lastInput
        const amp = idle < 4000 ? 1 : Math.max(0, 1 - (idle - 4000) / 1500)
        drift.dre = Math.sin(t * 0.00012) * 0.015 * amp
        drift.dim = Math.cos(t * 0.00009) * 0.015 * amp
      }
      cur.dre += (tgt.dre + drift.dre - cur.dre) * 0.1
      cur.dim += (tgt.dim + drift.dim - cur.dim) * 0.1
      cur.spanMul += (1 - cur.spanMul) * 0.1
      const heroActive = live === 'hero' && finePointer && t - lastInput < 5600
      if (settled() && !heroActive) {
        cur.spanMul = 1
        draw(1)
        sharp = true
        running = false
        return
      }
      sharp = false
      draw(motionQuality)
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
      const first = requestAnimationFrame(() => draw(1))
      raf = first
    }

    // --- input wiring ---
    const onPointer = (e: PointerEvent) => {
      lastInput = performance.now()
      tgt.dre = (e.clientX / window.innerWidth - 0.5) * 0.05
      tgt.dim = (e.clientY / window.innerHeight - 0.5) * 0.04
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
    if (animated && live === 'hero' && finePointer) {
      window.addEventListener('pointermove', onPointer, { passive: true })
    }
    if (animated && live === 'hover' && finePointer) {
      const host = canvas.parentElement ?? canvas
      host.addEventListener('mouseenter', onEnter)
      host.addEventListener('mouseleave', onLeave)
    }

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (!running) draw(sharp || !animated ? 1 : motionQuality)
      }, 160)
    })
    observer.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onPointer)
      const host = canvas.parentElement ?? canvas
      host.removeEventListener('mouseenter', onEnter)
      host.removeEventListener('mouseleave', onLeave)
      observer.disconnect()
    }
  }, [params, live])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
