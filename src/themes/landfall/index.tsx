import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import type { ThemeProps } from '../../shared/theme-contract'
import type { Project, SiteContent } from '../../content/types'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import { bakeSurface, loadWorld, type Surface, type World } from './world'
import { createScene, HEIGHT, PLANE, type Scene } from './scene'
import { drawRelief, reliefPoint } from './relief2d'
import './landfall.css'

// landfall — the eroded island, settled.
//
// Forked from `watershed` on 2026-08-07, which stays exactly as it is: that one
// is approved-looking and reachable at ?theme=watershed, and nothing here is
// allowed to regress it. This is where the island gains the things people bring
// — roads worn between the towns, boats working the coast and the navigable
// reaches, settlements sized by how good their ground actually is, and a turning
// year. Both themes read the same baked world, so the simulation stays the one
// source of truth and this one simply asks more questions of it.
//
// (Original header follows.)
// watershed — the CV as an eroded island (PLAN Phase 6).
//
// The land is not decoration: a particle hydraulic-erosion simulation runs at
// build time (scripts/watershed) and this theme reads its output. Rivers are
// where water actually ran, valleys are what it actually cut, and the drainage
// basins it carved are the provinces the CV is laid out across — so every
// boundary on the map was decided by the terrain rather than drawn onto it.
//
// ?hud shows fps / triangle count.

interface Place {
  id: string
  label: string
  kind: 'school' | 'work' | 'project' | 'interest'
  gx: number
  gy: number
  h: number
  basin: number
  slug?: string
  note?: string
}

interface Region {
  basin: number
  label: string
  gx: number
  gy: number
  h: number
}

function Link({
  to,
  navigate,
  className,
  children,
  current,
}: {
  to: string
  navigate: ThemeProps['navigate']
  className?: string
  children: ReactNode
  current?: boolean
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    navigate(to)
  }
  return (
    <a
      href={to}
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
    </a>
  )
}

const KEYS_SEEN = 'lf:keys-seen'

