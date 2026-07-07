import { useEffect, useRef } from 'react'
import { renderJulia, type JuliaParams } from './fractal'

interface Props {
  params: JuliaParams
  className?: string
}

/** Renders a Julia set into a canvas sized by CSS; re-renders on resize (debounced). */
export function FractalCanvas({ params, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let timer: number | undefined
    const draw = () => renderJulia(canvas, params)
    const raf = requestAnimationFrame(draw)
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(draw, 160)
    })
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [params])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
