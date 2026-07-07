import { useCallback, useEffect, useState } from 'react'
import { content } from '../content'
import { probeCapabilities } from '../shared/capabilities'
import { getStoredThemeId, setStoredThemeId } from '../shared/prefs'
import { resolveTheme } from '../shared/resolver'
import { navigate, useRoute } from '../shared/router'
import type { ThemeDescriptor, ThemeModule } from '../shared/theme-contract'
import { themes } from '../themes/registry'
import { ThemeBoundary } from './ErrorBoundary'
import { Switcher } from './Switcher'
import './shell.css'

// The theme-independent boot shell (TECHNOLOGY.md §3.3): resolves a theme
// (?theme= → stored choice → capability probe → weight), lazy-loads it, and owns
// the switcher overlay. Content and route live here, so they survive theme swaps.

interface ActiveTheme {
  descriptor: ThemeDescriptor
  module: ThemeModule
}

function urlThemeId(): string | null {
  return new URLSearchParams(window.location.search).get('theme')
}

function stripThemeParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('theme')) return
  url.searchParams.delete('theme')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

/** Highest-weight requirements-free theme — the guaranteed floor. */
function floorTheme(excludeId?: string): ThemeDescriptor {
  return themes
    .filter((t) => Object.keys(t.requirements).length === 0 && t.id !== excludeId)
    .sort((a, b) => b.weight - a.weight)[0]
}

export function Shell() {
  const route = useRoute()
  const [active, setActive] = useState<ActiveTheme | null>(null)
  const [dead, setDead] = useState(false)

  const activate = useCallback(async (descriptor: ThemeDescriptor) => {
    const module = await descriptor.load()
    setActive({ descriptor, module })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const caps = await probeCapabilities()
      const descriptor = resolveTheme({
        descriptors: themes,
        caps,
        urlThemeId: urlThemeId(),
        storedThemeId: getStoredThemeId(),
      })
      if (!cancelled) await activate(descriptor)
    })()
    return () => {
      cancelled = true
    }
  }, [activate])

  const pick = useCallback(
    (id: string) => {
      const descriptor = themes.find((t) => t.id === id)
      if (!descriptor) return
      setStoredThemeId(id)
      stripThemeParam()
      void activate(descriptor)
    },
    [activate],
  )

  const onThemeCrash = useCallback(
    (error: unknown) => {
      console.error(`theme "${active?.descriptor.id}" crashed — kicking down`, error)
      const fallback = floorTheme(active?.descriptor.id)
      if (!fallback || fallback.id === active?.descriptor.id) {
        setDead(true)
        return
      }
      void activate(fallback)
    },
    [activate, active],
  )

  if (dead) {
    return (
      <main className="shell-dead">
        <p>Something broke badly enough that even the fallback failed.</p>
        <p>
          The work itself is safe at{' '}
          <a href="https://github.com/DamianLHr">github.com/DamianLHr</a>.
        </p>
      </main>
    )
  }

  if (!active) return null

  const { Root } = active.module
  return (
    <>
      <ThemeBoundary key={active.descriptor.id} onError={onThemeCrash}>
        <Root content={content} route={route} navigate={navigate} />
      </ThemeBoundary>
      <Switcher themes={themes} activeId={active.descriptor.id} onPick={pick} />
    </>
  )
}
