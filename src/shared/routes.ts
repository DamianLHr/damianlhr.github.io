// Routes are content, not theme (TECHNOLOGY.md §3.2): stable across every theme,
// so URLs remain shareable no matter which world the visitor lands in.

export type Route =
  | { kind: 'home' }
  | { kind: 'cv' }
  | { kind: 'projects' }
  | { kind: 'project'; slug: string }
  | { kind: 'interests' }
  | { kind: 'notFound'; path: string }

export function parseRoute(pathname: string): Route {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/') return { kind: 'home' }
  if (clean === '/cv') return { kind: 'cv' }
  if (clean === '/projects') return { kind: 'projects' }
  if (clean === '/interests') return { kind: 'interests' }
  const project = /^\/projects\/([a-z0-9-]+)$/.exec(clean)
  if (project) return { kind: 'project', slug: project[1] }
  return { kind: 'notFound', path: pathname }
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/'
    case 'cv':
      return '/cv'
    case 'projects':
      return '/projects'
    case 'project':
      return `/projects/${route.slug}`
    case 'interests':
      return '/interests'
    case 'notFound':
      return route.path
  }
}

/** Top-level pages every theme must present, in canonical order. */
export const TOP_LEVEL_ROUTES: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/cv', label: 'CV' },
  { path: '/projects', label: 'Projects' },
  { path: '/interests', label: 'Interests' },
]
