import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ThemeProps } from '../../shared/theme-contract'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import { createBulb, type Bulb, type BulbPalette } from './bulb'
import './spike.css'

// Phase 3 prototype (PLAN GATE 3): proves the raymarched Mandelbulb dive and
// measures it on real hardware. Not the final singularity theme — the HUD exists
// exactly to read fps per backend/resolution. ?webgl forces the WebGL 2 tier.

const PALETTES: Record<string, BulbPalette> = {
  home: { a: [0.16, 0.04, 0.03], b: [1.0, 0.42, 0.0], c: [1.0, 0.91, 0.78] },
  cv: { a: [0.02, 0.04, 0.12], b: [0.16, 0.35, 1.0], c: [0.85, 0.92, 1.0] },
  projects: { a: [0.1, 0.02, 0.12], b: [0.75, 0.2, 1.0], c: [1.0, 0.8, 0.5] },
  project: { a: [0.1, 0.02, 0.12], b: [0.75, 0.2, 1.0], c: [1.0, 0.8, 0.5] },
  interests: { a: [0.02, 0.08, 0.05], b: [0.1, 0.75, 0.45], c: [1.0, 0.85, 0.4] },
  notFound: { a: [0.16, 0.04, 0.03], b: [1.0, 0.42, 0.0], c: [1.0, 0.91, 0.78] },
}

const DPRS = [0.75, 1, 1.5, 2]

export function Root({ content, route, navigate }: ThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bulbRef = useRef<Bulb | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio || 1, 1.5))
  const [stats, setStats] = useState({ fps: 0, backend: '…', width: 0, height: 0, dist: 0 })

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return
    void createBulb(canvas).then((bulb) => {
      if (cancelled || !bulb) {
        if (!bulb) setFailed(true)
        bulb?.dispose()
        return
      }
      bulbRef.current = bulb
      setReady(true)
    })
    return () => {
      cancelled = true
      bulbRef.current?.dispose()
      bulbRef.current = null
    }
  }, [])

  useEffect(() => {
    bulbRef.current?.setPalette(PALETTES[route.kind] ?? PALETTES.home)
  }, [route, ready])

  useEffect(() => {
    if (!ready) return
    const timer = window.setInterval(() => {
      const s = bulbRef.current?.stats()
      if (s) setStats(s)
    }, 500)
    return () => window.clearInterval(timer)
  }, [ready])

  const pickDpr = (r: number) => {
    setDpr(r)
    bulbRef.current?.setPixelRatio(r)
  }

  const onNav = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    e.preventDefault()
    navigate(to)
  }
  const path = routePath(route)

  return (
    <div className="spike">
      <canvas ref={canvasRef} className="spike-canvas" />
      {failed && (
        <div className="spike-fail">
          <p>The renderer could not start on this device.</p>
          <p>The Julia theme has you covered via the switcher.</p>
        </div>
      )}
      <div className="spike-hud">
        <p className="spike-title">singularity · phase 3 spike</p>
        <p className="spike-line">
          {stats.fps} fps · {stats.backend} · {stats.width}×{stats.height}
        </p>
        <p className="spike-line">surface distance {stats.dist.toExponential(1)}</p>
        <div className="spike-dprs" role="group" aria-label="Resolution scale">
          {DPRS.map((r) => (
            <button
              key={r}
              type="button"
              className={r === dpr ? 'spike-on' : undefined}
              onClick={() => pickDpr(r)}
            >
              {r}×
            </button>
          ))}
        </div>
        <p className="spike-hint">scroll to dive · drag to look · route links recolor the bulb</p>
        <nav aria-label="Routes">
          {TOP_LEVEL_ROUTES.map((r) => (
            <a
              key={r.path}
              href={r.path}
              aria-current={path === r.path ? 'page' : undefined}
              onClick={(e) => onNav(e, r.path)}
            >
              {r.label}
            </a>
          ))}
        </nav>
      </div>
      {content.announcements.length > 0 && (
        <p className="spike-upnext">
          up next · {content.announcements.map((a) => a.title).join(' · ')}
        </p>
      )}
    </div>
  )
}
