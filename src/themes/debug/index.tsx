import type { MouseEvent, ReactNode } from 'react'
import type { ThemeProps } from '../../shared/theme-contract'
import type { Project } from '../../content/types'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import './debug.css'

// `debug` — the content & route inspector (PLAN Phase 1). Not a design statement:
// a QA surface proving every theme receives the full content model and that routing
// survives theme swaps. Kept honest and utilitarian: mono type, clear hierarchy.

function Nav({ route, navigate }: Pick<ThemeProps, 'route' | 'navigate'>) {
  const path = routePath(route)
  const onNav = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    e.preventDefault()
    navigate(to)
  }
  return (
    <nav aria-label="Routes">
      {TOP_LEVEL_ROUTES.map((r) => (
        <a
          key={r.path}
          href={r.path}
          aria-current={path === r.path ? 'page' : undefined}
          onClick={(e) => onNav(e, r.path)}
        >
          {r.path}
        </a>
      ))}
    </nav>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Dump({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>
}

function ProjectCard({
  project,
  navigate,
}: {
  project: Project
  navigate: ThemeProps['navigate']
}) {
  const to = `/projects/${project.slug}`
  return (
    <li>
      <a
        href={to}
        onClick={(e) => {
          e.preventDefault()
          navigate(to)
        }}
      >
        {project.title}
      </a>{' '}
      <span className="debug-dim">
        [{project.category}] {project.year ?? ''} {project.status === 'coming-soon' ? '(soon)' : ''}
      </span>
    </li>
  )
}

export function Root({ content, route, navigate }: ThemeProps) {
  return (
    <main className="debug">
      <header>
        <h1>debug — content &amp; route inspector</h1>
        <p className="debug-dim">
          Same content model every theme receives; switch themes and this route survives.
        </p>
        <Nav route={route} navigate={navigate} />
        <p className="debug-route">
          route = <code>{JSON.stringify(route)}</code>
        </p>
      </header>

      {route.kind === 'home' && (
        <>
          <Section title="profile">
            <Dump value={content.profile} />
          </Section>
          <Section title="announcements (up next)">
            <Dump value={content.announcements} />
          </Section>
          <Section title="counts">
            <Dump
              value={{
                projects: content.projects.length,
                announcements: content.announcements.length,
                educationEntries: content.cv.education.length,
                experienceEntries: content.cv.experience.length,
                interestSections: content.interests.length,
              }}
            />
          </Section>
        </>
      )}

      {route.kind === 'cv' && (
        <Section title="cv">
          <Dump value={content.cv} />
        </Section>
      )}

      {route.kind === 'projects' && (
        <Section title={`projects (${content.projects.length})`}>
          <ul>
            {content.projects.map((p) => (
              <ProjectCard key={p.slug} project={p} navigate={navigate} />
            ))}
          </ul>
        </Section>
      )}

      {route.kind === 'project' &&
        (() => {
          const project = content.projects.find((p) => p.slug === route.slug)
          return project ? (
            <Section title={`project: ${project.title}`}>
              <Dump value={project} />
            </Section>
          ) : (
            <Section title="project not found">
              <p>
                No project with slug <code>{route.slug}</code>.
              </p>
            </Section>
          )
        })()}

      {route.kind === 'interests' && (
        <Section title="interests">
          <Dump value={content.interests} />
        </Section>
      )}

      {route.kind === 'notFound' && (
        <Section title="404">
          <p>
            No route for <code>{route.path}</code>.
          </p>
        </Section>
      )}
    </main>
  )
}
