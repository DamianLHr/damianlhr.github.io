import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource/im-fell-english-sc/400.css'
import '@fontsource/im-fell-great-primer/400.css'
import '@fontsource/im-fell-great-primer/400-italic.css'
import { useMemo, type MouseEvent, type ReactNode } from 'react'
import type { ThemeProps } from '../../shared/theme-contract'
import type { Project, SiteContent } from '../../content/types'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import { buildPlate, WORLD, type City } from './plate'
import { useMapView } from './useMapView'
import './atlas.css'

// atlas — the résumé as territory (PLAN Phase 5, direction B "Iron Gall").
//
// One continent carries the whole career: EDUCATION and EXPERIENCE as provinces,
// every school, employer and shipped project as a town on habitable ground.
// Interests are an offshore archipelago; Delft is an unsurveyed coast to the
// north. Coastlines come from seeded midpoint displacement and every ridge,
// river, contour and town site is derived from one shared heightfield, so the
// country agrees with itself. The plate is bigger than the view — drag and zoom
// to traverse it.

const VIEW = { w: 1600, h: 1000 }

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
  const plate = useMemo(() => buildPlate(content), [content])
  const map = useMapView({
    worldW: WORLD.w,
    worldH: WORLD.h,
    viewW: VIEW.w,
    viewH: VIEW.h,
    maxZoom: 3.2,
  })
  const { view } = map
  const path = routePath(route)
  const home = route.kind === 'home'

  // lettering and ink are held at constant size on screen, the way an engraved
  // plate does not thicken when you lean closer to it
  const s = (n: number) => n / view.k

  const onCity = (c: City) => (e: MouseEvent) => {
    e.preventDefault()
    if (!c.slug || map.wasDrag()) return
    navigate(`/projects/${c.slug}`)
  }

  return (
    <div className="atl">
      <div className="a-plate-wrap">
        <svg
          ref={map.ref}
          className={`a-plate${map.grabbing ? ' a-grabbing' : ''}`}
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="Chart of Damyan Hristov's territories — drag to pan, scroll to zoom"
        >
          <defs>
            <filter id="a-rough" x="-4%" y="-4%" width="108%" height="108%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.022"
                numOctaves="3"
                seed="19"
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale="3"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <pattern
              id="a-hLight"
              width="9"
              height="9"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(35)"
            >
              <line x1="0" y1="0" x2="0" y2="9" stroke="#2c2218" strokeWidth="0.55" opacity="0.4" />
            </pattern>
            {/* the province border is an inland boundary — it must stop at the
                coast rather than run out into the sea */}
            <clipPath id="a-clipMain">
              <path d={plate.coastPath} />
            </clipPath>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* ---- the sea ---- */}
            <rect x="0" y="0" width={WORLD.w} height={WORLD.h} fill="none" />
            <path d={plate.stipple} fill="#2c2218" opacity="0.3" />
            {plate.shore.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#2c2218"
                strokeWidth={1.1 - i * 0.15}
                opacity={0.3 - i * 0.055}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <g filter="url(#a-rough)">
              {/* ---- land ---- */}
              <path d={plate.coastPath} fill="url(#a-hLight)" />
              {plate.islePaths.map((d, i) => (
                <path key={i} d={d} fill="url(#a-hLight)" />
              ))}

              {/* ---- relief: contours, then hachures down every slope ---- */}
              {plate.contours.map((c) => (
                <path
                  key={c.level}
                  d={c.d}
                  fill="none"
                  stroke="#2c2218"
                  strokeWidth={c.level > 0.6 ? 0.7 : 0.5}
                  opacity={0.16 + c.level * 0.2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                d={plate.hach.light}
                fill="none"
                stroke="#2c2218"
                strokeWidth="0.55"
                opacity="0.3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={plate.hach.heavy}
                fill="none"
                stroke="#2c2218"
                strokeWidth="0.75"
                opacity="0.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />

              {/* ---- rivers, engraved by discharge ---- */}
              <g
                fill="none"
                stroke="#2c2218"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              >
                <path d={plate.riv.small} strokeWidth="0.5" opacity="0.45" />
                <path d={plate.riv.mid} strokeWidth="0.9" opacity="0.62" />
                <path d={plate.riv.large} strokeWidth="1.5" opacity="0.78" />
              </g>

              {/* ---- coastline last, so it cuts everything cleanly ---- */}
              <path
                d={plate.coastPath}
                fill="none"
                stroke="#2c2218"
                strokeWidth="1.9"
                vectorEffect="non-scaling-stroke"
              />
              {plate.islePaths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="#2c2218"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              <path
                d={plate.divider}
                fill="none"
                stroke="#2c2218"
                strokeWidth="1.1"
                strokeDasharray="9 6"
                opacity="0.7"
                vectorEffect="non-scaling-stroke"
                clipPath="url(#a-clipMain)"
              />
              <path
                d={plate.terra}
                fill="none"
                stroke="#a5301b"
                strokeWidth="1.6"
                strokeDasharray="13 9"
                opacity="0.85"
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* ---- summits ---- */}
            <g stroke="#2c2218" fill="none" vectorEffect="non-scaling-stroke">
              {plate.summits.map((p, i) => {
                const r = 9 + p.h * 13
                return (
                  <path
                    key={i}
                    d={`M${p.at.x - r} ${p.at.y + r * 0.42}l${r * 0.62} ${-r * 0.95}l${r * 0.38} ${r * 0.3}l${r * 0.42} ${-r * 0.5}l${r * 0.58} ${r * 1.15}Z`}
                    strokeWidth="0.9"
                    opacity="0.75"
                  />
                )
              })}
            </g>

            {/* ---- towns ---- */}
            {plate.cities.map((c) => (
              <g
                key={c.name + c.at.x}
                className={c.slug ? 'a-town a-town-link' : 'a-town'}
                onClick={onCity(c)}
                role={c.slug ? 'link' : undefined}
                tabIndex={c.slug ? 0 : undefined}
                onKeyDown={(e) => {
                  if (c.slug && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    navigate(`/projects/${c.slug}`)
                  }
                }}
              >
                {c.rank === 0 ? (
                  <>
                    <circle cx={c.at.x} cy={c.at.y} r={s(4.4)} fill="#2c2218" />
                    <circle
                      cx={c.at.x}
                      cy={c.at.y}
                      r={s(7.4)}
                      fill="none"
                      stroke="#2c2218"
                      strokeWidth="0.9"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : (
                  <rect
                    x={c.at.x - s(3.6)}
                    y={c.at.y - s(3.6)}
                    width={s(7.2)}
                    height={s(7.2)}
                    fill="#a5301b"
                    stroke="#2c2218"
                    strokeWidth="0.8"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <text
                  className={c.rank === 0 ? 'a-lbl a-lbl-city' : 'a-lbl a-lbl-town'}
                  x={c.at.x + s(11)}
                  y={c.at.y + s(4.5)}
                  fontSize={s(c.rank === 0 ? 15 : 13)}
                >
                  {c.name}
                </text>
              </g>
            ))}

            {/* ---- lettering ---- */}
            <text
              className="a-lbl a-lbl-region"
              x={plate.regions.north.x}
              y={plate.regions.north.y}
              textAnchor="middle"
              fontSize={s(30)}
            >
              EDUCATION
            </text>
            <text
              className="a-lbl a-lbl-region"
              x={plate.regions.south.x}
              y={plate.regions.south.y}
              textAnchor="middle"
              fontSize={s(30)}
            >
              EXPERIENCE
            </text>
            <text
              className="a-lbl a-lbl-terra"
              x={1260}
              y={s(26) + 150}
              textAnchor="middle"
              fontSize={s(24)}
            >
              Terra Incognita
            </text>
            <text
              className="a-lbl a-lbl-tiny"
              x={1260}
              y={s(26) + 178}
              textAnchor="middle"
              fontSize={s(14)}
            >
              — reported, not yet surveyed —
            </text>
            <text className="a-lbl a-lbl-sea" x={330} y={1430} textAnchor="middle" fontSize={s(34)}>
              Mare Incognitum
            </text>
            {plate.isles.map(({ t, section, label }) => (
              <text
                key={t.id}
                className="a-lbl a-lbl-isle"
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fontSize={s(15)}
              >
                {section.title}
              </text>
            ))}
          </g>
        </svg>

        <div className="a-neatline" />

        <nav className="a-index" aria-label="Charts">
          <p className="a-index-tag">CHARTS</p>
          {TOP_LEVEL_ROUTES.map((r) => (
            <Link key={r.path} to={r.path} navigate={navigate} current={path === r.path}>
              {r.label}
            </Link>
          ))}
        </nav>

        <div className="a-compass" aria-hidden="true">
          <svg viewBox="-60 -60 120 120">
            <circle r="40" fill="none" stroke="#2c2218" strokeWidth="0.9" opacity="0.55" />
            <line
              x1="-52"
              y1="0"
              x2="52"
              y2="0"
              stroke="#2c2218"
              strokeWidth="0.9"
              opacity="0.55"
            />
            <line
              x1="0"
              y1="-52"
              x2="0"
              y2="52"
              stroke="#2c2218"
              strokeWidth="0.9"
              opacity="0.55"
            />
            <path d="M 0 -50 L 7 -14 L 0 -6 L -7 -14 Z" fill="#a5301b" />
          </svg>
        </div>

        <div className="a-tools">
          <button type="button" onClick={() => map.zoomBy(1.45)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => map.zoomBy(1 / 1.45)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={map.reset} aria-label="Fit the whole chart">
            FIT
          </button>
          <span className="a-scale">
            <i style={{ width: `${Math.round(60 * (view.k / map.fit))}px` }} />
            {(view.k / map.fit).toFixed(1)}×
          </span>
        </div>

        {home ? (
          <Cartouche content={content} />
        ) : (
          <div className="a-folio a-ink-in" key={path}>
            {route.kind === 'cv' && <Cv content={content} navigate={navigate} />}
            {route.kind === 'projects' && <Projects content={content} navigate={navigate} />}
            {route.kind === 'project' && (
              <ProjectSheet content={content} slug={route.slug} navigate={navigate} />
            )}
            {route.kind === 'interests' && <Interests content={content} />}
            {route.kind === 'notFound' && <NotFound path={path} navigate={navigate} />}
          </div>
        )}

        {home && <Legend />}

        {home && content.announcements.length > 0 && (
          <Link to="/projects" navigate={navigate} className="a-ticker">
            <b>IN PREPARATION</b> {content.announcements.map((a) => a.title).join(' · ')}
          </Link>
        )}
      </div>

      <svg className="a-grain" aria-hidden="true">
        <filter id="a-grainF">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="12" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#a-grainF)" opacity="0.2" />
      </svg>
    </div>
  )
}

function Cartouche({ content }: { content: SiteContent }) {
  return (
    <section className="a-cartouche a-ink-in">
      <p className="a-eyebrow">TABULA I</p>
      <h1 className="a-title">
        Damyan Hristov
        <em>his territories, described</em>
      </h1>
      <p className="a-lede">
        <span className="a-drop">G</span>ames, engines and experimental graphics. One country holds
        the whole account: the provinces of study and of labour, every work set down as a town upon
        it, the isles of idle hours offshore, and — ruled in red — the coast toward Delft.
      </p>
      <div className="a-socials">
        {content.profile.socials.map((s) => (
          <a key={s.url} href={s.url}>
            {s.label}
          </a>
        ))}
      </div>
      <p className="a-imprint">drag to travel · scroll to draw nearer</p>
    </section>
  )
}

function Legend() {
  return (
    <aside className="a-legend a-ink-in">
      <h2>EXPLANATIO</h2>
      <div className="a-legend-row">
        <svg width="42" height="15" viewBox="0 0 42 15">
          <circle cx="10" cy="8" r="3.4" fill="#2c2218" />
          <circle cx="10" cy="8" r="6" fill="none" stroke="#2c2218" strokeWidth="0.9" />
        </svg>
        <span>Seat of study or of labour</span>
      </div>
      <div className="a-legend-row">
        <svg width="42" height="15" viewBox="0 0 42 15">
          <rect
            x="6"
            y="4"
            width="8"
            height="8"
            fill="#a5301b"
            stroke="#2c2218"
            strokeWidth="0.8"
          />
        </svg>
        <span>A work shipped — press to read its account</span>
      </div>
      <div className="a-legend-row">
        <svg width="42" height="15" viewBox="0 0 42 15">
          <path
            d="M2 12 C10 12, 12 4, 20 5 C28 6, 32 3, 40 3"
            fill="none"
            stroke="#2c2218"
            strokeWidth="1.2"
          />
        </svg>
        <span>Rivers, drawn as the ground sheds them</span>
      </div>
      <div className="a-legend-row">
        <svg width="42" height="15" viewBox="0 0 42 15">
          <path
            d="M2 11 C12 9, 14 5, 24 4 M4 14 C14 12, 18 8, 30 7"
            fill="none"
            stroke="#2c2218"
            strokeWidth="0.6"
            opacity="0.7"
          />
        </svg>
        <span>Contour &amp; hachure: the lie of the land</span>
      </div>
      <div className="a-legend-row">
        <svg width="42" height="15" viewBox="0 0 42 15">
          <line
            x1="0"
            y1="8"
            x2="42"
            y2="8"
            stroke="#a5301b"
            strokeWidth="1.6"
            strokeDasharray="7 5"
          />
        </svg>
        <span>Reported, unsurveyed — the Delft passage</span>
      </div>
      <p className="a-legend-note">
        Heights, waters and town sites are computed from one survey of the ground, not drawn by
        hand; the coast is measured at the scale you view it.
      </p>
    </aside>
  )
}

function Cv({ content, navigate }: { content: SiteContent; navigate: ThemeProps['navigate'] }) {
  const { cv } = content
  return (
    <>
      <h1>The Provinces</h1>
      <p className="a-folio-sub">a description of study and of labour</p>

      <h2 className="a-h2">EDUCATION</h2>
      {cv.education.map((e) => (
        <article className="a-entry" key={e.school}>
          <h3>{e.program}</h3>
          <p className="a-meta">
            {e.school} · {e.location} · {e.start} to {e.end}
          </p>
          <ul>
            {e.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}

      <h2 className="a-h2">EXPERIENCE</h2>
      {cv.experience.map((e) => (
        <article className="a-entry" key={e.company}>
          <h3>
            {e.role} · {e.company}
          </h3>
          <p className="a-meta">
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
            <a className="a-out" key={l.url} href={l.url}>
              {l.label}
            </a>
          ))}
        </article>
      ))}

      <h2 className="a-h2">TERRA INCOGNITA</h2>
      <p className="a-prose">{cv.plans}</p>

      <h2 className="a-h2">PROFICIENCIES</h2>
      <p className="a-prose">
        {cv.proficiencies.spoken.map((sp) => `${sp.language} (${sp.level})`).join(' · ')}
      </p>
      {[...cv.proficiencies.programming, ...cv.proficiencies.expanding].map((p) => (
        <article className="a-entry" key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.evidence}</p>
          <p className="a-meta">
            charted by:{' '}
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
  personal: 'PERSONAL',
  jam: 'GAME JAM',
  university: 'UNIVERSITY',
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
      <h1>The Towns</h1>
      <p className="a-folio-sub">every work set down upon the country</p>

      {content.announcements.length > 0 && (
        <>
          <h2 className="a-h2">IN PREPARATION</h2>
          {content.announcements.map((a) => (
            <article className="a-entry" key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
        </>
      )}

      <h2 className="a-h2">SURVEYED</h2>
      <div className="a-roll">
        {released.map((p, i) => (
          <Link key={p.slug} to={`/projects/${p.slug}`} navigate={navigate}>
            <span className="a-roll-no">
              TOWN {String(i + 1).padStart(2, '0')} · {CHIP[p.category]}
            </span>
            <span className="a-roll-title">{p.title}</span>
            <span className="a-roll-sum">{p.summary}</span>
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
      <Link to="/projects" navigate={navigate} className="a-back">
        ← back to the towns
      </Link>
      <h1>{project.title}</h1>
      <p className="a-folio-sub">{CHIP[project.category].toLowerCase()}</p>
      <dl className="a-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="a-prose">{project.summary}</p>
      {project.team?.members && <p className="a-meta">with {project.team.members.join(', ')}</p>}
      <div className="a-actions">
        {project.links.map((l) => (
          <a key={l.url} href={l.url} className="a-btn">
            {l.label}
          </a>
        ))}
        {project.links.length === 0 && <p className="a-meta">links land here once it ships</p>}
      </div>
    </>
  )
}

function Interests({ content }: { content: SiteContent }) {
  return (
    <>
      <h1>The Isles</h1>
      <p className="a-folio-sub">what lies offshore of the working country</p>
      {content.interests.map((section) => (
        <article className="a-entry" key={section.id}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          {section.links.map((l) => (
            <a className="a-out" key={l.url} href={l.url}>
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
      <h1>Off the Plate</h1>
      <p className="a-folio-sub">no such territory was surveyed</p>
      <p className="a-prose">
        <code>{path}</code> lies beyond the neatline.
      </p>
      <div className="a-actions">
        <Link to="/" navigate={navigate} className="a-btn">
          RETURN TO THE CHART
        </Link>
      </div>
    </>
  )
}
