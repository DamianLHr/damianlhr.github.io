import type { MouseEvent } from 'react'
import type { ThemeProps } from '../../shared/theme-contract'
import { routePath, TOP_LEVEL_ROUTES } from '../../shared/routes'
import './hold.css'

// `hold` — the placeholder world serving visitors until `julia` lands (PLAN Phase 2).
// Deliberately tiny: identity, socials, and proof that routing works.

export function Root({ content, route, navigate }: ThemeProps) {
  const path = routePath(route)
  const onNav = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    e.preventDefault()
    navigate(to)
  }

  return (
    <main className="hold">
      <img className="hold-pfp" src={content.profile.pfpUrl} alt="" width={96} height={96} />
      <h1>{content.profile.name}</h1>
      <p className="hold-tagline">{content.profile.tagline}</p>
      <p className="hold-status">under construction — the interesting part is on its way</p>
      <nav className="hold-sections" aria-label="Sections">
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
      {route.kind !== 'home' && (
        <p className="hold-path">
          you are at <code>{path}</code> — this page gets its real face in a later phase
        </p>
      )}
      <nav className="hold-socials" aria-label="Profiles">
        {content.profile.socials.map((s) => (
          <a key={s.url} href={s.url}>
            {s.label}
          </a>
        ))}
      </nav>
    </main>
  )
}
