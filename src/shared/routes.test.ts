import { describe, expect, it } from 'vitest'
import { parseRoute, routePath, TOP_LEVEL_ROUTES } from './routes'

describe('parseRoute', () => {
  it('parses top-level routes', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
    expect(parseRoute('/cv')).toEqual({ kind: 'cv' })
    expect(parseRoute('/projects')).toEqual({ kind: 'projects' })
    expect(parseRoute('/interests')).toEqual({ kind: 'interests' })
  })

  it('parses project slugs', () => {
    expect(parseRoute('/projects/kill-bunny')).toEqual({ kind: 'project', slug: 'kill-bunny' })
  })

  it('tolerates trailing slashes', () => {
    expect(parseRoute('/cv/')).toEqual({ kind: 'cv' })
    expect(parseRoute('/projects/kill-bunny/')).toEqual({ kind: 'project', slug: 'kill-bunny' })
  })

  it('falls through to notFound', () => {
    expect(parseRoute('/nope')).toEqual({ kind: 'notFound', path: '/nope' })
    expect(parseRoute('/projects/UPPER')).toEqual({ kind: 'notFound', path: '/projects/UPPER' })
  })
})

describe('routePath', () => {
  it('round-trips every parseable path', () => {
    for (const path of ['/', '/cv', '/projects', '/projects/kill-bunny', '/interests']) {
      expect(routePath(parseRoute(path))).toBe(path)
    }
  })

  it('covers all top-level routes', () => {
    for (const r of TOP_LEVEL_ROUTES) {
      expect(parseRoute(r.path).kind).not.toBe('notFound')
    }
  })
})
