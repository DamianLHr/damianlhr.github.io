import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { ThemeProps } from '../../shared/theme-contract'
import type { Project, SiteContent } from '../../content/types'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import { createBulb, type Bulb, type BulbPalette, type BulbPose } from './bulb'
import './singularity.css'

// singularity — the flagship theme (PLAN Phase 4). The site is one raymarched
// BoxFoldBulbPow2 world; navigation flies the camera between authored poses and
// recolors the set, content lives on obsidian glass panels over the dive.
// ?hud shows the perf HUD (fps/backend/resolution + DPR pinning).

interface SceneSpec {
  pose: BulbPose
  palette: BulbPalette
}

const EMBER: BulbPalette = { a: [0.16, 0.04, 0.03], b: [1.0, 0.42, 0.0], c: [1.0, 0.91, 0.78] }

const SCENES: Record<string, SceneSpec> = {
  // the approved landing mandala — at the shell mouth
  home: { pose: { pos: [0, 0.1, 1.75], yaw: Math.PI, pitch: -0.05 }, palette: EMBER },
  // calm high orbit, ice light — the subdued reading room
  cv: {
    pose: { pos: [0.9, 1.05, 1.9], yaw: 3.585, pitch: -0.464 },
    palette: { a: [0.02, 0.04, 0.12], b: [0.16, 0.35, 1.0], c: [0.85, 0.92, 1.0] },
  },
  // inside the ring city
  projects: {
    pose: { pos: [0, 0.25, 0.95], yaw: Math.PI, pitch: -0.18 },
    palette: { a: [0.1, 0.02, 0.12], b: [0.75, 0.2, 1.0], c: [1.0, 0.8, 0.5] },
  },
  // equatorial approach
  interests: {
    pose: { pos: [1.55, 0.15, 0.1], yaw: -Math.PI / 2, pitch: 0 },
    palette: { a: [0.02, 0.08, 0.05], b: [0.1, 0.75, 0.45], c: [1.0, 0.85, 0.4] },
  },
  // under the south pole, looking up into the folds
  notFound: { pose: { pos: [0, -1.6, 0.5], yaw: Math.PI, pitch: 1.266 }, palette: EMBER },
}

