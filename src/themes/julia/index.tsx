import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import type { ThemeProps } from '../../shared/theme-contract'
import { routePath } from '../../shared/routes'
import { Cv, Home, Interests, InternalLink, NotFound, ProjectPage, ProjectsIndex } from './views'
import './julia.css'

// `julia` — the 2D-fractal floor theme, direction A "obsidian gallery" (Gate 2a):
// near-black, ember accent, Space Grotesk, real canvas-rendered Julia sets, and the
// fractal palette as the interaction language.

const NAV = [
  { to: '/cv', label: 'CV' },
  { to: '/projects', label: 'Projects' },
  { to: '/interests', label: 'Interests' },
]

export function Root({ content, route, navigate }: ThemeProps) {
  const path = routePath(route)
  return (
    <div className="julia">
      <header className="j-nav">
        <InternalLink to="/" navigate={navigate} className="j-mark">
          DH
        </InternalLink>
        <nav aria-label="Sections">
          {NAV.map((n) => (
            <InternalLink
              key={n.to}
              to={n.to}
              navigate={navigate}
              className={path.startsWith(n.to) ? 'j-nav-link j-active' : 'j-nav-link'}
            >
              {n.label}
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
      {route.kind === 'notFound' && <NotFound path={route.path} navigate={navigate} />}

      {route.kind !== 'home' && (
        <footer className="j-foot">
          <span>{content.profile.name}</span>
          <span className="j-foot-links">
            {content.profile.socials.map((s) => (
              <a key={s.url} href={s.url}>
                {s.label}
              </a>
            ))}
          </span>
        </footer>
      )}
    </div>
  )
}
