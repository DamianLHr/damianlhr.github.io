import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import * as THREE from 'three'
import type { ThemeProps } from '../../shared/theme-contract'
import type { Project, SiteContent } from '../../content/types'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import { bakeSurface, loadWorld, type Surface, type World } from './world'
import { createScene, HEIGHT, PLANE, type Scene } from './scene'
import './watershed.css'

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

export function Root({ content, route, navigate }: ThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const [world, setWorld] = useState<{ world: World; surf: Surface } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [stats, setStats] = useState({ fps: 0, tris: 0, detail: 1 })
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
        console.error('watershed: could not load the world', e)
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
      setFailed('This device could not start WebGL.')
      return
    }
    sceneRef.current = s
    s.setAutoRotate(true)
    setReady(true)
    return () => {
      s.dispose()
      sceneRef.current = null
      setReady(false)
    }
  }, [world])

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
    return s.onFrame(() => {
      // panels are opaque glass; a marker underneath one is just noise
      const panel = document.querySelector('.ws-panel, .ws-hero')?.getBoundingClientRect()
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
        const show = out.visible && !hidden
        el.style.transform = `translate(${out.x}px, ${out.y}px) translate(-50%,-120%)`
        el.style.opacity = show ? '1' : '0'
        el.style.pointerEvents = show ? 'auto' : 'none'
      }
    })
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

  useEffect(() => {
    if (!ready || !showHud) return
    const t = window.setInterval(() => {
      const s = sceneRef.current?.stats()
      if (s) setStats(s)
    }, 500)
    return () => window.clearInterval(t)
  }, [ready, showHud])

  return (
    <div className="ws">
      <canvas ref={canvasRef} className="ws-canvas" />

      {!world && !failed && (
        <div className="ws-boot">
          <p>surveying the island…</p>
        </div>
      )}
      {failed && (
        <div className="ws-boot ws-fail">
          <p>{failed}</p>
          <p className="ws-dim">The Julia theme has you covered via the switcher.</p>
        </div>
      )}

      <div className="ws-markers" aria-hidden="true">
        {layout?.regions.map((r) => (
          <span
            key={`reg:${r.label}`}
            className="ws-region"
            ref={(el) => {
              if (el) markerRefs.current.set(`reg:${r.label}`, el)
              else markerRefs.current.delete(`reg:${r.label}`)
            }}
          >
            {r.label}
          </span>
        ))}
        {layout?.places.map((p) => (
          <span
            key={p.id}
            className={`ws-place ws-place-${p.kind}`}
            ref={(el) => {
              if (el) markerRefs.current.set(p.id, el)
              else markerRefs.current.delete(p.id)
            }}
            onClick={p.slug ? () => navigate(`/projects/${p.slug}`) : undefined}
            role={p.slug ? 'link' : undefined}
          >
            <i />
            {p.label}
          </span>
        ))}
      </div>

      <header className="ws-nav">
        <Link to="/" navigate={navigate} className="ws-mark">
          DH
        </Link>
        <nav aria-label="Sections">
          {TOP_LEVEL_ROUTES.filter((r) => r.path !== '/').map((r) => (
            <Link
              key={r.path}
              to={r.path}
              navigate={navigate}
              className={`ws-nav-link${path === r.path ? ' ws-on' : ''}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {home ? (
        <Hero content={content} navigate={navigate} basins={world?.world.meta.basins ?? 0} />
      ) : (
        <section className="ws-panel ws-rise" key={path}>
          {route.kind === 'cv' && <Cv content={content} navigate={navigate} />}
          {route.kind === 'projects' && <Projects content={content} navigate={navigate} />}
          {route.kind === 'project' && (
            <ProjectSheet content={content} slug={route.slug} navigate={navigate} />
          )}
          {route.kind === 'interests' && <Interests content={content} />}
          {route.kind === 'notFound' && <NotFound path={path} navigate={navigate} />}
        </section>
      )}

      {showHud && (
        <aside className="ws-hud">
          {stats.fps} fps · {(stats.tris / 1000).toFixed(0)}k tris · detail {stats.detail}
        </aside>
      )}
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
  const focus = (route: ThemeProps['route']) => {
    if (route.kind === 'project') {
      const p = places.find((q) => q.slug === route.slug)
      if (p) return { point: pt(p.gx, p.gy, p.h), distance: PLANE * 0.28 }
    }
    if (route.kind === 'cv') {
      const r = regions[1] ?? regions[0]
      if (r) return { point: pt(r.gx, r.gy, r.h), distance: PLANE * 0.5 }
    }
    if (route.kind === 'projects') {
      const ps = places.filter((p) => p.kind === 'project')
      if (ps.length) {
        const gx = ps.reduce((s, p) => s + p.gx, 0) / ps.length
        const gy = ps.reduce((s, p) => s + p.gy, 0) / ps.length
        const h = ps.reduce((s, p) => s + p.h, 0) / ps.length
        return { point: pt(gx, gy, h), distance: PLANE * 0.55 }
      }
    }
    if (route.kind === 'interests') {
      const ps = places.filter((p) => p.kind === 'interest')
      if (ps.length) {
        const gx = ps.reduce((s, p) => s + p.gx, 0) / ps.length
        const gy = ps.reduce((s, p) => s + p.gy, 0) / ps.length
        const h = ps.reduce((s, p) => s + p.h, 0) / ps.length
        return { point: pt(gx, gy, h), distance: PLANE * 0.5 }
      }
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
    <section className="ws-hero ws-rise">
      <p className="ws-eyebrow">{content.profile.tagline}</p>
      <h1>
        Damyan
        <br />
        Hristov
      </h1>
      <p className="ws-lede">
        Games, engines and experimental graphics. Computer Science and Engineering at TU/e, class of
        2027.
      </p>
      <p className="ws-note">
        This island was not drawn. Rain fell on noise, cut {basins} watersheds, and left the valleys
        you are looking at — drag to orbit, scroll to close in.
      </p>
      <div className="ws-socials">
        {content.profile.socials.map((s) => (
          <a key={s.url} href={s.url}>
            {s.label}
          </a>
        ))}
      </div>
      {content.announcements.length > 0 && (
        <Link to="/projects" navigate={navigate} className="ws-ticker">
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
      <h2 className="ws-h2">Education</h2>
      {cv.education.map((e) => (
        <article className="ws-entry" key={e.school}>
          <h3>{e.program}</h3>
          <p className="ws-meta">
            {e.school} · {e.location} · {e.start} to {e.end}
          </p>
          <ul>
            {e.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}
      <h2 className="ws-h2">Experience</h2>
      {cv.experience.map((e) => (
        <article className="ws-entry" key={e.company}>
          <h3>
            {e.role} · {e.company}
          </h3>
          <p className="ws-meta">
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
            <a className="ws-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}
      <h2 className="ws-h2">Plans</h2>
      <p className="ws-prose">{cv.plans}</p>
      <h2 className="ws-h2">Proficiencies</h2>
      <p className="ws-prose">
        {cv.proficiencies.spoken.map((s) => `${s.language} (${s.level})`).join(' · ')}
      </p>
      {[...cv.proficiencies.programming, ...cv.proficiencies.expanding].map((p) => (
        <article className="ws-entry" key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.evidence}</p>
          <p className="ws-meta">
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
        <div className="ws-upnext">
          <p className="ws-upnext-tag">Up next</p>
          {content.announcements.map((a) => (
            <article key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      )}
      <div className="ws-list">
        {released.map((p) => (
          <Link key={p.slug} to={`/projects/${p.slug}`} navigate={navigate} className="ws-card">
            <span className="ws-chip">{CHIP[p.category]}</span>
            <span className="ws-card-title">{p.title}</span>
            <span className="ws-meta">{[p.year, p.event, p.role].filter(Boolean).join(' · ')}</span>
            <span className="ws-card-sum">{p.summary}</span>
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
      <Link to="/projects" navigate={navigate} className="ws-back">
        ← all projects
      </Link>
      <h1>{project.title}</h1>
      <dl className="ws-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="ws-prose">{project.summary}</p>
      {project.team?.members && <p className="ws-meta">with {project.team.members.join(', ')}</p>}
      <div className="ws-actions">
        {project.links.map((l, i) => (
          <a key={l.url} href={l.url} className={i === 0 ? 'ws-btn ws-btn-primary' : 'ws-btn'}>
            {l.label}
          </a>
        ))}
        {project.links.length === 0 && <p className="ws-meta">links land here once it ships</p>}
      </div>
    </>
  )
}

function Interests({ content }: { content: SiteContent }) {
  return (
    <>
      <h1>Interests</h1>
      {content.interests.map((section) => (
        <article className="ws-entry" key={section.id}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          {section.links.map((l) => (
            <a className="ws-out" key={l.url} href={l.url}>
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
      <p className="ws-meta">{path} is not on this island.</p>
      <div className="ws-actions">
        <Link to="/" navigate={navigate} className="ws-btn ws-btn-primary">
          Back to the coast
        </Link>
      </div>
    </>
  )
}