export function Root({ content, route, navigate }: ThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flatRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const [world, setWorld] = useState<{ world: World; surf: Surface } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  /** no WebGL 2, or the context went away — the island falls back to flat relief */
  const [flat, setFlat] = useState(false)
  const [stats, setStats] = useState({ fps: 0, tris: 0, detail: 1 })
  /** which place the keyboard is standing on, and what to read out about it */
  const [cursor, setCursor] = useState(-1)
  const [announce, setAnnounce] = useState('')
  const [showKeys, setShowKeys] = useState(false)
  const showHud = new URLSearchParams(window.location.search).has('hud')
  const path = routePath(route)
  const home = route.kind === 'home'

  // --- load the baked world ---
  useEffect(() => {
    let cancelled = false
    void loadWorld()
      .then((w) => {
        if (cancelled) return
        setWorld({ world: w, surf: bakeSurface(w) })
      })
      .catch((e) => {
        console.error('landfall: could not load the world', e)
        if (!cancelled) setFailed('The island could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // --- content laid onto the terrain ---
  const layout = useMemo(() => {
    if (!world) return null
    return layoutContent(world.world, content)
  }, [world, content])

  // --- scene ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !world) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // coarse pointers are usually weaker GPUs; halve the mesh there
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const s = createScene(canvas, world.world, world.surf, {
      detail: coarse ? 2 : 1,
      reducedMotion: reduced,
    })
    if (!s) {
      // Not a dead end. The same island is drawn flat from the same baked
      // colours, and every route, panel and place still works.
      setFlat(true)
      return
    }
    sceneRef.current = s
    s.setAutoRotate(true)
    setReady(true)
    // A lost context used to leave a frozen canvas and no way forward.
    const onLost = (e: Event) => {
      e.preventDefault()
      sceneRef.current = null
      setReady(false)
      setFlat(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      s.dispose()
      sceneRef.current = null
      setReady(false)
    }
  }, [world])

  // --- flat fallback: the island from above, no GL ---
  useEffect(() => {
    if (!flat || !world) return
    const canvas = flatRef.current
    if (!canvas) return
    const paint = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      drawRelief(canvas, world.world, world.surf)
      // markers sit on the map by grid position rather than by projection
      for (const [id, el] of markerRefs.current) {
        const p = layout?.places.find((q) => q.id === id)
        if (!p) {
          el.style.opacity = '0'
          continue
        }
        const at = reliefPoint(canvas, world.world.size, p.gx, p.gy)
        el.style.transform = `translate(${at.x / dpr}px, ${at.y / dpr}px) translate(-50%,-120%)`
        el.style.opacity = '1'
        el.style.pointerEvents = 'auto'
      }
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [flat, world, layout, cursor])

  // --- markers projected to screen every frame ---
  const markerRefs = useRef(new Map<string, HTMLElement>())
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !layout) return
    const out = { x: 0, y: 0, visible: false }
    // places already carry unique ids (edu:/exp:/prj:/int:); regions get their
    // own prefix so a basin label can never collide with a place
    const points = new Map<string, THREE.Vector3>([
      ...layout.places.map(
        (p) => [p.id, s.worldPointAt(p.gx, p.gy, p.h)] as [string, THREE.Vector3],
      ),
      ...layout.regions.map(
        (r) => [`reg:${r.label}`, s.worldPointAt(r.gx, r.gy, r.h)] as [string, THREE.Vector3],
      ),
    ])
    // Element sizes, measured once each. Reading offsetWidth per frame would
    // force a layout on every marker, every frame; the labels only change size
    // when the viewport does.
    const sizes = new Map<string, { w: number; h: number }>()
    const sizeOf = (id: string, el: HTMLElement) => {
      let s2 = sizes.get(id)
      if (!s2) {
        s2 = { w: el.offsetWidth, h: el.offsetHeight }
        if (s2.w > 0) sizes.set(id, s2)
      }
      return s2
    }
    const clearSizes = () => sizes.clear()
    window.addEventListener('resize', clearSizes)

    const stop = s.onFrame(() => {
      // panels are opaque glass; a marker underneath one is just noise
      const panel = document.querySelector('.lf-panel, .lf-hero')?.getBoundingClientRect()
      const placeBoxes: { l: number; r: number; t: number; b: number }[] = []

      for (const [id, el] of markerRefs.current) {
        const pt = points.get(id)
        if (!pt) continue
        s.project(pt, out)
        const hidden =
          !!panel &&
          out.x > panel.left - 8 &&
          out.x < panel.right + 8 &&
          out.y > panel.top - 8 &&
          out.y < panel.bottom + 8
        // never hide the place the keyboard is standing on: focus must not land
        // on something invisible
        const here = el.classList.contains('lf-here')
        const show = here || (out.visible && !hidden)
        el.style.transform = `translate(${out.x}px, ${out.y}px) translate(-50%,-120%)`
        el.style.opacity = show ? '1' : '0'
        el.style.pointerEvents = show ? 'auto' : 'none'
        // remember where the town labels landed — the province lettering has to
        // keep out of their way
        if (show && !id.startsWith('reg:')) {
          const { w, h } = sizeOf(id, el)
          placeBoxes.push({
            l: out.x - w / 2,
            r: out.x + w / 2,
            t: out.y - h * 1.2,
            b: out.y - h * 0.2,
          })
        }
      }

      // A province name is scenery; a town name is content. When the two collide
      // — and at this scale "THE WORKING BASIN" lands straight through Eindhoven
      // — the scenery is the one that gives way.
      for (const [id, el] of markerRefs.current) {
        if (!id.startsWith('reg:') || el.style.opacity === '0') continue
        const { w, h } = sizeOf(id, el)
        const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)
        if (!m) continue
        const x = parseFloat(m[1])
        const y = parseFloat(m[2])
        const box = { l: x - w / 2 - 10, r: x + w / 2 + 10, t: y - h * 1.2 - 6, b: y - h * 0.2 + 6 }
        const clash = placeBoxes.some(
          (p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t,
        )
        if (clash) el.style.opacity = '0'
      }
    })
    return () => {
      window.removeEventListener('resize', clearSizes)
      stop()
    }
  }, [ready, layout])

  // --- fly the camera to the region a route belongs to ---
  const mounted = useRef(false)
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !layout) return
    const target = layout.focus(route)
    s.setAutoRotate(route.kind === 'home')
    // home puts its card bottom-left, inner routes a panel on the right; shift
    // the island out from under whichever is showing (skip on narrow screens,
    // where panels are bottom sheets and the map keeps the upper band)
    const narrow = window.matchMedia('(max-width: 900px)').matches
    const isHome = route.kind === 'home'
    s.setFraming(narrow ? 0 : isHome ? 0.12 : -0.15, narrow ? -0.16 : 0)
    s.flyTo(target.point, target.distance, !mounted.current)
    mounted.current = true
  }, [route, ready, layout])

  // --- travelling the island by keyboard ---
  //
  // A map is hostile to anyone who cannot see it, and the places on this one
  // were markers with a click handler: unreachable by tab, unannounced, and
  // therefore not really content at all. The places are now one roving tab stop
  // — arrows walk the island, Enter opens what is there, and the camera sails to
  // whatever the cursor lands on, so a sighted keyboard user follows the same
  // journey a mouse would take.
  const places = layout?.places ?? []
  const placeAt = (i: number) => places[((i % places.length) + places.length) % places.length]

  const describe = (p: Place) => {
    const kind =
      p.kind === 'school'
        ? 'place of study'
        : p.kind === 'work'
          ? 'workplace'
          : p.kind === 'project'
            ? 'project'
            : 'interest'
    const region = layout?.regions.find((r) => r.basin === p.basin)
    const where = region ? ` in ${region.label.toLowerCase()}` : ' on the coast'
    const note = p.note ? `. ${p.note}` : ''
    return `${p.label}, ${kind}${where}${note}${p.slug ? '. Press Enter to open.' : ''}`
  }

  const goTo = (i: number) => {
    if (!places.length) return
    const next = ((i % places.length) + places.length) % places.length
    setCursor(next)
    const p = places[next]
    setAnnounce(describe(p))
    // A roving tab stop only works if focus actually moves with the cursor,
    // otherwise the arrows shuffle a highlight while the screen reader stays
    // parked on whatever was tabbed to first.
    markerRefs.current.get(p.id)?.focus()
    const s = sceneRef.current
    if (s) s.flyTo(s.worldPointAt(p.gx, p.gy, p.h), PLANE * 0.34)
  }

  /** Returns true when the key was one of ours and has been dealt with. */
  const travelKey = (k: string, preventDefault: () => void) => {
    if (!places.length) return false
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ']') {
      preventDefault()
      goTo(cursor + 1)
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === '[') {
      preventDefault()
      goTo(cursor - 1)
    } else if (k === 'Home') {
      preventDefault()
      goTo(0)
    } else if (k === 'End') {
      preventDefault()
      goTo(places.length - 1)
    } else if (k === 'Enter' || k === ' ') {
      const p = placeAt(cursor)
      if (cursor < 0 || !p?.slug) return false
      preventDefault()
      navigate(`/projects/${p.slug}`)
    } else if (k === 'Escape') {
      setCursor(-1)
      setAnnounce('Left the island map.')
    } else {
      return false
    }
    return true
  }

  const onMapKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault()
      setShowKeys(true)
      return
    }
    travelKey(e.key, () => e.preventDefault())
  }

  // Once you have stepped onto the island the keys keep working wherever focus
  // happens to be. Binding them only to the marker group meant that anything
  // which dropped focus — closing the key guide, most obviously — silently took
  // the controls away with it, and the arrows did nothing at all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setShowKeys(true)
        return
      }
      // the guide owns the keyboard while it is open
      if (showKeys) return
      // don't steal the arrows from someone reading a panel who never came here
      if (cursor < 0) return
      // the group's own handler already dealt with it
      if (t?.closest('.lf-markers')) return
      travelKey(e.key, () => e.preventDefault())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The first time someone arrives here by keyboard, say what the keys are —
  // controls nobody can discover are the same as no controls.
  const onMapFocus = () => {
    if (cursor < 0 && places.length) goTo(0)
    try {
      if (!localStorage.getItem(KEYS_SEEN)) {
        setShowKeys(true)
        localStorage.setItem(KEYS_SEEN, '1')
      }
    } catch {
      /* private mode: showing the hint every time is the harmless side */
    }
  }

  useEffect(() => {
    if (!ready || !showHud) return
    const t = window.setInterval(() => {
      const s = sceneRef.current?.stats()
      if (s) setStats(s)
    }, 500)
    return () => window.clearInterval(t)
  }, [ready, showHud])

  return (
    <div className="lf">
      {!flat && <canvas ref={canvasRef} className="lf-canvas" />}
      {flat && <canvas ref={flatRef} className="lf-canvas lf-flat" aria-hidden="true" />}

      {!world && !failed && (
        <div className="lf-boot">
          <p>surveying the island…</p>
        </div>
      )}
      {failed && (
        <div className="lf-boot lf-fail">
          <p>{failed}</p>
          <p className="lf-dim">The Julia theme has you covered via the switcher.</p>
        </div>
      )}

      <div
        className="lf-markers"
        role="group"
        aria-label="Places on the island — use the arrow keys to travel between them"
        onKeyDown={onMapKeyDown}
        onFocus={onMapFocus}
      >
        {/* province lettering is scenery: it repeats what the places already say */}
        {layout?.regions.map((r) => (
          <span
            key={`reg:${r.label}`}
            className="lf-region"
            aria-hidden="true"
            ref={(el) => {
              if (el) markerRefs.current.set(`reg:${r.label}`, el)
              else markerRefs.current.delete(`reg:${r.label}`)
            }}
          >
            {r.label}
          </span>
        ))}
        {layout?.places.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`lf-place lf-place-${p.kind}${i === cursor ? ' lf-here' : ''}`}
            // one tab stop for the whole island; the arrows do the walking
            tabIndex={i === cursor || (cursor < 0 && i === 0) ? 0 : -1}
            aria-current={i === cursor ? 'true' : undefined}
            ref={(el) => {
              if (el) markerRefs.current.set(p.id, el)
              else markerRefs.current.delete(p.id)
            }}
            onFocus={() => {
              if (i !== cursor) goTo(i)
            }}
            onClick={() => {
              setCursor(i)
              if (p.slug) navigate(`/projects/${p.slug}`)
              else goTo(i)
            }}
          >
            <i aria-hidden="true" />
            {p.label}
            <span className="lf-sr">{` — ${describe(p)}`}</span>
          </button>
        ))}
      </div>

      {/* what the arrows just did, for anyone not watching the camera */}
      <p className="lf-sr" role="status" aria-live="polite">
        {announce}
      </p>

      <header className="lf-nav">
        <Link to="/" navigate={navigate} className="lf-mark">
          DH
        </Link>
        {/* One row of chrome, not two. A floating pill in a corner collided
            with the hero card on the landing and with the panel everywhere
            else — there is no corner that is free on every route, so the
            control belongs in the bar that already exists. */}
        <div className="lf-nav-right">
          <nav aria-label="Sections">
            {TOP_LEVEL_ROUTES.filter((r) => r.path !== '/').map((r) => (
              <Link
                key={r.path}
                to={r.path}
                navigate={navigate}
                className={`lf-nav-link${path === r.path ? ' lf-on' : ''}`}
              >
                {r.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="lf-keys-open"
            onClick={() => setShowKeys(true)}
            aria-haspopup="dialog"
          >
            <kbd aria-hidden="true">?</kbd>
            <span>Travel by keyboard</span>
          </button>
        </div>
      </header>

      {home ? (
        <Hero content={content} navigate={navigate} basins={world?.world.meta.basins ?? 0} />
      ) : (
        <section className="lf-panel lf-rise" key={path}>
          {route.kind === 'cv' && <Cv content={content} navigate={navigate} />}
          {route.kind === 'projects' && <Projects content={content} navigate={navigate} />}
          {route.kind === 'project' && (
            <ProjectSheet content={content} slug={route.slug} navigate={navigate} />
          )}
          {route.kind === 'interests' && <Interests content={content} />}
          {route.kind === 'notFound' && <NotFound path={path} navigate={navigate} />}
        </section>
      )}

      {showKeys && (
        <KeyGuide
          flat={flat}
          onClose={() => {
            setShowKeys(false)
            // Hand the keyboard back to the island. Closing used to drop focus
            // on the body, which is exactly where the arrow keys go to die.
            goTo(cursor < 0 ? 0 : cursor)
          }}
        />
      )}

      {showHud && (
        <aside className="lf-hud">
          {stats.fps} fps · {(stats.tris / 1000).toFixed(0)}k tris · detail {stats.detail}
        </aside>
      )}
    </div>
  )
}

/**
 * How to travel the island without a mouse.
 *
 * Shown the first time the map takes keyboard focus, and reachable afterwards
 * from a button that is always in the tab order — a control nobody can find is
 * the same as no control.
 */
function KeyGuide({ onClose, flat }: { onClose: () => void; flat: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="lf-keys-back" onClick={onClose}>
      <div
        className="lf-keys"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lf-keys-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lf-keys-title">Travelling the island</h2>
        <p className="lf-dim">
          The island is a map of the CV: schools, workplaces, projects and interests each sit in a
          real place on it. Everything here is reachable without a mouse.
        </p>
        <dl className="lf-keys-list">
          <div>
            <dt>
              <kbd>Tab</kbd>
            </dt>
            <dd>step onto the island</dd>
          </div>
          <div>
            <dt>
              <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
            </dt>
            <dd>travel to the next place; the camera sails with you</dd>
          </div>
          <div>
            <dt>
              <kbd>Enter</kbd>
            </dt>
            <dd>open the project you are standing on</dd>
          </div>
          <div>
            <dt>
              <kbd>Home</kbd> <kbd>End</kbd>
            </dt>
            <dd>first and last place</dd>
          </div>
          <div>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>leave the map</dd>
          </div>
          <div>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>bring this back</dd>
          </div>
        </dl>
        {flat && (
          <p className="lf-dim">
            This device is drawing the island flat, from above — the 3D view needs WebGL 2. Every
            place, route and page works exactly the same.
          </p>
        )}
        <p className="lf-dim">
          Prefer to read rather than travel? The CV, projects and interests pages hold the same
          content as plain text.
        </p>
        <button type="button" ref={closeRef} className="lf-keys-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

// --- content layout -----------------------------------------------------------

interface Layout {
  places: Place[]
  regions: Region[]
  focus: (route: ThemeProps['route']) => { point: THREE.Vector3; distance: number }
}

/**
 * Hand the content to the island.
 *
 * Schools and employers take the best town sites, projects the next best, and
 * interests the outlying ones. Each falls in whichever drainage basin the
 * terrain put beneath it, and the two largest basins become the provinces the CV
 * is described by — boundaries the water decided, not the layout.
 */
function layoutContent(world: World, content: SiteContent): Layout {
  const size = world.size
  const sites = world.meta.sites.map((s) => ({
    gx: s.x * size,
    gy: s.y * size,
    h: s.h,
    basin: s.basin,
  }))

  // The bake returns sites best-score-first, so taking them in order drops all
  // the content into the same handful of good valleys and the labels pile up.
  // Farthest-point sampling instead: keep the best site, then repeatedly take
  // whichever remaining site is furthest from everything already placed.
  const remaining = [...sites]
  const ordered: typeof sites = []
  if (remaining.length) ordered.push(remaining.shift()!)
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = -1
    remaining.forEach((cand, i) => {
      let nearest = Infinity
      for (const p of ordered) {
        const d = Math.hypot(cand.gx - p.gx, cand.gy - p.gy)
        if (d < nearest) nearest = d
      }
      if (nearest > bestDist) {
        bestDist = nearest
        bestIdx = i
      }
    })
    ordered.push(remaining.splice(bestIdx, 1)[0])
  }
  let cursor = 0
  const next = () => ordered[Math.min(ordered.length - 1, cursor++)]

  const places: Place[] = []
  for (const e of content.cv.education) {
    const s = next()
    places.push({
      id: `edu:${e.school}`,
      label: e.location.split(',')[0].trim(),
      kind: 'school',
      note: e.program,
      ...s,
    })
  }
  for (const e of content.cv.experience) {
    const s = next()
    places.push({
      id: `exp:${e.company}`,
      label: e.company.split('(')[0].trim(),
      kind: 'work',
      note: e.role,
      ...s,
    })
  }
  for (const p of content.projects.filter((p) => p.status === 'released')) {
    const s = next()
    places.push({ id: `prj:${p.slug}`, label: p.title, kind: 'project', slug: p.slug, ...s })
  }
  for (const s of content.interests) {
    const site = next()
    places.push({ id: `int:${s.id}`, label: s.title, kind: 'interest', ...site })
  }

  // provinces: the basins that actually hold the career
  const byBasin = new Map<number, Place[]>()
  for (const p of places) {
    if (p.basin < 0) continue
    const list = byBasin.get(p.basin) ?? []
    list.push(p)
    byBasin.set(p.basin, list)
  }
  const ranked = [...byBasin.entries()].sort((a, b) => b[1].length - a[1].length)
  const regions: Region[] = ranked.slice(0, 2).map(([basin, members], i) => {
    const gx = members.reduce((s, m) => s + m.gx, 0) / members.length
    const gy = members.reduce((s, m) => s + m.gy, 0) / members.length
    const h = members.reduce((s, m) => s + m.h, 0) / members.length
    return { basin, label: i === 0 ? 'THE WORKING BASIN' : 'THE LEARNING BASIN', gx, gy, h }
  })

  const pt = (gx: number, gy: number, h: number) =>
    new THREE.Vector3((gx / (size - 1) - 0.5) * PLANE, h * HEIGHT, (gy / (size - 1) - 0.5) * PLANE)

  const centre = pt(size / 2, size / 2, 0.34)

  /**
   * Averaging a group's positions puts the camera wherever their centroid falls
   * — which, for places spread deliberately around the island, is usually open
   * water in the middle. Aim at a real member of the group instead: the one
   * nearest the group's centre, which is always on land and always somewhere
   * the visitor can see the thing they navigated to.
   */
  const representative = (kind: Place['kind']) => {
    const group = places.filter((p) => p.kind === kind)
    if (!group.length) return null
    const cx = group.reduce((s, p) => s + p.gx, 0) / group.length
    const cy = group.reduce((s, p) => s + p.gy, 0) / group.length
    return group.reduce((best, p) =>
      Math.hypot(p.gx - cx, p.gy - cy) < Math.hypot(best.gx - cx, best.gy - cy) ? p : best,
    )
  }

  const focus = (route: ThemeProps['route']) => {
    if (route.kind === 'project') {
      const p = places.find((q) => q.slug === route.slug)
      if (p) return { point: pt(p.gx, p.gy, p.h), distance: PLANE * 0.3 }
    }
    if (route.kind === 'cv') {
      const p = representative('school') ?? representative('work')
      if (p) return { point: pt(p.gx, p.gy, p.h), distance: PLANE * 0.62 }
    }
    if (route.kind === 'projects') {
      const p = representative('project')
      if (p) return { point: pt(p.gx, p.gy, p.h), distance: PLANE * 0.72 }
    }
    if (route.kind === 'interests') {
      const p = representative('interest')
      if (p) return { point: pt(p.gx, p.gy, p.h), distance: PLANE * 0.62 }
    }
    return { point: centre, distance: PLANE * 1.05 }
  }

  return { places, regions, focus }
}

// --- views --------------------------------------------------------------------

function Hero({
  content,
  navigate,
  basins,
}: {
  content: SiteContent
  navigate: ThemeProps['navigate']
  basins: number
}) {
  return (
    <section className="lf-hero lf-rise">
      <p className="lf-eyebrow">{content.profile.tagline}</p>
      <h1>
        Damyan
        <br />
        Hristov
      </h1>
      <p className="lf-lede">
        Games, engines and experimental graphics. Computer Science and Engineering at TU/e, class of
        2027.
      </p>
      <p className="lf-note">
        This island was not drawn. Rain fell on noise, cut {basins} watersheds, and left the valleys
        you are looking at — drag to orbit, scroll to close in.
      </p>
      <div className="lf-socials">
        {content.profile.socials.map((s) => (
          <a key={s.url} href={s.url}>
            {s.label}
          </a>
        ))}
      </div>
      {content.announcements.length > 0 && (
        <Link to="/projects" navigate={navigate} className="lf-ticker">
          <b>UP NEXT</b> {content.announcements.map((a) => a.title).join(' · ')}
        </Link>
      )}
    </section>
  )
}

function Cv({ content, navigate }: { content: SiteContent; navigate: ThemeProps['navigate'] }) {
  const { cv } = content
  return (
    <>
      <h1>CV</h1>
      <h2 className="lf-h2">Education</h2>
      {cv.education.map((e) => (
        <article className="lf-entry" key={e.school}>
          <h3>{e.program}</h3>
          <p className="lf-meta">
            {e.school} · {e.location} · {e.start} to {e.end}
          </p>
          <ul>
            {e.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}
      <h2 className="lf-h2">Experience</h2>
      {cv.experience.map((e) => (
        <article className="lf-entry" key={e.company}>
          <h3>
            {e.role} · {e.company}
          </h3>
          <p className="lf-meta">
            {e.start} to {e.end}
            {e.teamSize ? ` · team of ~${e.teamSize}` : ''}
            {e.tools.length > 0 ? ` · ${e.tools.join(', ')}` : ''}
          </p>
          <p>{e.summary}</p>
          <ul>
            {e.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          {e.links.map((l) => (
            <a className="lf-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}
      <h2 className="lf-h2">Plans</h2>
      <p className="lf-prose">{cv.plans}</p>
      <h2 className="lf-h2">Proficiencies</h2>
      <p className="lf-prose">
        {cv.proficiencies.spoken.map((s) => `${s.language} (${s.level})`).join(' · ')}
      </p>
      {[...cv.proficiencies.programming, ...cv.proficiencies.expanding].map((p) => (
        <article className="lf-entry" key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.evidence}</p>
          <p className="lf-meta">
            proven by:{' '}
            {p.projectSlugs.map((slug, i) => (
              <span key={slug}>
                {i > 0 && ' · '}
                <Link to={`/projects/${slug}`} navigate={navigate}>
                  {content.projects.find((pr) => pr.slug === slug)?.title ?? slug}
                </Link>
              </span>
            ))}
          </p>
        </article>
      ))}
    </>
  )
}

const CHIP: Record<Project['category'], string> = {
  personal: 'personal',
  jam: 'game jam',
  university: 'university',
}

function Projects({
  content,
  navigate,
}: {
  content: SiteContent
  navigate: ThemeProps['navigate']
}) {
  const released = content.projects.filter((p) => p.status === 'released')
  return (
    <>
      <h1>Projects</h1>
      {content.announcements.length > 0 && (
        <div className="lf-upnext">
          <p className="lf-upnext-tag">Up next</p>
          {content.announcements.map((a) => (
            <article key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      )}
      <div className="lf-list">
        {released.map((p) => (
          <Link key={p.slug} to={`/projects/${p.slug}`} navigate={navigate} className="lf-card">
            <span className="lf-chip">{CHIP[p.category]}</span>
            <span className="lf-card-title">{p.title}</span>
            <span className="lf-meta">{[p.year, p.event, p.role].filter(Boolean).join(' · ')}</span>
            <span className="lf-card-sum">{p.summary}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

function ProjectSheet({
  content,
  slug,
  navigate,
}: {
  content: SiteContent
  slug: string
  navigate: ThemeProps['navigate']
}) {
  const project = content.projects.find((p) => p.slug === slug)
  if (!project) return <NotFound path={`/projects/${slug}`} navigate={navigate} />
  const facts: [string, string][] = []
  if (project.year) facts.push(['Year', String(project.year)])
  if (project.event) facts.push(['Where', project.event])
  if (project.role) facts.push(['Role', project.role])
  if (project.duration) facts.push(['Duration', project.duration])
  if (project.team?.size) facts.push(['Team', `${project.team.size} people`])
  if (project.tools.length > 0) facts.push(['Tools', project.tools.join(', ')])
  return (
    <>
      <Link to="/projects" navigate={navigate} className="lf-back">
        ← all projects
      </Link>
      <h1>{project.title}</h1>
      <dl className="lf-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="lf-prose">{project.summary}</p>
      {project.team?.members && <p className="lf-meta">with {project.team.members.join(', ')}</p>}
      <div className="lf-actions">
        {project.links.map((l, i) => (
          <a key={l.url} href={l.url} className={i === 0 ? 'lf-btn lf-btn-primary' : 'lf-btn'}>
            {l.label}
          </a>
        ))}
        {project.links.length === 0 && <p className="lf-meta">links land here once it ships</p>}
      </div>
    </>
  )
}

function Interests({ content }: { content: SiteContent }) {
  return (
    <>
      <h1>Interests</h1>
      {content.interests.map((section) => (
        <article className="lf-entry" key={section.id}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          {section.links.map((l) => (
            <a className="lf-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}
    </>
  )
}

function NotFound({ path, navigate }: { path: string; navigate: ThemeProps['navigate'] }) {
  return (
    <>
      <h1>Uncharted</h1>
      <p className="lf-meta">{path} is not on this island.</p>
      <div className="lf-actions">
        <Link to="/" navigate={navigate} className="lf-btn lf-btn-primary">
          Back to the coast
        </Link>
      </div>
    </>
  )
}
