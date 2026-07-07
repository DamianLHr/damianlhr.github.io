import type { MouseEvent, ReactNode } from 'react'
import type { InterestSection, Project, SiteContent } from '../../content/types'
import type { ThemeProps } from '../../shared/theme-contract'
import { FractalCanvas } from './FractalCanvas'
import { paramsFor, type JuliaParams } from './fractal'

type Nav = ThemeProps['navigate']

// Per-route fractal identities (route-level art facets can override later).
const ROUTE_C: Record<string, JuliaParams> = {
  home: { re: -0.7269, im: 0.1889 },
  cv: { re: -0.8, im: 0.156 },
  projects: { re: 0.285, im: 0.01, span: 2.6 },
  interests: { re: -0.4, im: 0.6 },
  notFound: { re: -0.835, im: -0.2321 },
}

export function InternalLink({
  to,
  navigate,
  className,
  children,
}: {
  to: string
  navigate: Nav
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

function projectC(project: Project): JuliaParams {
  if (project.art?.fractal?.type === 'julia' && project.art.fractal.params) {
    const { re, im } = project.art.fractal.params
    if (re !== undefined && im !== undefined) return { re, im }
  }
  return paramsFor(project.slug, project.art?.seed)
}

export function Home({ content, navigate }: { content: SiteContent; navigate: Nav }) {
  const narrow = window.matchMedia('(max-width: 760px)').matches
  return (
    <section className="j-home">
      <FractalCanvas
        params={
          narrow
            ? { ...ROUTE_C.home, span: 2.7, centerX: 0.5, centerY: 0.32, angle: -0.7 }
            : { ...ROUTE_C.home, span: 2.3, centerX: 0.54, centerY: 0.46, angle: -0.7 }
        }
        live="hero"
        className="j-home-canvas"
      />
      <div className="j-home-scrim" aria-hidden="true" />
      <div className="j-home-copy j-enter">
        <p className="j-eyebrow">{content.profile.tagline}</p>
        <h1 className="j-title">
          Damyan
          <br />
          Hristov
        </h1>
        <p className="j-sub">
          Games, engines and experimental graphics. Computer Science and Engineering at TU/e,
          class of 2027.
        </p>
        <nav className="j-big-links" aria-label="Sections">
          <InternalLink to="/cv" navigate={navigate}>
            CV
          </InternalLink>
          <InternalLink to="/projects" navigate={navigate}>
            Projects
          </InternalLink>
          <InternalLink to="/interests" navigate={navigate}>
            Interests
          </InternalLink>
        </nav>
        <div className="j-socials">
          {content.profile.socials.map((s) => (
            <a key={s.url} href={s.url}>
              {s.label}
            </a>
          ))}
        </div>
      </div>
      {content.announcements.length > 0 && (
        <InternalLink to="/projects" navigate={navigate} className="j-ticker">
          <span className="j-ticker-tag">Up next</span>
          <span className="j-ticker-items">
            {content.announcements.map((a) => a.title).join('  ·  ')}
          </span>
        </InternalLink>
      )}
    </section>
  )
}

export function Cv({ content, navigate }: { content: SiteContent; navigate: Nav }) {
  const { cv } = content
  return (
    <section className="j-page j-enter">
      <header className="j-page-head">
        <h1>CV</h1>
      </header>

      <h2 className="j-h2">Education</h2>
      {cv.education.map((e) => (
        <article className="j-entry" key={e.school}>
          <h3>{e.program}</h3>
          <p className="j-meta">
            {e.school} · {e.location} · {e.start} to {e.end}
          </p>
          <ul>
            {e.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}

      <h2 className="j-h2">Experience</h2>
      {cv.experience.map((e) => (
        <article className="j-entry" key={e.company}>
          <h3>
            {e.role} · {e.company}
          </h3>
          <p className="j-meta">
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
            <a className="j-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}

      <h2 className="j-h2">Plans</h2>
      <p className="j-prose">{cv.plans}</p>

      <h2 className="j-h2">Proficiencies</h2>
      <p className="j-prose">
        {cv.proficiencies.spoken.map((s) => `${s.language} (${s.level})`).join(' · ')}
      </p>
      {[...cv.proficiencies.programming, ...cv.proficiencies.expanding].map((p) => (
        <article className="j-entry" key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.evidence}</p>
          <p className="j-meta">
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
    </section>
  )
}

const CARD_SPAN: Record<string, number> = {
  'dont-break-glass': 3,
  'kill-bunny': 3,
  'digital-twinning-suspension': 4,
  'blood-of-hedon': 2,
  'olympian-onslaught': 6,
}

const CHIP: Record<Project['category'], string> = {
  personal: 'personal',
  jam: 'game jam',
  university: 'university',
}

export function ProjectsIndex({ content, navigate }: { content: SiteContent; navigate: Nav }) {
  const released = content.projects.filter((p) => p.status === 'released')
  return (
    <section className="j-page j-page-wide j-enter">
      <header className="j-page-head">
        <h1>Projects</h1>
      </header>

      <div className="j-upnext">
        <p className="j-upnext-tag">Up next</p>
        <div className="j-upnext-items">
          {content.announcements.map((a) => (
            <article key={a.id}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="j-mosaic">
        {released.map((p) => (
          <InternalLink
            key={p.slug}
            to={`/projects/${p.slug}`}
            navigate={navigate}
            className={`j-card j-span-${CARD_SPAN[p.slug] ?? 3}`}
          >
            <FractalCanvas
              params={{ ...projectC(p), span: 2.0, centerX: 0.64, centerY: 0.42 }}
              live="hover"
              hoverHost="a"
              className="j-card-art"
            />
            <span className="j-card-scrim" aria-hidden="true" />
            <span className="j-card-body">
              <span className="j-chip">{CHIP[p.category]}</span>
              <span className="j-card-title">{p.title}</span>
              <span className="j-meta">
                {[p.year, p.event, p.role].filter(Boolean).join(' · ')}
              </span>
              <span className="j-card-summary">{p.summary}</span>
            </span>
          </InternalLink>
        ))}
      </div>
    </section>
  )
}

export function ProjectPage({
  content,
  slug,
  navigate,
}: {
  content: SiteContent
  slug: string
  navigate: Nav
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
    <section className="j-page j-enter">
      <InternalLink to="/projects" navigate={navigate} className="j-back">
        &larr; all projects
      </InternalLink>
      <header className="j-page-head">
        <h1>{project.title}</h1>
      </header>
      <FractalCanvas params={{ ...projectC(project), span: 2.1 }} live="bloom" className="j-hero" />
      <dl className="j-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="j-prose">{project.summary}</p>
      {project.team?.members && (
        <p className="j-meta">with {project.team.members.join(', ')}</p>
      )}
      <div className="j-actions">
        {project.links.map((l, i) => (
          <a key={l.url} href={l.url} className={i === 0 ? 'j-btn j-btn-primary' : 'j-btn'}>
            {l.label}
          </a>
        ))}
        {project.links.length === 0 && <p className="j-meta">links land here once it ships</p>}
      </div>
    </section>
  )
}

export function Interests({ content }: { content: SiteContent }) {
  return (
    <section className="j-page j-enter">
      <header className="j-page-head">
        <h1>Interests</h1>
      </header>
      <div className="j-interests">
        {content.interests.map((section: InterestSection, i: number) => (
          <article className="j-interest" key={section.id}>
            <FractalCanvas
              params={{ ...paramsFor(section.id, i * 3 + 1), maxIter: 90 }}
              live="bloom"
              className="j-interest-wash"
            />
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            {section.links.map((l) => (
              <a className="j-out" key={l.url} href={l.url}>
                {l.label}
              </a>
            ))}
          </article>
        ))}
      </div>
    </section>
  )
}

export function NotFound({ path, navigate }: { path: string; navigate: Nav }) {
  return (
    <section className="j-page j-enter j-404">
      <FractalCanvas params={{ ...ROUTE_C.notFound, span: 2.1 }} live="bloom" className="j-hero" />
      <h1>Nothing at this address</h1>
      <p className="j-meta">{path} escaped the set.</p>
      <InternalLink to="/" navigate={navigate} className="j-btn j-btn-primary">
        Back home
      </InternalLink>
    </section>
  )
}