// per-project fractal identity: curated palettes + pose variations off the
// ring-city anchor, indexed by slug hash (art-DNA fallback like julia's C_POOL)
const PROJECT_PALETTES: BulbPalette[] = [
  EMBER,
  { a: [0.1, 0.02, 0.12], b: [0.75, 0.2, 1.0], c: [1.0, 0.8, 0.5] },
  { a: [0.02, 0.04, 0.12], b: [0.16, 0.35, 1.0], c: [0.85, 0.92, 1.0] },
  { a: [0.02, 0.08, 0.05], b: [0.1, 0.75, 0.45], c: [1.0, 0.85, 0.4] },
  { a: [0.12, 0.03, 0.05], b: [1.0, 0.18, 0.35], c: [1.0, 0.85, 0.75] },
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function projectScene(slug: string): SceneSpec {
  const h = hashString(slug)
  const yawOff = ((h % 7) / 7 - 0.5) * 1.4
  const depth = 0.5 + ((h >> 3) % 5) * 0.09
  return {
    pose: {
      pos: [Math.sin(yawOff) * 0.25, 0.1 + ((h >> 5) % 4) * 0.06, depth],
      yaw: Math.PI + yawOff * 0.6,
      pitch: -0.12,
    },
    palette: PROJECT_PALETTES[h % PROJECT_PALETTES.length],
  }
}

function sceneFor(route: ThemeProps['route']): SceneSpec {
  if (route.kind === 'project') return projectScene(route.slug)
  return SCENES[route.kind] ?? SCENES.home
}

const DPRS = [0.75, 1, 1.5, 2]

function InternalLink({
  to,
  navigate,
  className,
  children,
}: {
  to: string
  navigate: ThemeProps['navigate']
  className?: string
  children: ReactNode
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  )
}

export function Root({ content, route, navigate }: ThemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bulbRef = useRef<Bulb | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const showHud = new URLSearchParams(window.location.search).has('hud')
  const [dpr, setDpr] = useState<number | null>(null)
  const [stats, setStats] = useState({ fps: 0, backend: '…', width: 0, height: 0, dist: 0 })

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return
    // route is read once here on purpose: the mount pose must not re-create the bulb
    const start = sceneFor(route)
    void createBulb(canvas, start.pose).then((bulb) => {
      if (cancelled || !bulb) {
        if (!bulb) setFailed(true)
        bulb?.dispose()
        return
      }
      bulb.setPalette(start.palette)
      bulbRef.current = bulb
      setReady(true)
    })
    return () => {
      cancelled = true
      bulbRef.current?.dispose()
      bulbRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mounted = useRef(false)
  useEffect(() => {
    if (!ready) return
    const scene = sceneFor(route)
    // first ready-pass is the mount pose — no flight
    bulbRef.current?.flyTo(scene.pose, !mounted.current)
    if (mounted.current) bulbRef.current?.setPalette(scene.palette)
    mounted.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready])

  useEffect(() => {
    if (!ready || !showHud) return
    const timer = window.setInterval(() => {
      const s = bulbRef.current?.stats()
      if (s) setStats(s)
    }, 500)
    return () => window.clearInterval(timer)
  }, [ready, showHud])

  const pickDpr = (r: number) => {
    setDpr(r)
    bulbRef.current?.setPixelRatio(r)
  }

  const path = routePath(route)

  return (
    <div className="sing">
      <canvas ref={canvasRef} className="s-canvas" aria-hidden="true" />
      {failed && (
        <div className="s-fail s-panel">
          <p>This world needs a GPU the browser did not provide.</p>
          <p>The Julia theme has you covered via the switcher.</p>
        </div>
      )}

      <header className="s-nav">
        <InternalLink to="/" navigate={navigate} className="s-mark">
          DH
        </InternalLink>
        <nav aria-label="Sections">
          {TOP_LEVEL_ROUTES.filter((r) => r.path !== '/').map((r) => (
            <InternalLink
              key={r.path}
              to={r.path}
              navigate={navigate}
              className={`s-nav-link${path === r.path ? ' s-active' : ''}`}
            >
              {r.label}
            </InternalLink>
          ))}
        </nav>
      </header>

      {route.kind === 'home' && <Home content={content} navigate={navigate} />}
      {route.kind === 'cv' && <Cv content={content} navigate={navigate} />}
      {route.kind === 'projects' && <ProjectsIndex content={content} navigate={navigate} />}
      {route.kind === 'project' && (
        <ProjectPage content={content} slug={route.slug} navigate={navigate} />
      )}
      {route.kind === 'interests' && <Interests content={content} />}
      {route.kind === 'notFound' && <NotFound path={path} navigate={navigate} />}

      {showHud && (
        <aside className="s-hud" aria-label="Performance">
          <p>
            {stats.fps} fps · {stats.backend} · {stats.width}×{stats.height}
          </p>
          <p>surface distance {stats.dist.toExponential(1)}</p>
          <div role="group" aria-label="Resolution scale">
            {DPRS.map((r) => (
              <button
                key={r}
                type="button"
                className={r === dpr ? 's-on' : undefined}
                onClick={() => pickDpr(r)}
              >
                {r}×
              </button>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

function Home({ content, navigate }: { content: SiteContent; navigate: ThemeProps['navigate'] }) {
  return (
    <section className="s-home">
      <div className="s-home-copy s-enter">
        <p className="s-eyebrow">{content.profile.tagline}</p>
        <h1 className="s-title">
          Damyan
          <br />
          Hristov
        </h1>
        <p className="s-sub">
          Games, engines and experimental graphics. Computer Science and Engineering at TU/e,
          class of 2027.
        </p>
        <div className="s-socials">
          {content.profile.socials.map((s) => (
            <a key={s.url} href={s.url}>
              {s.label}
            </a>
          ))}
        </div>
        <p className="s-hint">scroll to dive · drag to look · links fly the camera</p>
      </div>
      {content.announcements.length > 0 && (
        <InternalLink to="/projects" navigate={navigate} className="s-ticker">
          <span className="s-ticker-tag">Up next</span>
          <span>{content.announcements.map((a) => a.title).join('  ·  ')}</span>
        </InternalLink>
      )}
    </section>
  )
}

function Panel({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <section className={`s-panel s-enter${wide ? ' s-panel-wide' : ''}`}>{children}</section>
  )
}

function Cv({ content, navigate }: { content: SiteContent; navigate: ThemeProps['navigate'] }) {
  const { cv } = content
  return (
    <Panel>
      <h1>CV</h1>
      <h2 className="s-h2">Education</h2>
      {cv.education.map((e) => (
        <article className="s-entry" key={e.school}>
          <h3>{e.program}</h3>
          <p className="s-meta">
            {e.school} · {e.location} · {e.start} to {e.end}
          </p>
          <ul>
            {e.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}
      <h2 className="s-h2">Experience</h2>
      {cv.experience.map((e) => (
        <article className="s-entry" key={e.company}>
          <h3>
            {e.role} · {e.company}
          </h3>
          <p className="s-meta">
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
            <a className="s-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}
      <h2 className="s-h2">Plans</h2>
      <p className="s-prose">{cv.plans}</p>
      <h2 className="s-h2">Proficiencies</h2>
      <p className="s-prose">
        {cv.proficiencies.spoken.map((s) => `${s.language} (${s.level})`).join(' · ')}
      </p>
      {[...cv.proficiencies.programming, ...cv.proficiencies.expanding].map((p) => (
        <article className="s-entry" key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.evidence}</p>
          <p className="s-meta">
            proven by:{' '}
            {p.projectSlugs.map((slug, i) => (
              <span key={slug}>
                {i > 0 && ' · '}
                <InternalLink to={`/projects/${slug}`} navigate={navigate}>
                  {content.projects.find((pr) => pr.slug === slug)?.title ?? slug}
                </InternalLink>
              </span>
            ))}
          </p>
        </article>
      ))}
    </Panel>
  )
}

const CHIP: Record<Project['category'], string> = {
  personal: 'personal',
  jam: 'game jam',
  university: 'university',
}

function ProjectsIndex({
  content,
  navigate,
}: {
  content: SiteContent
  navigate: ThemeProps['navigate']
}) {
  const released = content.projects.filter((p) => p.status === 'released')
  return (
    <Panel>
      <h1>Projects</h1>
      {content.announcements.length > 0 && (
        <div className="s-upnext">
          <p className="s-upnext-tag">Up next</p>
          {content.announcements.map((a) => (
            <article key={a.id}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      )}
      <div className="s-project-list">
        {released.map((p) => (
          <InternalLink
            key={p.slug}
            to={`/projects/${p.slug}`}
            navigate={navigate}
            className="s-project-card"
          >
            <span className="s-chip">{CHIP[p.category]}</span>
            <span className="s-card-title">{p.title}</span>
            <span className="s-meta">{[p.year, p.event, p.role].filter(Boolean).join(' · ')}</span>
            <span className="s-card-summary">{p.summary}</span>
          </InternalLink>
        ))}
      </div>
    </Panel>
  )
}

function ProjectPage({
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
    <Panel>
      <InternalLink to="/projects" navigate={navigate} className="s-back">
        &larr; all projects
      </InternalLink>
      <h1>{project.title}</h1>
      <dl className="s-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="s-prose">{project.summary}</p>
      {project.team?.members && <p className="s-meta">with {project.team.members.join(', ')}</p>}
      <div className="s-actions">
        {project.links.map((l, i) => (
          <a key={l.url} href={l.url} className={i === 0 ? 's-btn s-btn-primary' : 's-btn'}>
            {l.label}
          </a>
        ))}
        {project.links.length === 0 && <p className="s-meta">links land here once it ships</p>}
      </div>
    </Panel>
  )
}

function Interests({ content }: { content: SiteContent }) {
  return (
    <Panel>
      <h1>Interests</h1>
      {content.interests.map((section) => (
        <article className="s-entry" key={section.id}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          {section.links.map((l) => (
            <a className="s-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}
    </Panel>
  )
}

function NotFound({ path, navigate }: { path: string; navigate: ThemeProps['navigate'] }) {
  return (
    <Panel>
      <h1>Nothing at this address</h1>
      <p className="s-meta">{path} escaped the set.</p>
      <div className="s-actions">
        <InternalLink to="/" navigate={navigate} className="s-btn s-btn-primary">
          Back home
        </InternalLink>
      </div>
    </Panel>
  )
}
